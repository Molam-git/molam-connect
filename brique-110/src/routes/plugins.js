// src/routes/plugins.js
// Plugin Telemetry & Management API

const express = require('express');

// Factory function to create router with dependencies
function createPluginRouter(pool, monitoringService, notificationService) {
  const router = express.Router();

  /**
   * Plugin Heartbeat - Receive telemetry from installed plugins
   * POST /api/v1/plugins/heartbeat
   */
  router.post('/heartbeat', async (req, res) => {
    try {
      const {
        merchant_id,
        cms,
        plugin_version,
        sdk_language = null,
        errors_last_hour = 0,
        environment = 'production',
        php_version = null,
        wordpress_version = null,
        server_info = {},
        metadata = {}
      } = req.body;

      // Validate required fields
      if (!merchant_id || !cms || !plugin_version) {
        return res.status(400).json({ error: 'missing_required_fields' });
      }

      // Check if installation exists
      const { rows: existing } = await pool.query(
        `SELECT * FROM plugin_installations
         WHERE merchant_id = $1 AND cms = $2`,
        [merchant_id, cms]
      );

      let installation;

      if (existing.length > 0) {
        // Update existing installation
        const { rows } = await pool.query(
          `UPDATE plugin_installations
           SET plugin_version = $1,
               sdk_language = $2,
               last_heartbeat = now(),
               error_rate = $3,
               environment = $4,
               php_version = $5,
               wordpress_version = $6,
               server_info = $7,
               metadata = $8,
               updated_at = now()
           WHERE merchant_id = $9 AND cms = $10
           RETURNING *`,
          [
            plugin_version,
            sdk_language,
            errors_last_hour,
            environment,
            php_version,
            wordpress_version,
            JSON.stringify(server_info),
            JSON.stringify(metadata),
            merchant_id,
            cms
          ]
        );

        installation = rows[0];
      } else {
        // Create new installation
        const { rows } = await pool.query(
          `INSERT INTO plugin_installations
           (merchant_id, cms, plugin_version, sdk_language, error_rate,
            environment, php_version, wordpress_version, server_info, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            merchant_id,
            cms,
            plugin_version,
            sdk_language,
            errors_last_hour,
            environment,
            php_version,
            wordpress_version,
            JSON.stringify(server_info),
            JSON.stringify(metadata)
          ]
        );

        installation = rows[0];
      }

      // Check for upgrades
      await monitoringService.checkForUpgrades(installation);

      // Check Ops toggles
      const toggles = await monitoringService.getActiveToggles(installation.id);

      console.log(`✅ Plugin heartbeat: ${cms} v${plugin_version} - Merchant ${merchant_id}`);

      res.json({
        status: 'ok',
        installation_id: installation.id,
        toggles: toggles || {}
      });
    } catch (error) {
      console.error('❌ Plugin heartbeat failed:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  /**
   * Log telemetry event
   * POST /api/v1/plugins/event
   */
  router.post('/event', async (req, res) => {
    try {
      const {
        merchant_id,
        cms,
        event_type,
        event_data,
        severity = 'info',
        stack_trace = null
      } = req.body;

      if (!merchant_id || !cms || !event_type || !event_data) {
        return res.status(400).json({ error: 'missing_required_fields' });
      }

      // Get plugin installation
      const { rows: [installation] } = await pool.query(
        `SELECT * FROM plugin_installations
         WHERE merchant_id = $1 AND cms = $2`,
        [merchant_id, cms]
      );

      if (!installation) {
        return res.status(404).json({ error: 'plugin_not_found' });
      }

      // Log event
      await pool.query(
        `INSERT INTO plugin_telemetry_events
         (plugin_id, event_type, event_data, severity, stack_trace)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          installation.id,
          event_type,
          JSON.stringify(event_data),
          severity,
          stack_trace
        ]
      );

      // Update error tracking if error event
      if (severity === 'error' || severity === 'critical') {
        await pool.query(
          `UPDATE plugin_installations
           SET last_error = $1, last_error_at = now()
           WHERE id = $2`,
          [event_data.message || event_type, installation.id]
        );
      }

      res.json({ status: 'ok' });
    } catch (error) {
      console.error('❌ Plugin event logging failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * List all plugins (Ops)
   * GET /api/v1/plugins/list
   */
  router.get('/list', async (req, res) => {
    try {
      // TODO: Add Ops auth middleware
      const { status, cms, limit = 100, offset = 0 } = req.query;

      let query = `
        SELECT pi.*,
               m.business_name as merchant_name,
               m.email as merchant_email,
               pvr.version as latest_version,
               (SELECT COUNT(*) FROM plugin_telemetry_events pte
                WHERE pte.plugin_id = pi.id
                  AND pte.severity IN ('error', 'critical')
                  AND pte.recorded_at >= now() - interval '24 hours') as errors_24h
        FROM plugin_installations pi
        LEFT JOIN merchants m ON pi.merchant_id = m.id
        LEFT JOIN plugin_versions_registry pvr ON pvr.cms = pi.cms AND pvr.is_latest = true
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      if (status) {
        params.push(status);
        query += ` AND pi.status = $${paramIndex++}`;
      }

      if (cms) {
        params.push(cms);
        query += ` AND pi.cms = $${paramIndex++}`;
      }

      query += ` ORDER BY pi.last_heartbeat DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const { rows } = await pool.query(query, params);

      res.json(rows);
    } catch (error) {
      console.error('❌ Plugin list failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get plugin details
   * GET /api/v1/plugins/:id
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const { rows } = await pool.query(
        `SELECT pi.*,
                m.business_name as merchant_name,
                m.email as merchant_email,
                pvr.version as latest_version,
                pvr.changelog as latest_changelog
         FROM plugin_installations pi
         LEFT JOIN merchants m ON pi.merchant_id = m.id
         LEFT JOIN plugin_versions_registry pvr ON pvr.cms = pi.cms AND pvr.is_latest = true
         WHERE pi.id = $1`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'plugin_not_found' });
      }

      // Get recent events
      const { rows: events } = await pool.query(
        `SELECT * FROM plugin_telemetry_events
         WHERE plugin_id = $1
         ORDER BY recorded_at DESC
         LIMIT 50`,
        [id]
      );

      // Get active toggles
      const { rows: toggles } = await pool.query(
        `SELECT * FROM plugin_ops_toggles
         WHERE plugin_id = $1
           AND (expires_at IS NULL OR expires_at > now())
         ORDER BY created_at DESC`,
        [id]
      );

      res.json({
        ...rows[0],
        recent_events: events,
        active_toggles: toggles
      });
    } catch (error) {
      console.error('❌ Plugin details failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Set Ops toggle (Ops only)
   * POST /api/v1/plugins/:id/toggle
   */
  router.post('/:id/toggle', async (req, res) => {
    try {
      // TODO: Add Ops auth middleware with permission check
      const { id } = req.params;
      const {
        toggle_key,
        toggle_value,
        reason = null,
        expires_at = null,
        updated_by = null
      } = req.body;

      if (!toggle_key || !toggle_value) {
        return res.status(400).json({ error: 'missing_required_fields' });
      }

      // Check if plugin exists
      const { rows: [plugin] } = await pool.query(
        'SELECT * FROM plugin_installations WHERE id = $1',
        [id]
      );

      if (!plugin) {
        return res.status(404).json({ error: 'plugin_not_found' });
      }

      // Upsert toggle
      const { rows } = await pool.query(
        `INSERT INTO plugin_ops_toggles
         (plugin_id, toggle_key, toggle_value, reason, expires_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (plugin_id, toggle_key)
         DO UPDATE SET
           toggle_value = EXCLUDED.toggle_value,
           reason = EXCLUDED.reason,
           expires_at = EXCLUDED.expires_at,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
         RETURNING *`,
        [
          id,
          toggle_key,
          JSON.stringify(toggle_value),
          reason,
          expires_at,
          updated_by
        ]
      );

      // If blocking, update plugin status
      if (toggle_key === 'block_plugin' && toggle_value === true) {
        await pool.query(
          'UPDATE plugin_installations SET status = $1 WHERE id = $2',
          ['blocked', id]
        );
      }

      console.log(`✅ Ops toggle set: ${toggle_key} = ${JSON.stringify(toggle_value)} for plugin ${id}`);

      res.json(rows[0]);
    } catch (error) {
      console.error('❌ Ops toggle failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Send upgrade notification (Ops)
   * POST /api/v1/plugins/:id/notify-upgrade
   */
  router.post('/:id/notify-upgrade', async (req, res) => {
    try {
      const { id } = req.params;
      const { channel = 'email' } = req.body;

      const { rows: [plugin] } = await pool.query(
        `SELECT pi.*, m.email as merchant_email, m.business_name as merchant_name
         FROM plugin_installations pi
         LEFT JOIN merchants m ON pi.merchant_id = m.id
         WHERE pi.id = $1`,
        [id]
      );

      if (!plugin) {
        return res.status(404).json({ error: 'plugin_not_found' });
      }

      // Get latest version
      const { rows: [latest] } = await pool.query(
        `SELECT * FROM plugin_versions_registry
         WHERE cms = $1 AND is_latest = true`,
        [plugin.cms]
      );

      if (!latest) {
        return res.status(404).json({ error: 'no_latest_version' });
      }

      // Create notification
      await notificationService.sendUpgradeNotification({
        plugin,
        current_version: plugin.plugin_version,
        latest_version: latest.version,
        changelog: latest.changelog,
        channel
      });

      res.json({ status: 'ok', message: 'Notification sent' });
    } catch (error) {
      console.error('❌ Upgrade notification failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get plugin stats (Ops dashboard)
   * GET /api/v1/plugins/stats
   */
  router.get('/stats/overview', async (req, res) => {
    try {
      const stats = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active_count,
          COUNT(*) FILTER (WHERE status = 'outdated') as outdated_count,
          COUNT(*) FILTER (WHERE status = 'blocked') as blocked_count,
          COUNT(*) FILTER (WHERE status = 'error') as error_count,
          COUNT(*) FILTER (WHERE error_rate > 5.0) as high_error_rate_count,
          COUNT(*) FILTER (WHERE last_heartbeat < now() - interval '24 hours') as stale_count,
          AVG(error_rate) as avg_error_rate
        FROM plugin_installations
      `);

      const { rows: cms_breakdown } = await pool.query(`
        SELECT cms, COUNT(*) as count
        FROM plugin_installations
        GROUP BY cms
        ORDER BY count DESC
      `);

      res.json({
        ...stats.rows[0],
        cms_breakdown
      });
    } catch (error) {
      console.error('❌ Plugin stats failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = createPluginRouter;
