/**
 * Brique 51 - Refunds & Reversals
 * Event Publisher (placeholder for webhook integration)
 */

import { pool } from "../utils/db.js";
import crypto from "crypto";

/**
 * Publish event to webhook system
 * In production: integrate with Brique 45 (Webhooks)
 */
export async function publishEvent(
  tenantType: string | null,
  tenantId: string | null,
  type: string,
  data: any
): Promise<void> {
  try {
    const id = crypto.randomUUID();

    // Check if webhook_events table exists
    const { rows } = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'webhook_events')`
    );

    if (rows[0].exists) {
      await pool.query(
        `INSERT INTO webhook_events(id, tenant_type, tenant_id, type, data, created_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [id, tenantType, tenantId, type, data]
      );
    } else {
      // Fallback: log to console
      console.log("[Event]", { id, tenantType, tenantId, type, data });
    }
  } catch (err) {
    console.error("Event publish error:", err);
  }
}
