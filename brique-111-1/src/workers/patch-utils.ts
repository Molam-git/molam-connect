/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * Patch Utilities: Staging tests, apply patch, rollback
 */

import { pool } from "../db";
import fetch from "node-fetch";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info"
});

/**
 * Run smoke tests on staging environment
 */
export async function runSmokeTestsOnStaging(
  merchantId: string,
  pluginId: string,
  targetVersion: string
): Promise<boolean> {
  try {
    const stagingRunnerUrl = process.env.STAGING_RUNNER_URL || "http://localhost:9000";
    
    logger.info({ merchantId, pluginId, targetVersion }, "Running staging smoke tests");

    const response = await fetch(`${stagingRunnerUrl}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.STAGING_RUNNER_TOKEN || ""}`
      },
      body: JSON.stringify({
        merchantId,
        pluginId,
        version: targetVersion
      }),
      timeout: 300000 // 5 minutes
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "Staging runner failed");
      return false;
    }

    const result = await response.json();
    logger.info({ result }, "Staging tests completed");

    return result.ok === true;
  } catch (error: any) {
    logger.error({ error }, "Staging test error");
    return false;
  }
}

/**
 * Apply patch to merchant plugin
 */
export async function applyPatchToMerchantPlugin(
  merchantId: string,
  pluginId: string,
  targetVersion: string
): Promise<{ ok: boolean; logs: any[] }> {
  try {
    logger.info({ merchantId, pluginId, targetVersion }, "Applying patch");

    // Get plugin
    const { rows: [plugin] } = await pool.query(
      `SELECT * FROM merchant_plugins WHERE id = $1`,
      [pluginId]
    );

    if (!plugin) {
      return { ok: false, logs: [{ level: "error", message: "Plugin not found" }] };
    }

    const oldVersion = plugin.plugin_version;

    // Create plugin_updates record
    await pool.query(
      `INSERT INTO plugin_updates (merchant_plugin_id, old_version, new_version, status)
       VALUES ($1, $2, $3, 'pending')`,
      [pluginId, oldVersion, targetVersion]
    );

    // Send command to plugin agent
    const commandResp = await sendCommandToPluginAgent(pluginId, {
      cmd: "update",
      version: targetVersion,
      reason: "auto_patch"
    });

    if (!commandResp.ok) {
      return { ok: false, logs: commandResp.logs || [] };
    }

    // Wait for health check
    const healthy = await waitForHealth(pluginId, 90 * 1000); // 90 seconds

    if (!healthy) {
      return { ok: false, logs: [{ level: "error", message: "Health check failed" }] };
    }

    // Mark update as success
    await pool.query(
      `UPDATE plugin_updates 
       SET status = 'success', updated_at = now() 
       WHERE merchant_plugin_id = $1 AND new_version = $2`,
      [pluginId, targetVersion]
    );

    await pool.query(
      `UPDATE merchant_plugins 
       SET plugin_version = $1, updated_at = now() 
       WHERE id = $2`,
      [targetVersion, pluginId]
    );

    logger.info({ pluginId, targetVersion }, "Patch applied successfully");

    return { ok: true, logs: [{ level: "info", message: "Patch applied successfully" }] };
  } catch (error: any) {
    logger.error({ error }, "Patch application failed");
    return { ok: false, logs: [{ level: "error", message: error.message }] };
  }
}

/**
 * Rollback plugin to previous version
 */
export async function rollbackPluginVersion(
  merchantId: string,
  pluginId: string,
  targetVersion: string
): Promise<{ ok: boolean }> {
  try {
    logger.info({ merchantId, pluginId, targetVersion }, "Rolling back plugin");

    // Send rollback command to plugin agent
    await sendCommandToPluginAgent(pluginId, {
      cmd: "rollback",
      version: targetVersion,
      reason: "auto_rollback"
    });

    // Update plugin_updates
    await pool.query(
      `UPDATE plugin_updates 
       SET status = 'rolled_back', updated_at = now() 
       WHERE merchant_plugin_id = $1 AND new_version != $2`,
      [pluginId, targetVersion]
    );

    // Update plugin version
    await pool.query(
      `UPDATE merchant_plugins 
       SET plugin_version = $1, updated_at = now() 
       WHERE id = $2`,
      [targetVersion, pluginId]
    );

    logger.info({ pluginId, targetVersion }, "Rollback completed");

    return { ok: true };
  } catch (error: any) {
    logger.error({ error }, "Rollback failed");
    return { ok: false };
  }
}

/**
 * Send command to plugin agent (via message queue or HTTP)
 */
async function sendCommandToPluginAgent(pluginId: string, payload: any): Promise<{ ok: boolean; logs?: any[] }> {
  try {
    // Create command record
    const { rows: [command] } = await pool.query(
      `INSERT INTO plugin_agent_commands
       (merchant_plugin_id, command_type, command_payload, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [pluginId, payload.cmd, JSON.stringify(payload)]
    );

    // In production, this would:
    // 1. Publish to message queue (Kafka/RabbitMQ)
    // 2. Plugin agent subscribes and receives command
    // 3. Plugin agent executes and acknowledges

    // For now, simplified: command will be picked up on next heartbeat
    logger.info({ commandId: command.id, pluginId }, "Command queued for plugin agent");

    return { ok: true };
  } catch (error: any) {
    logger.error({ error }, "Failed to send command to plugin agent");
    return { ok: false, logs: [{ level: "error", message: error.message }] };
  }
}

/**
 * Wait for plugin health check
 */
async function waitForHealth(pluginId: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  const checkInterval = 3000; // Check every 3 seconds

  while (Date.now() - start < timeoutMs) {
    const { rows } = await pool.query(
      `SELECT last_heartbeat, telemetry FROM merchant_plugins WHERE id = $1`,
      [pluginId]
    );

    if (rows.length > 0) {
      const plugin = rows[0];
      const lastHeartbeat = plugin.last_heartbeat;

      if (lastHeartbeat) {
        const heartbeatAge = Date.now() - new Date(lastHeartbeat).getTime();
        
        // Consider healthy if heartbeat within last 30 seconds
        if (heartbeatAge < 30 * 1000) {
          // Check error rate from telemetry
          const telemetry = plugin.telemetry || {};
          const errorRate = telemetry.errors_last_24h || 0;

          // Healthy if error rate acceptable
          if (errorRate < 10) {
            logger.info({ pluginId }, "Health check passed");
            return true;
          }
        }
      }
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  logger.warn({ pluginId }, "Health check timeout");
  return false;
}



