/**
 * BRIQUE 144 — Notification Producer
 * Enqueues notifications with idempotency support
 */
import { pool } from "./db";

export interface NotificationPayload {
  tenant_type: string;
  tenant_id?: string;
  user_id?: string;
  target: {
    email?: string;
    phone?: string;
    push_tokens?: string[];
  };
  type: string;
  template_key: string;
  template_lang?: string;
  params?: Record<string, any>;
  idempotency_key?: string;
  created_by?: string;
}

export async function enqueueNotification(payload: NotificationPayload) {
  // Check idempotency
  if (payload.idempotency_key) {
    const { rows } = await pool.query(
      `SELECT id FROM notifications WHERE idempotency_key=$1 LIMIT 1`,
      [payload.idempotency_key]
    );
    if (rows.length) {
      console.log(`Notification already enqueued: ${rows[0].id}`);
      return { id: rows[0].id, duplicate: true };
    }
  }

  const query = `
    INSERT INTO notifications(
      tenant_type, tenant_id, user_id, target, type,
      template_key, template_lang, params, idempotency_key
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
  `;

  const values = [
    payload.tenant_type,
    payload.tenant_id || null,
    payload.user_id || null,
    JSON.stringify(payload.target),
    payload.type,
    payload.template_key,
    payload.template_lang || 'en',
    JSON.stringify(payload.params || {}),
    payload.idempotency_key || null
  ];

  const { rows } = await pool.query(query, values);

  // Optionally publish to Kafka/Redis pubsub here
  console.log(`Notification enqueued: ${rows[0].id}`);

  return { id: rows[0].id, duplicate: false };
}
