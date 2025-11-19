/**
 * BRIQUE 144 — Dispatch Worker
 * Processes notification queue with exponential backoff and DLQ
 */
import { pool } from "./db";
import { resolveTemplate, renderTemplate } from "./templating";
import { pickProvider } from "./provider-selection";
import { sendEmail } from "./providers/email";
import { sendSms } from "./providers/sms";
import { sendPush, initializeFirebase } from "./providers/push";

// Exponential backoff schedule (milliseconds)
const BACKOFF = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
const MAX_ATTEMPTS = BACKOFF.length;

export async function tickOnce() {
  // Lock a batch of pending notifications using FOR UPDATE SKIP LOCKED
  const { rows: batch } = await pool.query(
    `UPDATE notifications SET status='delivering', updated_at=now()
     WHERE id IN (
       SELECT id FROM notifications
       WHERE status='pending' AND next_attempt_at <= now()
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 50
     )
     RETURNING *`
  );

  console.log(`Processing ${batch.length} notifications`);

  for (const n of batch) {
    try {
      // Resolve template
      const template = await resolveTemplate({
        tenant_type: n.tenant_type,
        tenant_id: n.tenant_id,
        key: n.template_key,
        lang: n.template_lang || 'en'
      });

      const rendered = renderTemplate(template, n.params || {});
      const target = typeof n.target === 'string' ? JSON.parse(n.target) : n.target;

      // Send via appropriate channels
      if (target.email) {
        const provider = await pickProvider('smtp', n.tenant_type, n.tenant_id);
        await sendEmail(provider, {
          to: target.email,
          subject: rendered.subject || '',
          bodyText: rendered.bodyText || '',
          bodyHtml: rendered.bodyHtml || '',
          notificationId: n.id
        });
      }

      if (target.phone) {
        const provider = await pickProvider('sms', n.tenant_type, n.tenant_id);
        await sendSms(provider, {
          to: target.phone,
          text: rendered.bodyText || rendered.subject || '',
          notificationId: n.id
        });
      }

      if (target.push_tokens && target.push_tokens.length > 0) {
        const provider = await pickProvider('fcm', n.tenant_type, n.tenant_id);
        await sendPush(provider, {
          tokens: target.push_tokens,
          title: rendered.subject || '',
          body: rendered.bodyText || '',
          data: n.params || {},
          notificationId: n.id
        });
      }

      // Mark as sent
      await pool.query(
        `UPDATE notifications SET status='sent', updated_at=now() WHERE id=$1`,
        [n.id]
      );

      console.log(`✅ Notification sent: ${n.id}`);
    } catch (err: any) {
      const attempts = (n.attempts || 0) + 1;
      const errMsg = err.message || 'send_error';

      console.error(`❌ Notification failed (attempt ${attempts}): ${n.id}`, errMsg);

      if (attempts > MAX_ATTEMPTS) {
        // Quarantine
        await pool.query(
          `UPDATE notifications SET status='quarantined', attempts=$2, last_error=$3, updated_at=now()
           WHERE id=$1`,
          [n.id, attempts, errMsg]
        );

        await pool.query(
          `INSERT INTO notification_logs(notification_id, channel, provider, provider_ref, status, payload)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [n.id, 'system', 'dlq', null, 'quarantined', JSON.stringify({ error: errMsg })]
        );

        console.log(`🚨 Notification quarantined: ${n.id}`);
      } else {
        // Retry with exponential backoff
        const backoffMs = BACKOFF[attempts - 1];
        await pool.query(
          `UPDATE notifications
           SET status='pending', attempts=$2, last_error=$3,
               next_attempt_at=now() + interval '${backoffMs} milliseconds',
               updated_at=now()
           WHERE id=$1`,
          [n.id, attempts, errMsg]
        );

        console.log(`🔄 Notification will retry in ${backoffMs}ms: ${n.id}`);
      }
    }
  }

  return batch.length;
}

// Worker loop
export async function runWorker() {
  console.log('🚀 Dispatch worker started');

  // Initialize Firebase on startup
  await initializeFirebase();

  while (true) {
    try {
      const processed = await tickOnce();
      if (processed === 0) {
        // No work, sleep for a bit
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (err: any) {
      console.error('Worker error:', err.message);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

// Run if executed directly
if (require.main === module) {
  runWorker().catch(err => {
    console.error('Fatal worker error:', err);
    process.exit(1);
  });
}
