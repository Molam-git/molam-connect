// ============================================================================
// Brique 45 - Webhooks Industriels
// Event Publisher & Delivery Planner
// ============================================================================

import { randomUUID } from "crypto";
import { pool } from "../utils/db";

/**
 * Publish an event and create deliveries for subscribed endpoints
 */
export async function publishEvent(
  tenantType: string,
  tenantId: string,
  type: string,
  data: any
): Promise<{ eventId: string }> {
  const eventId = randomUUID();
  const now = new Date();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Insert event (immutable)
    await client.query(
      `INSERT INTO webhook_events(id, tenant_type, tenant_id, type, data, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [eventId, tenantType, tenantId, type, data, now]
    );

    // Find subscribed endpoints for this tenant and event type
    const { rows: endpoints } = await client.query(
      `SELECT e.id FROM webhook_endpoints e
       JOIN webhook_subscriptions s ON s.endpoint_id=e.id
       WHERE e.status='active'
         AND e.tenant_type=$1
         AND e.tenant_id=$2
         AND s.event_type=$3`,
      [tenantType, tenantId, type]
    );

    // Create deliveries (pending)
    for (const ep of endpoints) {
      await client.query(
        `INSERT INTO webhook_deliveries(event_id, endpoint_id, status, next_attempt_at)
         VALUES ($1,$2,'pending', now()) ON CONFLICT DO NOTHING`,
        [eventId, ep.id]
      );
    }

    await client.query("COMMIT");

    console.log(`Published event ${eventId} (${type}) with ${endpoints.length} deliveries`);

    return { eventId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Publish multiple events in a batch
 */
export async function publishEventsBatch(events: Array<{
  tenantType: string;
  tenantId: string;
  type: string;
  data: any;
}>): Promise<{ eventIds: string[] }> {
  const eventIds: string[] = [];

  for (const event of events) {
    const { eventId } = await publishEvent(
      event.tenantType,
      event.tenantId,
      event.type,
      event.data
    );
    eventIds.push(eventId);
  }

  return { eventIds };
}
