/**
 * Brique 97 — Webhook Event Publisher
 *
 * Publishes events to webhook queue for delivery to merchants/users
 */

import { pool } from '../db';

export type EventType =
  | 'client_token.created'
  | 'payment_method.created'
  | 'payment_method.revoked'
  | 'payment_method.expired'
  | 'payment_method.used'
  | 'charge.created'
  | 'charge.succeeded'
  | 'charge.failed';

/**
 * Publish an event to the webhook queue
 */
export async function publishEvent(
  tenantType: string,
  tenantId: string,
  eventType: EventType,
  payload: Record<string, any>
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO tokenization_events (
        event_type,
        tenant_type,
        tenant_id,
        payment_method_id,
        payload
      ) VALUES ($1, $2, $3, $4, $5)`,
      [eventType, tenantType, tenantId, payload.id || null, payload]
    );

    console.log(`Event published: ${eventType} for ${tenantType}:${tenantId}`);
  } catch (error) {
    console.error('Failed to publish event:', error);
    // Don't throw - events are best-effort
  }
}

/**
 * Process pending webhook events (called by worker)
 */
export async function processWebhookEvents(batchSize: number = 100): Promise<number> {
  try {
    // Fetch unprocessed events
    const { rows } = await pool.query(
      `SELECT * FROM tokenization_events
       WHERE processed = false
       ORDER BY created_at ASC
       LIMIT $1`,
      [batchSize]
    );

    let processedCount = 0;

    for (const event of rows) {
      try {
        // TODO: Send HTTP request to webhook endpoint
        // For now, just mark as processed
        await pool.query(
          `UPDATE tokenization_events
           SET processed = true, processed_at = now()
           WHERE id = $1`,
          [event.id]
        );

        processedCount++;
      } catch (error) {
        console.error(`Failed to process event ${event.id}:`, error);

        // Increment retry count
        await pool.query(
          `UPDATE tokenization_events
           SET retry_count = retry_count + 1
           WHERE id = $1`,
          [event.id]
        );
      }
    }

    return processedCount;
  } catch (error) {
    console.error('Failed to process webhook events:', error);
    return 0;
  }
}
