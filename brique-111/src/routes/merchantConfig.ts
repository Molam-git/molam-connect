/**
 * Brique 111 - Merchant Config UI
 * API Routes for Merchant Plugin Configuration & Webhooks
 */

import { Router, Request, Response } from "express";
import { pool } from "../db";
import { auth } from "../auth";
import { requireRole, scopeMerchant } from "../rbac";
import { logAudit, getAuditContext } from "../utils/audit";
import crypto from "crypto";
import { webhookService } from "../services/webhookService";
import { pluginLifecycleService } from "../services/pluginLifecycleService";

export const merchantConfigRouter = Router();

// Apply auth to all routes
merchantConfigRouter.use(auth);
merchantConfigRouter.use(scopeMerchant);

// ============================================================================
// PLUGINS MANAGEMENT
// ============================================================================

/**
 * GET /api/config/plugins
 * Liste des plugins du marchand
 */
merchantConfigRouter.get("/plugins", requireRole(["merchant_admin", "pay_admin", "compliance_ops"]), async (req: Request, res: Response) => {
  try {
    const merchantId = req.user?.merchantId || req.body.merchant_id;
    
    if (!merchantId) {
      return res.status(400).json({ error: "merchant_id_required" });
    }

    const { rows } = await pool.query(
      `SELECT * FROM merchant_plugins_stats WHERE merchant_id = $1 ORDER BY created_at DESC`,
      [merchantId]
    );

    res.json(rows);
  } catch (error: any) {
    console.error("❌ Get plugins failed:", error);
    res.status(500).json({ error: "internal_server_error", message: error.message });
  }
});

/**
 * GET /api/config/plugins/:id
 * Détails d'un plugin spécifique
 */
