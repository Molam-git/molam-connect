/**
 * BRIQUE 144 — Provider Selection
 * Selects best available provider based on priority, tenant, and availability
 */
import { pool } from "./db";

export async function pickProvider(
  channel: string,
  tenant_type: string,
  tenant_id?: string
) {
  // Try tenant-specific providers first
  if (tenant_id) {
    const { rows } = await pool.query(
      `SELECT * FROM notification_providers
       WHERE tenant_type=$1 AND tenant_id=$2 AND type=$3 AND enabled=true
       ORDER BY priority ASC LIMIT 1`,
      [tenant_type, tenant_id, channel]
    );
    if (rows.length) return rows[0];
  }

  // Fallback to global providers
  const { rows: globalRows } = await pool.query(
    `SELECT * FROM notification_providers
     WHERE tenant_type='global' AND type=$1 AND enabled=true
     ORDER BY priority ASC LIMIT 1`,
    [channel]
  );

  if (globalRows.length) return globalRows[0];

  throw new Error(`no_provider_available: ${channel}`);
}
