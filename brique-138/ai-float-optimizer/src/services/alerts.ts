import { pool } from "../db";

const ALERT_DEDUP_WINDOW_MINUTES = 10;

export async function createAlert(
  type: string,
  entity: string,
  severity: "info" | "warning" | "high" | "critical",
  message: string,
  metadata: Record<string, unknown> = {}
) {
  await pool.query(
    `
    INSERT INTO alerts (id, type, entity, severity, message, metadata)
    SELECT gen_random_uuid(), $1, $2, $3, $4, $5::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM alerts
      WHERE type = $1
        AND entity = $2
        AND status = 'open'
        AND created_at >= now() - ($6 || ' minutes')::interval
    )
  `,
    [type, entity, severity, message, JSON.stringify(metadata || {}), ALERT_DEDUP_WINDOW_MINUTES.toString()]
  );
}

