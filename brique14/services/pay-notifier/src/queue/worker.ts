import { q } from "../db.js";
import { sendPush } from "../channels/push.js";
import { sendSms } from "../channels/sms.js";
import { sendEmail } from "../channels/email.js";
import { sendUssdFlash } from "../channels/ussd.js";
import { sendWhatsapp } from "../channels/whatsapp.js";
import { OutboundWebhookService } from "../webhooks/outbound.js";
import { NotificationMetrics } from "../metrics.js";

// Define the NotificationRecord interface
interface NotificationRecord {
    id: string;
    user_id: string;
    channel: string;
    title: string | null;
    message: string;
    retries: number | null;
    type: string;
    priority: string;
}

async function processOne(): Promise<boolean> {
    const { rows } = await q<NotificationRecord>(`
    UPDATE molam_notifications
    SET status = 'processing'
    WHERE id IN (
      SELECT id FROM molam_notifications
      WHERE status = 'queued'
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, user_id, channel, title, message, retries, type, priority;
  `);

    if (!rows.length) return false;

    const notification = rows[0];

    try {
        let result;

        switch (notification.channel) {
            case 'push':
                result = await sendPush(notification.user_id, notification.title || '', notification.message);
                break;
            case 'sms':
                result = await sendSms(notification.user_id, notification.message);
                break;
            case 'email':
                result = await sendEmail(notification.user_id, notification.title || '', notification.message);
                break;
            case 'ussd':
                result = await sendUssdFlash(notification.user_id, notification.message);
                break;
            case 'whatsapp':
                result = await sendWhatsapp(notification.user_id, notification.message);
                break;
            default:
                throw new Error(`unknown_channel: ${notification.channel}`);
        }

        if (result.success) {
            await q(
                `UPDATE molam_notifications SET status='sent', sent_at=now() WHERE id=$1`,
                [notification.id]
            );
            await q(
                `INSERT INTO notif_audit_wal (notif_id, event, details) VALUES ($1, 'sent', $2::jsonb)`,
                [notification.id, JSON.stringify(result)]
            );

            // Notify webhooks of successful delivery
            await OutboundWebhookService.notifyWebhooks(notification.id, 'sent');
            NotificationMetrics.recordSent(notification.channel, notification.type);
        } else {
            throw new Error(`channel_delivery_failed: ${notification.channel}`);
        }

        return true;
    } catch (error: any) {
        const retries = (notification.retries || 0) + 1;
        const maxRetries = 5;

        if (retries >= maxRetries) {
            // Final failure
            await q(
                `UPDATE molam_notifications SET status='failed', retries=$2 WHERE id=$1`,
                [notification.id, retries]
            );
            await q(
                `INSERT INTO notif_audit_wal (notif_id, event, details) VALUES ($1, 'failed', $2::jsonb)`,
                [notification.id, JSON.stringify({ error: String(error), final: true })]
            );

            // Notify webhooks of failure
            await OutboundWebhookService.notifyWebhooks(notification.id, 'failed');
            NotificationMetrics.recordFailed(notification.channel, notification.type);
        } else {
            // Exponential backoff
            const backoffSec = Math.min(3600, Math.pow(2, retries) * 5);
            await q(
                `UPDATE molam_notifications SET status='queued', retries=$2 WHERE id=$1`,
                [notification.id, retries]
            );
            await q(
                `INSERT INTO notif_audit_wal (notif_id, event, details) VALUES ($1, 'retry_scheduled', $2::jsonb)`,
                [notification.id, JSON.stringify({ error: String(error), retry: retries, backoff_sec: backoffSec })]
            );

            // Wait before next retry
            await new Promise(resolve => setTimeout(resolve, backoffSec * 1000));
        }

        return true;
    }
}

export async function runWorkerForever(): Promise<void> {
    console.log("Notification worker started");

    while (true) {
        try {
            const didWork = await processOne();
            if (!didWork) {
                // No work available, wait before checking again
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error("Worker error:", error);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retrying on error
        }
    }
}