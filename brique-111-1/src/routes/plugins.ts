/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * API Routes: Plugin heartbeat endpoint
 */

import { Router, Request, Response } from "express";
import { pool } from "../db";
import { verifyPluginAuth } from "../utils/pluginAuth";
import { enqueueIncidentCheck } from "../utils/queue";

const router = Router();

/**
 * POST /api/plugins/heartbeat
 * Receive heartbeat + telemetry from plugins
 */
router.post("/heartbeat", async (req: Request, res: Response) => {
  try {
    // Verify plugin-level secret (not Molam ID)
    const auth = verifyPluginAuth(req.headers.authorization || "");
    if (!auth) {
      return res.status(401).json({ error: "unauthorized_plugin" });
    }

    const body = req.body;
    const {
      plugin_id,
      merchant_id,
      plugin_version,
      env,
      errors_last_24h,
      webhook_fail_rate,
      uptime,
      timestamp
    } = body;

    if (!plugin_id || !merchant_id || !plugin_version) {
      return res.status(400).json({ error: "missing_required_fields" });
    }

    // Update plugin telemetry
    const telemetry = {
      env: env || {},
      errors_last_24h: errors_last_24h || 0,
      webhook_fail_rate: webhook_fail_rate || 0,
      uptime: uptime || null,
      last_ts: timestamp || new Date().toISOString()
    };

    await pool.query(
      `UPDATE merchant_plugins 
       SET telemetry = telemetry || $2::jsonb,
           plugin_version = $3,
           last_heartbeat = now(),
           error_count_24h = $4,
           updated_at = now()
       WHERE id = $1`,
      [plugin_id, JSON.stringify(telemetry), plugin_version, errors_last_24h || 0]
    );

    // Evaluate anomaly rules async (enqueue for incident processor)
    await enqueueIncidentCheck({
      pluginId: plugin_id,
      merchantId: merchant_id,
      telemetry: {
        errors_last_24h,
        webhook_fail_rate,
        env,
        timestamp
      }
    });

    // Check for pending commands for this plugin
    const { rows: commands } = await pool.query(
      `SELECT id, command_type, command_payload 
       FROM plugin_agent_commands 
       WHERE merchant_plugin_id = $1 
         AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 10`,
      [plugin_id]
    );

    // Mark commands as sent
    if (commands.length > 0) {
      const commandIds = commands.map(c => c.id);
      await pool.query(
        `UPDATE plugin_agent_commands 
         SET status = 'sent', sent_at = now() 
         WHERE id = ANY($1)`,
        [commandIds]
      );
    }

    res.json({
      ok: true,
      commands: commands.map(c => ({
        id: c.id,
        type: c.command_type,
        payload: c.command_payload
      }))
    });
  } catch (error: any) {
    console.error("❌ Heartbeat failed:", error);
    res.status(500).json({ error: "internal_server_error", message: error.message });
  }
});

/**
 * POST /api/plugins/commands/:commandId/ack
 * Acknowledge command execution
 */
router.post("/commands/:commandId/ack", async (req: Request, res: Response) => {
  try {
    const auth = verifyPluginAuth(req.headers.authorization || "");
    if (!auth) {
      return res.status(401).json({ error: "unauthorized_plugin" });
    }

    const { commandId } = req.params;
    const { result } = req.body;

    await pool.query(
      `UPDATE plugin_agent_commands 
       SET status = 'acknowledged',
           acknowledged_at = now(),
           response = $1,
           updated_at = now()
       WHERE id = $2`,
      [JSON.stringify(result), commandId]
    );

    res.json({ ok: true });
  } catch (error: any) {
    console.error("❌ Command ack failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/plugins/commands/:commandId/fail
 * Report command execution failure
 */
router.post("/commands/:commandId/fail", async (req: Request, res: Response) => {
  try {
    const auth = verifyPluginAuth(req.headers.authorization || "");
    if (!auth) {
      return res.status(401).json({ error: "unauthorized_plugin" });
    }

    const { commandId } = req.params;
    const { error } = req.body;

    await pool.query(
      `UPDATE plugin_agent_commands 
       SET status = 'failed',
           error_message = $1,
           updated_at = now()
       WHERE id = $2`,
      [error, commandId]
    );

    res.json({ ok: true });
  } catch (error: any) {
    console.error("❌ Command fail report failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

export default router;



