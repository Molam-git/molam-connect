import { pool } from "../db";

export async function createAuditEvent(
    payoutId: string,
    eventType: string,
    payload?: any,
    actor?: string
) {
    await pool.query(
        "INSERT INTO payout_events (payout_id, event_type, payload, actor) VALUES ($1, $2, $3, $4)",
        [payoutId, eventType, JSON.stringify(payload || {}), actor]
    );
}