merchantConfigRouter.get("/plugins/:id", requireRole(["merchant_admin", "pay_admin", "compliance_ops"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const merchantId = req.user?.merchantId || req.body.merchant_id;

    const { rows } = await pool.query(
      `SELECT * FROM merchant_plugins WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "plugin_not_found" });
    }

    // Get recent updates
    const { rows: updates } = await pool.query(
      `SELECT * FROM plugin_updates WHERE merchant_plugin_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [id]
    );

    // Get Sira detections
    const { rows: detections } = await pool.query(
      `SELECT * FROM sira_detections WHERE merchant_plugin_id = $1 ORDER BY detected_at DESC LIMIT 10`,
      [id]
    );

    res.json({
      ...rows[0],
      updates,
      detections
    });
  } catch (error: any) {
    console.error("❌ Get plugin details failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/config/plugins
 * Installer/Enregistrer un nouveau plugin
 */
merchantConfigRouter.post("/plugins", requireRole(["merchant_admin", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const merchantId = req.user?.merchantId || req.body.merchant_id;
    const { cms, plugin_version, settings = {} } = req.body;

    if (!merchantId || !cms || !plugin_version) {
      return res.status(400).json({ error: "missing_required_fields" });
    }

    const { rows } = await pool.query(
      `INSERT INTO merchant_plugins (merchant_id, cms, plugin_version, settings, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (merchant_id, cms) 
       DO UPDATE SET 
         plugin_version = EXCLUDED.plugin_version,
         settings = EXCLUDED.settings,
         status = 'active',
         updated_at = now()
       RETURNING *`,
      [merchantId, cms, plugin_version, JSON.stringify(settings)]
    );

    // Audit log
    const auditCtx = getAuditContext(req);
    await logAudit({
      merchant_id: merchantId,
      merchant_plugin_id: rows[0].id,
      ...auditCtx,
      action: "plugin.installed",
      details: { cms, plugin_version }
    });

    res.json(rows[0]);
  } catch (error: any) {
    console.error("❌ Install plugin failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/config/plugins/:id/status
 * Activer/désactiver plugin
 */
merchantConfigRouter.post("/plugins/:id/status", requireRole(["merchant_admin", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // active|disabled
    const merchantId = req.user?.merchantId || req.body.merchant_id;

    if (!["active", "disabled"].includes(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }

    const { rows } = await pool.query(
      `UPDATE merchant_plugins 
       SET status = $1, updated_at = now() 
       WHERE id = $2 AND merchant_id = $3
       RETURNING *`,
      [status, id, merchantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "plugin_not_found" });
    }

    // Audit log
    const auditCtx = getAuditContext(req);
    await logAudit({
      merchant_id: merchantId,
      merchant_plugin_id: id,
      ...auditCtx,
      action: `plugin.${status}`,
      details: { status }
    });

    res.json({ ok: true, plugin: rows[0] });
  } catch (error: any) {
    console.error("❌ Update plugin status failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * PATCH /api/config/plugins/:id/settings
 * Mettre à jour les paramètres d'un plugin
 */
merchantConfigRouter.patch("/plugins/:id/settings", requireRole(["merchant_admin", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { settings } = req.body;
    const merchantId = req.user?.merchantId || req.body.merchant_id;

    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "invalid_settings" });
    }

    // Merge with existing settings
    const { rows: existing } = await pool.query(
      `SELECT settings FROM merchant_plugins WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: "plugin_not_found" });
    }

    const mergedSettings = { ...existing[0].settings, ...settings };

    const { rows } = await pool.query(
      `UPDATE merchant_plugins 
       SET settings = $1, updated_at = now() 
       WHERE id = $2 AND merchant_id = $3
       RETURNING *`,
      [JSON.stringify(mergedSettings), id, merchantId]
    );

    // Audit log
    const auditCtx = getAuditContext(req);
    await logAudit({
      merchant_id: merchantId,
      merchant_plugin_id: id,
      ...auditCtx,
      action: "plugin.settings.updated",
      details: { settings: mergedSettings }
    });

    res.json(rows[0]);
  } catch (error: any) {
    console.error("❌ Update plugin settings failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

// ============================================================================
// WEBHOOKS MANAGEMENT
// ============================================================================

/**
 * GET /api/config/webhooks
 * Liste des webhooks du marchand
 */
merchantConfigRouter.get("/webhooks", requireRole(["merchant_admin", "pay_admin", "compliance_ops"]), async (req: Request, res: Response) => {
  try {
    const merchantId = req.user?.merchantId || req.body.merchant_id;

    const { rows } = await pool.query(
      `SELECT * FROM merchant_webhooks_monitoring WHERE merchant_id = $1 ORDER BY created_at DESC`,
      [merchantId]
    );

    res.json(rows);
  } catch (error: any) {
    console.error("❌ Get webhooks failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/config/webhooks
 * Créer/Configurer un webhook
 */
merchantConfigRouter.post("/webhooks", requireRole(["merchant_admin", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const merchantId = req.user?.merchantId || req.body.merchant_id;
    const { event_type, url, auto_configured = false, failover_url } = req.body;

    if (!merchantId || !event_type || !url) {
      return res.status(400).json({ error: "missing_required_fields" });
    }

    // Generate secret
    const secret = crypto.randomBytes(32);

    const { rows } = await pool.query(
      `INSERT INTO merchant_webhooks (merchant_id, event_type, url, secret, auto_configured, failover_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (merchant_id, event_type, url) 
       DO UPDATE SET 
         status = 'active',
         secret = EXCLUDED.secret,
         updated_at = now()
       RETURNING id, merchant_id, event_type, url, status, created_at`,
      [merchantId, event_type, url, secret, auto_configured, failover_url || null]
    );

    // Audit log
    const auditCtx = getAuditContext(req);
    await logAudit({
      merchant_id: merchantId,
      ...auditCtx,
      action: "webhook.created",
      details: { event_type, url, auto_configured }
    });

    // Return secret preview (first 6 chars)
    res.json({
      ...rows[0],
      secret_preview: secret.toString("hex").slice(0, 6) + "...",
      secret: secret.toString("hex") // Full secret for initial creation only
    });
  } catch (error: any) {
    console.error("❌ Create webhook failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * DELETE /api/config/webhooks/:id
 * Supprimer un webhook
 */
merchantConfigRouter.delete("/webhooks/:id", requireRole(["merchant_admin", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const merchantId = req.user?.merchantId || req.body.merchant_id;

    const { rows } = await pool.query(
      `DELETE FROM merchant_webhooks 
       WHERE id = $1 AND merchant_id = $2
       RETURNING id`,
      [id, merchantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "webhook_not_found" });
    }

    // Audit log
    const auditCtx = getAuditContext(req);
    await logAudit({
      merchant_id: merchantId,
      ...auditCtx,
      action: "webhook.deleted",
      details: { webhook_id: id }
    });

    res.json({ ok: true });
  } catch (error: any) {
    console.error("❌ Delete webhook failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/config/webhooks/:id/test
 * Tester un webhook
 */
merchantConfigRouter.post("/webhooks/:id/test", requireRole(["merchant_admin", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const merchantId = req.user?.merchantId || req.body.merchant_id;

    const result = await webhookService.testWebhook(id, merchantId);

    res.json(result);
  } catch (error: any) {
    console.error("❌ Test webhook failed:", error);
    res.status(500).json({ error: "internal_server_error", message: error.message });
  }
});

// ============================================================================
// PLUGIN LIFECYCLE (UPDATE & ROLLBACK)
// ============================================================================

/**
 * POST /api/config/plugins/:id/update
 * Lancer une mise à jour de plugin
 */
merchantConfigRouter.post("/plugins/:id/update", requireRole(["merchant_admin", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { new_version } = req.body;
    const merchantId = req.user?.merchantId || req.body.merchant_id;

    if (!new_version) {
      return res.status(400).json({ error: "new_version_required" });
    }

    const result = await pluginLifecycleService.startUpdate(id, merchantId, new_version);

    // Audit log
    const auditCtx = getAuditContext(req);
    await logAudit({
      merchant_id: merchantId,
      merchant_plugin_id: id,
      ...auditCtx,
      action: "plugin.update.started",
      details: { new_version, update_id: result.update_id }
    });

    res.json(result);
  } catch (error: any) {
    console.error("❌ Start plugin update failed:", error);
    res.status(500).json({ error: "internal_server_error", message: error.message });
  }
});

/**
 * POST /api/config/plugins/:id/rollback
 * Rollback d'une mise à jour
 */
merchantConfigRouter.post("/plugins/:id/rollback", requireRole(["merchant_admin", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { update_id, reason } = req.body;
    const merchantId = req.user?.merchantId || req.body.merchant_id;

    const result = await pluginLifecycleService.rollback(id, merchantId, update_id, reason);

    // Audit log
    const auditCtx = getAuditContext(req);
    await logAudit({
      merchant_id: merchantId,
      merchant_plugin_id: id,
      ...auditCtx,
      action: "plugin.rolled_back",
      details: { update_id, reason }
    });

    res.json(result);
  } catch (error: any) {
    console.error("❌ Rollback plugin failed:", error);
    res.status(500).json({ error: "internal_server_error", message: error.message });
  }
});

/**
 * GET /api/config/plugins/:id/updates
 * Historique des mises à jour
 */
merchantConfigRouter.get("/plugins/:id/updates", requireRole(["merchant_admin", "pay_admin", "compliance_ops"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const merchantId = req.user?.merchantId || req.body.merchant_id;

    const { rows } = await pool.query(
      `SELECT * FROM plugin_updates 
       WHERE merchant_plugin_id = $1 
       ORDER BY created_at DESC`,
      [id]
    );

    res.json(rows);
  } catch (error: any) {
    console.error("❌ Get plugin updates failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

// ============================================================================
// SIRA SELF-HEALING
// ============================================================================

/**
 * GET /api/config/plugins/:id/detections
 * Détections Sira pour un plugin
 */
merchantConfigRouter.get("/plugins/:id/detections", requireRole(["merchant_admin", "pay_admin", "compliance_ops"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const merchantId = req.user?.merchantId || req.body.merchant_id;

    const { rows } = await pool.query(
      `SELECT * FROM sira_detections 
       WHERE merchant_plugin_id = $1 
       ORDER BY detected_at DESC`,
      [id]
    );

    res.json(rows);
  } catch (error: any) {
    console.error("❌ Get Sira detections failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/config/plugins/:id/heartbeat
 * Heartbeat depuis le plugin (télémetry)
 */
merchantConfigRouter.post("/plugins/:id/heartbeat", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { telemetry } = req.body;

    const { rows } = await pool.query(
      `UPDATE merchant_plugins 
       SET last_heartbeat = now(),
           telemetry = $1,
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(telemetry || {}), id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "plugin_not_found" });
    }

    // Check for Sira detections (async, don't block response)
    // This would be handled by the self-healing worker

    res.json({ ok: true, plugin: rows[0] });
  } catch (error: any) {
    console.error("❌ Plugin heartbeat failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});

// ============================================================================
// STATS & MONITORING
// ============================================================================

/**
 * GET /api/config/stats
 * Statistiques globales pour le marchand
 */
merchantConfigRouter.get("/stats", requireRole(["merchant_admin", "pay_admin", "compliance_ops"]), async (req: Request, res: Response) => {
  try {
    const merchantId = req.user?.merchantId || req.body.merchant_id;

    const { rows: pluginStats } = await pool.query(
      `SELECT 
         COUNT(*) as total_plugins,
         COUNT(*) FILTER (WHERE status = 'active') as active_plugins,
         COUNT(*) FILTER (WHERE status = 'error') as error_plugins,
         COUNT(*) FILTER (WHERE status = 'pending_update') as pending_updates
       FROM merchant_plugins 
       WHERE merchant_id = $1`,
      [merchantId]
    );

    const { rows: webhookStats } = await pool.query(
      `SELECT 
         COUNT(*) as total_webhooks,
         COUNT(*) FILTER (WHERE status = 'active') as active_webhooks,
         COUNT(*) FILTER (WHERE status = 'error') as error_webhooks
       FROM merchant_webhooks 
       WHERE merchant_id = $1`,
      [merchantId]
    );

    res.json({
      plugins: pluginStats[0],
      webhooks: webhookStats[0]
    });
  } catch (error: any) {
    console.error("❌ Get stats failed:", error);
    res.status(500).json({ error: "internal_server_error" });
  }
});


