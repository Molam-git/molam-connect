import { pool } from '../utils/db';
import fetch from 'node-fetch';

const WEBHOOKS_URL = process.env.WEBHOOKS_URL || 'http://localhost:8045';
const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_URL || 'http://localhost:8046';

interface NotificationPreference {
  id: string;
  merchant_id: string;
  event_type: string;
  channels: string[];
  threshold: any;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface SetPreferenceInput {
  merchantId: string;
  eventType: 'chargeback' | 'high_risk_payment' | 'blacklist_hit' | 'velocity_exceeded' | 'evidence_due_soon';
  channels: ('webhook' | 'email' | 'slack')[];
  threshold?: any;
  enabled?: boolean;
  actorId?: string;
}

/**
 * Set notification preference for merchant
 */
export async function setPreference(input: SetPreferenceInput): Promise<NotificationPreference> {
  const { merchantId, eventType, channels, threshold = {}, enabled = true, actorId } = input;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<NotificationPreference>(
      `INSERT INTO merchant_notifications (merchant_id, event_type, channels, threshold, enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (merchant_id, event_type)
       DO UPDATE SET channels = EXCLUDED.channels, threshold = EXCLUDED.threshold, enabled = EXCLUDED.enabled, updated_at = NOW()
       RETURNING *`,
      [merchantId, eventType, JSON.stringify(channels), JSON.stringify(threshold), enabled]
    );

    const pref = rows[0];

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['notification_preference', pref.id, 'set_preference', actorId, JSON.stringify({ eventType, channels, enabled }), merchantId]
    );

    await client.query('COMMIT');

    return pref;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all notification preferences for merchant
 */
export async function getPreferences(merchantId: string): Promise<NotificationPreference[]> {
  const { rows } = await pool.query<NotificationPreference>(
    'SELECT * FROM merchant_notifications WHERE merchant_id = $1 ORDER BY event_type ASC',
    [merchantId]
  );
  return rows;
}

/**
 * Send fraud alert to merchant via configured channels
 */
export async function sendAlert(
  merchantId: string,
  eventType: string,
  payload: any
): Promise<void> {
  // Get preferences
  const { rows } = await pool.query<NotificationPreference>(
    `SELECT * FROM merchant_notifications WHERE merchant_id = $1 AND event_type = $2 AND enabled = true`,
    [merchantId, eventType]
  );

  if (rows.length === 0) {
    console.log(`[NotificationsService] No enabled preferences for ${merchantId}:${eventType}`);
    return;
  }

  const pref = rows[0];
  const channels = JSON.parse(pref.channels as any);

  // Check threshold if configured
  const threshold = JSON.parse(pref.threshold as any);
  if (threshold.min_amount && payload.amount < threshold.min_amount) {
    console.log(`[NotificationsService] Amount below threshold, skipping alert`);
    return;
  }

  // Send to each channel
  const promises: Promise<any>[] = [];

  if (channels.includes('webhook')) {
    promises.push(sendWebhook(merchantId, eventType, payload));
  }

  if (channels.includes('email')) {
    promises.push(sendEmail(merchantId, eventType, payload));
  }

  if (channels.includes('slack')) {
    promises.push(sendSlack(merchantId, eventType, payload));
  }

  await Promise.allSettled(promises);
}

/**
 * Send webhook notification
 */
async function sendWebhook(merchantId: string, eventType: string, payload: any): Promise<void> {
  try {
    await fetch(`${WEBHOOKS_URL}/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: merchantId,
        event_type: `fraud.${eventType}`,
        payload,
      }),
    });
    console.log(`[NotificationsService] Webhook sent: ${eventType}`);
  } catch (error) {
    console.error(`[NotificationsService] Webhook failed:`, error);
  }
}

/**
 * Send email notification
 */
async function sendEmail(merchantId: string, eventType: string, payload: any): Promise<void> {
  try {
    // Fetch merchant email from Molam ID
    const emailResponse = await fetch(`${process.env.MOLAM_ID_URL}/api/merchants/${merchantId}`);
    const merchant = await emailResponse.json() as { email: string };

    await fetch(`${NOTIFICATIONS_URL}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: merchant.email,
        subject: `Fraud Alert: ${eventType}`,
        template: 'fraud_alert',
        data: payload,
      }),
    });
    console.log(`[NotificationsService] Email sent: ${eventType}`);
  } catch (error) {
    console.error(`[NotificationsService] Email failed:`, error);
  }
}

/**
 * Send Slack notification
 */
async function sendSlack(merchantId: string, eventType: string, payload: any): Promise<void> {
  try {
    // Fetch Slack webhook URL from merchant config
    const { rows } = await pool.query(
      `SELECT slack_webhook_url FROM merchant_config WHERE merchant_id = $1`,
      [merchantId]
    );

    if (rows.length === 0 || !rows[0].slack_webhook_url) {
      console.log(`[NotificationsService] No Slack webhook configured for ${merchantId}`);
      return;
    }

    const webhookUrl = rows[0].slack_webhook_url;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 Fraud Alert: ${eventType}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Fraud Alert*\n*Type:* ${eventType}\n*Amount:* ${payload.amount || 'N/A'}\n*Customer:* ${payload.customer_id || 'N/A'}`,
            },
          },
        ],
      }),
    });
    console.log(`[NotificationsService] Slack sent: ${eventType}`);
  } catch (error) {
    console.error(`[NotificationsService] Slack failed:`, error);
  }
}

/**
 * Test notification channel
 */
export async function testChannel(
  merchantId: string,
  channel: 'webhook' | 'email' | 'slack'
): Promise<{ success: boolean; message: string }> {
  const testPayload = {
    test: true,
    merchant_id: merchantId,
    timestamp: new Date().toISOString(),
  };

  try {
    if (channel === 'webhook') {
      await sendWebhook(merchantId, 'test', testPayload);
    } else if (channel === 'email') {
      await sendEmail(merchantId, 'test', testPayload);
    } else if (channel === 'slack') {
      await sendSlack(merchantId, 'test', testPayload);
    }

    return { success: true, message: `Test ${channel} notification sent successfully` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
