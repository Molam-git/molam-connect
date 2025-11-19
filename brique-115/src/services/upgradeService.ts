/**
 * Brique 115 - Plugin Versioning & Migration Strategy
 * Upgrade Service: Log upgrades, track migrations
 */

import { pool } from "../db";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info"
});

export interface UpgradeLog {
  merchant_id: string;
  plugin_name: string;
  from_version: string;
  to_version: string;
  status: "success" | "failed" | "rollback" | "in_progress" | "cancelled";
  details?: Record<string, any>;
  migrations_applied?: string[];
  error_message?: string;
  execution_method?: string;
}

/**
 * Log plugin upgrade
 */
export async function logUpgrade(log: UpgradeLog): Promise<any> {
  const startTime = Date.now();

  try {
    const { rows } = await pool.query(
      `INSERT INTO plugin_upgrade_logs
       (merchant_id, plugin_name, from_version, to_version, status,
        details, migrations_applied, error_message, execution_method, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       RETURNING *`,
      [
        log.merchant_id,
        log.plugin_name,
        log.from_version,
        log.to_version,
        log.status,
        JSON.stringify(log.details || {}),
        JSON.stringify(log.migrations_applied || []),
        log.error_message || null,
        log.execution_method || "auto_update"
      ]
    );

    const upgradeLog = rows[0];

    // Update completion time if not in_progress
    if (log.status !== "in_progress") {
      const duration = Date.now() - startTime;
      await pool.query(
        `UPDATE plugin_upgrade_logs
         SET completed_at = now(), duration_ms = $1
         WHERE id = $2`,
        [duration, upgradeLog.id]
      );
    }

    logger.info({
      logId: upgradeLog.id,
      pluginName: log.plugin_name,
      fromVersion: log.from_version,
      toVersion: log.to_version,
      status: log.status
    }, "Upgrade logged");

    return upgradeLog;
  } catch (error: any) {
    logger.error({ error }, "Failed to log upgrade");
    throw error;
  }
}

/**
 * Update upgrade log status
 */
export async function updateUpgradeLogStatus(
  logId: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  await pool.query(
    `UPDATE plugin_upgrade_logs
     SET status = $1,
         error_message = $2,
         completed_at = now(),
         duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000
     WHERE id = $3`,
    [status, errorMessage || null, logId]
  );
}

/**
 * Record rollback
 */
export async function recordRollback(
  logId: string,
  reason: string
): Promise<void> {
  await pool.query(
    `UPDATE plugin_upgrade_logs
     SET status = 'rollback',
         rollback_reason = $1,
         rolled_back_at = now(),
         completed_at = now()
     WHERE id = $2`,
    [reason, logId]
  );
}

