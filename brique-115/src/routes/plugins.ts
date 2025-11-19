/**
 * Brique 115 - Plugin Versioning & Migration Strategy
 * API Routes: Registry, version checking, upgrade logging
 */

import { Router, Request, Response } from "express";
import { pool } from "../db";
import { auth } from "../auth";
import { requireRole } from "../utils/rbac";
import { getLatestVersion, getAllVersions, checkCompatibility, isUpdateAvailable, getRequiredMigrations } from "../services/versionService";
import { logUpgrade } from "../services/upgradeService";
import { logAudit, getAuditContext } from "../utils/audit";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info"
});

export const pluginsRouter = Router();

// Public routes (for plugins to check versions)
pluginsRouter.get("/registry/:name", async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { include_beta = "false" } = req.query;

    const { rows } = await pool.query(
      `SELECT 
         version,
         api_min_version,
         api_max_version,
         status,
         release_notes,
         checksum,
         build_date,
         download_url,
         package_size_bytes,
         backwards_compatible,
         migration_required,
         security_advisory
       FROM plugin_versions
       WHERE name = $1
         AND status IN ($2, $3)
       ORDER BY created_at DESC`,
      [name, "active", include_beta === "true" ? "beta" : "active"]
    );

    res.json(rows);
  } catch (error: any) {
    logger.error({ error, pluginName: req.params.name }, "Failed to get registry");
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * GET /api/plugins/registry/:name/latest
 * Get latest version for a plugin
 */
pluginsRouter.get("/registry/:name/latest", async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { include_beta = "false" } = req.query;

    const latest = await getLatestVersion(name, include_beta === "true");

    if (!latest) {
      return res.status(404).json({ error: "plugin_not_found" });
    }

    res.json(latest);
  } catch (error: any) {
    logger.error({ error }, "Failed to get latest version");
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * GET /api/plugins/check-update/:name
 * Check if update is available for current version
 */
pluginsRouter.get("/check-update/:name", async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { current_version, api_version } = req.query;

    if (!current_version) {
      return res.status(400).json({ error: "current_version_required" });
    }

    // Check compatibility
    const compat = api_version
      ? await checkCompatibility(name, current_version as string, api_version as string)
      : { compatible: true };

    // Check for updates
    const updateCheck = await isUpdateAvailable(name, current_version as string);

    res.json({
      current_version,
      compatible: compat.compatible,
      compatibility_reason: compat.reason,
      update_available: updateCheck.available,
      latest_version: updateCheck.latestVersion,
      migrations_required: updateCheck.available
        ? await getRequiredMigrations(name, current_version as string, updateCheck.latestVersion!)
        : []
    });
  } catch (error: any) {
    logger.error({ error }, "Failed to check update");
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/plugins/logs
 * Log plugin upgrade (called by plugin after upgrade)
 */
pluginsRouter.post("/logs", async (req: Request, res: Response) => {
  try {
    const {
      merchant_id,
      plugin_name,
      from_version,
      to_version,
      status,
      details = {},
      migrations_applied = [],
      error_message,
      execution_method = "auto_update"
    } = req.body;

    if (!merchant_id || !plugin_name || !from_version || !to_version || !status) {
      return res.status(400).json({ error: "missing_required_fields" });
    }

    const upgradeLog = await logUpgrade({
      merchant_id,
      plugin_name,
      from_version,
      to_version,
      status,
      details,
      migrations_applied,
      error_message,
      execution_method
    });

    res.json({ ok: true, log_id: upgradeLog.id });
  } catch (error: any) {
    logger.error({ error }, "Failed to log upgrade");
    res.status(500).json({ error: "internal_server_error" });
  }
});

// Ops routes (require authentication)
pluginsRouter.use(auth);

/**
 * GET /api/plugins/registry/:name/all
 * Get all versions (including deprecated/blocked) - Ops only
 */
pluginsRouter.get("/registry/:name/all", requireRole(["ops_plugins", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const versions = await getAllVersions(name);
    res.json(versions);
  } catch (error: any) {
    logger.error({ error }, "Failed to get all versions");
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/plugins/registry/:name/:version/status
 * Update version status (deprecate/block/activate) - Ops only
 */
pluginsRouter.post("/registry/:name/:version/status", requireRole(["ops_plugins", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const { name, version } = req.params;
    const { status, reason } = req.body;
    const user = req.user!;

    if (!["active", "deprecated", "blocked", "beta", "rc"].includes(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }

    await pool.query(
      `UPDATE plugin_versions 
       SET status = $1, updated_at = now()
       WHERE name = $2 AND version = $3`,
      [status, name, version]
    );

    // Audit log
    const auditCtx = getAuditContext(req);
    await logAudit({
      merchant_id: "",
      ...auditCtx,
      action: "plugin.version.status_updated",
      details: { plugin_name: name, version, status, reason }
    });

    logger.info({ pluginName: name, version, status, user: user.id }, "Version status updated");

    res.json({ ok: true });
  } catch (error: any) {
    logger.error({ error }, "Failed to update version status");
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/plugins/registry
 * Register new plugin version - Ops only
 */
pluginsRouter.post("/registry", requireRole(["ops_plugins", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const {
      name,
      version,
      api_min_version,
      api_max_version,
      checksum,
      build_date,
      release_notes,
      download_url,
      package_size_bytes,
      backwards_compatible = true,
      migration_required = false,
      security_advisory
    } = req.body;

    if (!name || !version || !api_min_version || !api_max_version || !checksum) {
      return res.status(400).json({ error: "missing_required_fields" });
    }

    const { rows } = await pool.query(
      `INSERT INTO plugin_versions
       (name, version, api_min_version, api_max_version, checksum, build_date,
        release_notes, download_url, package_size_bytes, backwards_compatible,
        migration_required, security_advisory, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')
       ON CONFLICT (name, version) 
       DO UPDATE SET
         api_min_version = EXCLUDED.api_min_version,
         api_max_version = EXCLUDED.api_max_version,
         checksum = EXCLUDED.checksum,
         release_notes = EXCLUDED.release_notes,
         updated_at = now()
       RETURNING *`,
      [
        name, version, api_min_version, api_max_version, checksum,
        build_date || new Date().toISOString(),
        release_notes || null,
        download_url || null,
        package_size_bytes || null,
        backwards_compatible,
        migration_required,
        security_advisory || null
      ]
    );

    // Audit log
    const auditCtx = getAuditContext(req);
    await logAudit({
      merchant_id: "",
      ...auditCtx,
      action: "plugin.version.registered",
      details: { plugin_name: name, version }
    });

    res.json(rows[0]);
  } catch (error: any) {
    logger.error({ error }, "Failed to register version");
    res.status(500).json({ error: "internal_server_error", message: error.message });
  }
});

/**
 * GET /api/plugins/upgrade-logs
 * Get upgrade logs - Ops only
 */
pluginsRouter.get("/upgrade-logs", requireRole(["ops_plugins", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const { merchant_id, plugin_name, status, limit = 100, offset = 0 } = req.query;

    let query = `SELECT * FROM plugin_upgrade_logs WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (merchant_id) {
      query += ` AND merchant_id = $${paramIndex++}`;
      params.push(merchant_id);
    }

    if (plugin_name) {
      query += ` AND plugin_name = $${paramIndex++}`;
      params.push(plugin_name);
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(Number(limit), Number(offset));

    const { rows } = await pool.query(query, params);

    res.json({ rows, total: rows.length });
  } catch (error: any) {
    logger.error({ error }, "Failed to get upgrade logs");
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * GET /api/plugins/stats
 * Get versioning statistics - Ops only
 */
pluginsRouter.get("/stats", requireRole(["ops_plugins", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    // Version distribution
    const { rows: versionStats } = await pool.query(
      `SELECT 
         name,
         COUNT(*) as total_versions,
         COUNT(*) FILTER (WHERE status = 'active') as active_versions,
         COUNT(*) FILTER (WHERE status = 'deprecated') as deprecated_versions,
         COUNT(*) FILTER (WHERE status = 'blocked') as blocked_versions
       FROM plugin_versions
       GROUP BY name`
    );

    // Upgrade statistics
    const { rows: upgradeStats } = await pool.query(
      `SELECT 
         COUNT(*) as total_upgrades,
         COUNT(*) FILTER (WHERE status = 'success') as successful,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) FILTER (WHERE status = 'rollback') as rollbacks,
         AVG(duration_ms) FILTER (WHERE status = 'success') as avg_duration_ms
       FROM plugin_upgrade_logs
       WHERE created_at >= now() - interval '30 days'`
    );

    res.json({
      version_distribution: versionStats,
      upgrade_statistics: upgradeStats[0] || {}
    });
  } catch (error: any) {
    logger.error({ error }, "Failed to get stats");
    res.status(500).json({ error: "internal_server_error" });
  }
});

