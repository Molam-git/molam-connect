import { pool } from "./db";

export interface OutboxItem {
    event_id: string;
    user_id: number;
    event_type: string;
    channel: string;
    lang: string;
    currency: string;
    payload: any;
    rendered_subject?: string;
    rendered_body: string;
}

export async function insertOutbox(item: OutboxItem) {
    const query = `
    INSERT INTO notification_outbox 
    (event_id, user_id, event_type, channel, lang, currency, payload, rendered_subject, rendered_body)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (event_id, user_id, channel) DO NOTHING
  `;

    await pool.query(query, [
        item.event_id,
        item.user_id,
        item.event_type,
        item.channel,
        item.lang,
        item.currency,
        JSON.stringify(item.payload),
        item.rendered_subject,
        item.rendered_body
    ]);
}

export async function dequeueDueOutbox(channel: string, limit: number = 100) {
    const query = `
    UPDATE notification_outbox 
    SET status = 'processing', attempt_count = attempt_count + 1,
        updated_at = now(), next_attempt_at = now() + INTERVAL '1 minute' * POWER(2, attempt_count)
    WHERE id IN (
      SELECT id FROM notification_outbox 
      WHERE channel = $1 AND status IN ('queued', 'failed') 
        AND next_attempt_at <= now()
      ORDER BY created_at 
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;

    const { rows } = await pool.query(query, [channel, limit]);
    return rows;
}

export async function markSent(id: number) {
    await pool.query(
        'UPDATE notification_outbox SET status = $1, updated_at = now() WHERE id = $2',
        ['sent', id]
    );
}

export async function markFailed(id: number, nextAttemptAt: Date) {
    await pool.query(
        'UPDATE notification_outbox SET status = $1, next_attempt_at = $2, updated_at = now() WHERE id = $3',
        ['failed', nextAttemptAt, id]
    );
}

export async function recordDelivery(
    outboxId: number,
    provider: string,
    providerMsgId: string | undefined,
    status: string,
    error?: string
) {
    await pool.query(
        `INSERT INTO notification_deliveries 
     (outbox_id, provider, provider_msg_id, status, error)
     VALUES ($1, $2, $3, $4, $5)`,
        [outboxId, provider, providerMsgId, status, error]
    );
}