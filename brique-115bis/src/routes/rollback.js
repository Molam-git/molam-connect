/**
 * Sous-Brique 115bis: Rollback API Routes
 * Endpoints pour gérer les rollbacks automatiques et manuels
 */

const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

let pool;

function setPool(pgPool) {
  pool = pgPool;
}

/**
 * Middleware pour vérifier les rôles requis
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    const userRoles = req.user?.roles || [];
    const hasRole = userRoles.some(role => allowedRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        error: 'forbidden',
        required_roles: allowedRoles,
        user_roles: userRoles
      });
    }

    next();
  };
}

/**
 * POST /api/plugins/rollback
 * Log a rollback event
 */
router.post('/rollback', requireRole(['ops_plugins', 'pay_admin']), async (req, res) => {
  try {
    const { merchant_id, plugin_name, rollback_version, status, reason } = req.body;

    // Validation
    if (!merchant_id || !plugin_name || !rollback_version || !status) {
      return res.status(400).json({
        error: 'missing_required_fields',
        required: ['merchant_id', 'plugin_name', 'rollback_version', 'status']
      });
    }

    // Validate status
    const validStatuses = ['success', 'failed', 'not_required'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'invalid_status',
        valid_statuses: validStatuses
      });
    }

    // Update latest upgrade log
    const result = await pool.query(
      `UPDATE plugin_upgrade_logs
       SET rollback_version = $3,
           rollback_status = $4,
           rollback_triggered_at = now(),
           rollback_reason = $5
       WHERE merchant_id = $1 AND plugin_name = $2
       ORDER BY created_at DESC
       LIMIT 1
       RETURNING *`,
      [merchant_id, plugin_name, rollback_version, status, reason || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'upgrade_log_not_found' });
    }

    console.log(`✅ Rollback logged: ${plugin_name} → ${rollback_version} (${status})`);

    res.json({
      ok: true,
      upgrade_log: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Rollback logging failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/plugins/rollback/initiate
 * Initiate a rollback operation (records the attempt)
 */
router.post('/rollback/initiate', requireRole(['ops_plugins', 'pay_admin']), async (req, res) => {
  try {
    const {
      merchant_id,
      plugin_name,
      from_version,
      to_version,
      trigger = 'manual',
      reason
    } = req.body;

    // Validation
    if (!merchant_id || !plugin_name || !from_version || !to_version) {
      return res.status(400).json({
        error: 'missing_required_fields',
        required: ['merchant_id', 'plugin_name', 'from_version', 'to_version']
      });
    }

    // Record rollback attempt
    const { rows } = await pool.query(
      `SELECT record_rollback_attempt($1, $2, $3, $4, $5, $6) as rollback_id`,
      [merchant_id, plugin_name, from_version, to_version, trigger, reason]
    );

    const rollbackId = rows[0].rollback_id;

    console.log(`✅ Rollback initiated: ${rollbackId}`);

    res.json({
      ok: true,
      rollback_id: rollbackId
    });
  } catch (error) {
    console.error('❌ Rollback initiation failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/plugins/rollback/:rollback_id/complete
 * Mark a rollback as completed
 */
router.post('/rollback/:rollback_id/complete', requireRole(['ops_plugins', 'pay_admin']), async (req, res) => {
  try {
    const { rollback_id } = req.params;
    const {
      success,
      error_message,
      duration_ms,
      files_restored,
      db_restored
    } = req.body;

    if (success === undefined) {
      return res.status(400).json({ error: 'success field required' });
    }

    await pool.query(
      `SELECT complete_rollback($1, $2, $3, $4, $5, $6)`,
      [
        rollback_id,
        success,
        error_message || null,
        duration_ms || null,
        files_restored || null,
        db_restored || null
      ]
    );

    console.log(`✅ Rollback completed: ${rollback_id} (success: ${success})`);

    res.json({ ok: true });
  } catch (error) {
    console.error('❌ Rollback completion failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/plugins/rollback/history
 * Get rollback history
 */
router.get('/rollback/history', requireRole(['ops_plugins', 'pay_admin', 'merchant_view']), async (req, res) => {
  try {
    const { merchant_id, plugin_name, limit = 50, offset = 0 } = req.query;

    let query = `SELECT * FROM v_recent_rollbacks WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (merchant_id) {
      params.push(merchant_id);
      query += ` AND merchant_id = $${paramIndex++}`;
    }

    if (plugin_name) {
      params.push(plugin_name);
      query += ` AND plugin_name = $${paramIndex++}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    res.json({
      rollbacks: rows,
      total: rows.length
    });
  } catch (error) {
    console.error('❌ Get rollback history failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/plugins/rollback/stats
 * Get rollback statistics
 */
router.get('/rollback/stats', requireRole(['ops_plugins', 'pay_admin']), async (req, res) => {
  try {
    const { rows: successRate } = await pool.query(
      'SELECT * FROM v_rollback_success_rate'
    );

    const { rows: recentCount } = await pool.query(
      `SELECT COUNT(*) as count
       FROM plugin_rollback_history
       WHERE created_at >= now() - INTERVAL '24 hours'`
    );

    const { rows: failedCount } = await pool.query(
      `SELECT COUNT(*) as count
       FROM plugin_rollback_history
       WHERE success = FALSE
         AND created_at >= now() - INTERVAL '7 days'`
    );

    res.json({
      success_rate_by_plugin: successRate,
      rollbacks_last_24h: parseInt(recentCount[0].count),
      failed_rollbacks_last_7d: parseInt(failedCount[0].count)
    });
  } catch (error) {
    console.error('❌ Get rollback stats failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/plugins/backup
 * Create a backup before upgrade
 */
router.post('/backup', requireRole(['ops_plugins', 'pay_admin', 'merchant']), async (req, res) => {
  try {
    const {
      merchant_id,
      plugin_name,
      version,
      backup_path,
      db_snapshot_name,
      backup_size_bytes,
      metadata
    } = req.body;

    // Validation
    if (!merchant_id || !plugin_name || !version || !backup_path) {
      return res.status(400).json({
        error: 'missing_required_fields',
        required: ['merchant_id', 'plugin_name', 'version', 'backup_path']
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO plugin_backups (
        merchant_id,
        plugin_name,
        version,
        backup_path,
        db_snapshot_name,
        backup_size_bytes,
        backup_status,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7)
      RETURNING *`,
      [
        merchant_id,
        plugin_name,
        version,
        backup_path,
        db_snapshot_name || null,
        backup_size_bytes || null,
        JSON.stringify(metadata || {})
      ]
    );

    console.log(`✅ Backup created: ${plugin_name} v${version}`);

    res.json({
      ok: true,
      backup: rows[0]
    });
  } catch (error) {
    console.error('❌ Backup creation failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/plugins/backup/:merchant_id/:plugin_name
 * Get latest backup for a plugin
 */
router.get('/backup/:merchant_id/:plugin_name', requireRole(['ops_plugins', 'pay_admin', 'merchant']), async (req, res) => {
  try {
    const { merchant_id, plugin_name } = req.params;
    const { version } = req.query;

    let query = `
      SELECT *
      FROM plugin_backups
      WHERE merchant_id = $1
        AND plugin_name = $2
        AND backup_status = 'completed'
        AND expires_at > now()
    `;
    const params = [merchant_id, plugin_name];

    if (version) {
      query += ` AND version = $3`;
      params.push(version);
    }

    query += ` ORDER BY created_at DESC LIMIT 1`;

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'backup_not_found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('❌ Get backup failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/plugins/backup/cleanup
 * Cleanup expired backups
 */
router.post('/backup/cleanup', requireRole(['ops_plugins', 'pay_admin']), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT cleanup_expired_backups() as deleted_count');
    const deletedCount = rows[0].deleted_count;

    console.log(`✅ Cleaned up ${deletedCount} expired backups`);

    res.json({
      ok: true,
      deleted_count: deletedCount
    });
  } catch (error) {
    console.error('❌ Backup cleanup failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * ============================================================================
 * Sous-Brique 115ter: Progressive Rollout Endpoints
 * ============================================================================
 */

/**
 * POST /api/plugins/rollouts
 * Create a progressive rollout
 */
router.post('/rollouts', requireRole(['ops_plugins', 'pay_admin']), async (req, res) => {
  try {
    const {
      plugin_name,
      version,
      percentage = 5,
      strategy = 'random',
      target_countries,
      target_tiers,
      error_threshold = 0.03
    } = req.body;

    // Validation
    if (!plugin_name || !version) {
      return res.status(400).json({
        error: 'missing_required_fields',
        required: ['plugin_name', 'version']
      });
    }

    if (percentage < 0 || percentage > 100) {
      return res.status(400).json({ error: 'percentage must be between 0 and 100' });
    }

    const validStrategies = ['random', 'geo', 'merchant_tier'];
    if (!validStrategies.includes(strategy)) {
      return res.status(400).json({ error: 'invalid_strategy', valid: validStrategies });
    }

    const { rows } = await pool.query(
      `INSERT INTO plugin_rollouts (
        plugin_name, version, rollout_percentage, rollout_strategy,
        target_countries, target_tiers, error_threshold
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        plugin_name,
        version,
        percentage,
        strategy,
        target_countries || null,
        target_tiers || null,
        error_threshold
      ]
    );

    console.log(`✅ Rollout created: ${plugin_name} v${version} @ ${percentage}% (${strategy})`);

    res.json({
      ok: true,
      message: 'Rollout lancé',
      rollout: rows[0]
    });
  } catch (error) {
    console.error('❌ Rollout creation failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/plugins/rollouts/:plugin_name
 * Get active rollout for a plugin
 */
router.get('/rollouts/:plugin_name', async (req, res) => {
  try {
    const { plugin_name } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM plugin_rollouts
       WHERE plugin_name = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [plugin_name]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'no_rollout_found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('❌ Get rollout failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * PATCH /api/plugins/rollouts/:id
 * Update rollout percentage or status
 */
router.patch('/rollouts/:id', requireRole(['ops_plugins', 'pay_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { percentage, status } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (percentage !== undefined) {
      if (percentage < 0 || percentage > 100) {
        return res.status(400).json({ error: 'percentage must be between 0 and 100' });
      }
      updates.push(`rollout_percentage = $${paramIndex++}`);
      params.push(percentage);
    }

    if (status !== undefined) {
      const validStatuses = ['active', 'paused', 'completed', 'rolled_back'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'invalid_status', valid: validStatuses });
      }
      updates.push(`status = $${paramIndex++}`);
      params.push(status);

      if (status === 'completed') {
        updates.push(`completed_at = now()`);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'no_updates_provided' });
    }

    params.push(id);

    const { rows } = await pool.query(
      `UPDATE plugin_rollouts
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'rollout_not_found' });
    }

    console.log(`✅ Rollout updated: ${rows[0].plugin_name} → ${rows[0].rollout_percentage}%`);

    res.json({ ok: true, rollout: rows[0] });
  } catch (error) {
    console.error('❌ Rollout update failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/plugins/rollouts
 * List all rollouts with filters
 */
router.get('/rollouts', requireRole(['ops_plugins', 'pay_admin', 'merchant_view']), async (req, res) => {
  try {
    const { status, plugin_name, limit = 50 } = req.query;

    let query = 'SELECT * FROM v_active_rollouts WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      params.push(status);
      query += ` AND status = $${paramIndex++}`;
    }

    if (plugin_name) {
      params.push(plugin_name);
      query += ` AND plugin_name = $${paramIndex++}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);

    res.json({
      rollouts: rows,
      total: rows.length
    });
  } catch (error) {
    console.error('❌ List rollouts failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/plugins/rollouts/:id/pause
 * Pause a rollout (Sira integration)
 */
router.post('/rollouts/:id/pause', requireRole(['ops_plugins', 'pay_admin', 'sira_service']), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { rows } = await pool.query(
      `UPDATE plugin_rollouts
       SET status = 'paused',
           metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{pause_reason}',
             to_jsonb($2::text)
           )
       WHERE id = $1
       RETURNING *`,
      [id, reason || 'Manual pause']
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'rollout_not_found' });
    }

    console.log(`⏸️ Rollout paused: ${rows[0].plugin_name} - ${reason}`);

    res.json({ ok: true, rollout: rows[0] });
  } catch (error) {
    console.error('❌ Rollout pause failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/plugins/rollouts/auto-check
 * Check all active rollouts for errors (Sira cron job)
 */
router.post('/rollouts/auto-check', requireRole(['sira_service', 'ops_plugins']), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT auto_pause_failing_rollouts() as paused_count');
    const pausedCount = rows[0].paused_count;

    console.log(`🤖 Auto-check: ${pausedCount} rollout(s) paused due to errors`);

    res.json({
      ok: true,
      paused_count: pausedCount
    });
  } catch (error) {
    console.error('❌ Auto-check failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/plugins/rollouts/:id/should-upgrade
 * Check if a merchant should receive upgrade
 */
router.post('/rollouts/:id/should-upgrade', async (req, res) => {
  try {
    const { id } = req.params;
    const { merchant_id, merchant_country, merchant_tier } = req.body;

    if (!merchant_id) {
      return res.status(400).json({ error: 'merchant_id required' });
    }

    // Get rollout
    const { rows: rolloutRows } = await pool.query(
      'SELECT * FROM plugin_rollouts WHERE id = $1',
      [id]
    );

    if (rolloutRows.length === 0) {
      return res.status(404).json({ error: 'rollout_not_found' });
    }

    const rollout = rolloutRows[0];

    // Check via SQL function
    const { rows } = await pool.query(
      'SELECT should_merchant_upgrade($1, $2, $3, $4) as should_upgrade',
      [merchant_id, rollout.plugin_name, merchant_country, merchant_tier]
    );

    const shouldUpgrade = rows[0].should_upgrade;

    res.json({
      should_upgrade: shouldUpgrade,
      rollout_info: {
        plugin_name: rollout.plugin_name,
        version: rollout.version,
        percentage: rollout.rollout_percentage,
        strategy: rollout.rollout_strategy
      }
    });
  } catch (error) {
    console.error('❌ Should upgrade check failed:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

module.exports = { router, setPool };
