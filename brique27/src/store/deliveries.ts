import { pool } from "./db";

export async function recordDelivery(
    outboxId: number,
    provider: string,
    providerMsgId: string | undefined,
    status: string,
    error?: string
) {
    const query = `
    INSERT INTO notification_deliveries 
    (outbox_id, provider, provider_msg_id, status, error)
    VALUES ($1, $2, $3, $4, $5)
  `;

    await pool.query(query, [outboxId, provider, providerMsgId, status, error]);
}

export async function getDeliveryStats(channel: string, hours: number = 24) {
    const query = `
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
      AVG(CASE WHEN status = 'sent' THEN EXTRACT(EPOCH FROM (d.created_at - o.created_at)) END) as avg_delivery_time_seconds
    FROM notification_deliveries d
    JOIN notification_outbox o ON d.outbox_id = o.id
    WHERE o.channel = $1 AND d.created_at >= NOW() - INTERVAL '${hours} hours'
  `;

    const { rows } = await pool.query(query, [channel]);
    return rows[0];
}