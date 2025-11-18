// src/services/autoHealing.js
// Auto-Healing Service for Plugin Management

let pool; // Initialized by setPool()

/**
 * Detect issue and create auto-healing log
 * @param {Object} params - Detection parameters
 * @returns {Promise<Object>} Healing log
 */
async function detectAndLogIssue({ plugin_id, detected_issue, issue_severity, patch_type, sira_decision, sira_confidence }) {
  try {
    const { rows: [log] } = await pool.query(
      `INSERT INTO plugin_auto_healing_logs (
        plugin_id, detected_issue, issue_severity, applied_patch,
        patch_type, status, sira_decision, sira_confidence
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
      RETURNING *`,
      [
        plugin_id,
        detected_issue,
        issue_severity || 'medium',
        sira_decision.proposed_patch || {},
        patch_type || 'bug_fix',
        sira_decision,
        sira_confidence || 0
      ]
    );

    console.log(`[AUTO-HEAL] Issue detected for plugin ${plugin_id}: ${detected_issue}`);
    return log;
  } catch (error) {
    console.error('[AUTO-HEAL] Failed to log issue:', error);
    throw error;
  }
}

/**
 * Apply patch to plugin
 * @param {string} healing_log_id - Healing log ID
 * @param {Object} patch - Patch to apply
 * @returns {Promise<Object>} Updated log
 */
async function applyPatch(healing_log_id, patch) {
  try {
    // Get healing log
    const { rows: [log] } = await pool.query(
      'SELECT * FROM plugin_auto_healing_logs WHERE id = $1',
      [healing_log_id]
    );

    if (!log) {
      throw new Error('Healing log not found');
    }

    // Create snapshot before patch
    const { rows: [snapshot] } = await pool.query(
      `SELECT create_pre_patch_snapshot($1, $2, $3, $4) as snapshot_id`,
      [
        log.plugin_id,
        healing_log_id,
        patch.current_version || '0.0.0',
        patch.configuration || {}
      ]
    );

    console.log(`[AUTO-HEAL] Created snapshot ${snapshot.snapshot_id} before patch`);

    // Send command to plugin
    const command = await sendPluginCommand(log.plugin_id, {
      type: 'apply_patch',
      patch: patch,
      healing_log_id: healing_log_id
    });

    // Update log status
    const { rows: [updated] } = await pool.query(
      `UPDATE plugin_auto_healing_logs
       SET status = 'applied',
           applied_at = now(),
           applied_patch = $1
       WHERE id = $2
       RETURNING *`,
      [patch, healing_log_id]
    );

    console.log(`[AUTO-HEAL] Patch applied successfully: ${healing_log_id}`);
    return updated;
  } catch (error) {
    console.error('[AUTO-HEAL] Failed to apply patch:', error);

    // Mark as failed
    await pool.query(
      `UPDATE plugin_auto_healing_logs
       SET status = 'failed',
           rollback_reason = $1
       WHERE id = $2`,
      [error.message, healing_log_id]
    );

    throw error;
  }
}

/**
 * Rollback patch
 * @param {string} healing_log_id - Healing log ID
 * @param {string} reason - Rollback reason
 * @returns {Promise<Object>} Rollback result
 */
async function rollbackPatch(healing_log_id, reason) {
  try {
    // Find snapshot
    const { rows: [snapshot] } = await pool.query(
      'SELECT * FROM plugin_snapshots WHERE healing_log_id = $1 ORDER BY created_at DESC LIMIT 1',
      [healing_log_id]
    );

    if (!snapshot) {
      throw new Error('No snapshot found for rollback');
    }

    // Execute rollback
    const { rows: [result] } = await pool.query(
      'SELECT rollback_to_snapshot($1) as result',
      [snapshot.id]
    );

    // Send rollback command to plugin
    await sendPluginCommand(snapshot.plugin_id, {
      type: 'rollback',
      snapshot_id: snapshot.id,
      version: snapshot.plugin_version
    });

    console.log(`[AUTO-HEAL] Rolled back patch for log ${healing_log_id}: ${reason}`);
    return result.result;
  } catch (error) {
    console.error('[AUTO-HEAL] Rollback failed:', error);
    throw error;
  }
}

/**
 * Send command to plugin
 * @param {string} plugin_id - Plugin ID
 * @param {Object} command - Command object
 * @returns {Promise<Object>} Command record
 */
async function sendPluginCommand(plugin_id, command) {
  try {
    const { rows: [cmd] } = await pool.query(
      `INSERT INTO plugin_commands (
        plugin_id, command_type, command_payload,
        timeout_at, priority
      ) VALUES ($1, $2, $3, now() + interval '5 minutes', $4)
      RETURNING *`,
      [
        plugin_id,
        command.type,
        command,
        command.priority || 5
      ]
    );

    console.log(`[AUTO-HEAL] Command sent to plugin ${plugin_id}: ${command.type}`);
    return cmd;
  } catch (error) {
    console.error('[AUTO-HEAL] Failed to send command:', error);
    throw error;
  }
}

/**
 * Get pending commands for plugin
 * @param {string} plugin_id - Plugin ID
 * @returns {Promise<Array>} Pending commands
 */
async function getPendingCommands(plugin_id) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM plugin_commands
       WHERE plugin_id = $1
         AND execution_status IN ('pending', 'acknowledged')
         AND (timeout_at IS NULL OR timeout_at > now())
       ORDER BY priority DESC, issued_at ASC`,
      [plugin_id]
    );

    return rows;
  } catch (error) {
    console.error('[AUTO-HEAL] Failed to get pending commands:', error);
    return [];
  }
}

/**
 * Acknowledge command execution
 * @param {string} command_id - Command ID
 * @param {Object} result - Execution result
 * @returns {Promise<Object>} Updated command
 */
async function acknowledgeCommand(command_id, result) {
  try {
    const { rows: [cmd] } = await pool.query(
      `UPDATE plugin_commands
       SET execution_status = $1,
           executed_at = now(),
           execution_result = $2
       WHERE id = $3
       RETURNING *`,
      [
        result.success ? 'executed' : 'failed',
        result,
        command_id
      ]
    );

    console.log(`[AUTO-HEAL] Command ${command_id} acknowledged: ${result.success}`);
    return cmd;
  } catch (error) {
    console.error('[AUTO-HEAL] Failed to acknowledge command:', error);
    throw error;
  }
}

/**
 * Check auto-healing rules and apply if match
 * @param {string} plugin_id - Plugin ID
 * @param {string} error_message - Error message to match
 * @returns {Promise<Object|null>} Healing log if applied
 */
async function checkAndApplyRules(plugin_id, error_message) {
  try {
    // Get active rules
    const { rows: rules } = await pool.query(
      `SELECT * FROM auto_healing_rules
       WHERE is_active = true
       ORDER BY min_sira_confidence DESC`
    );

    for (const rule of rules) {
      // Check if error matches pattern
      const regex = new RegExp(rule.issue_pattern, 'i');
      if (regex.test(error_message)) {
        console.log(`[AUTO-HEAL] Rule matched: ${rule.rule_name}`);

        // Get plugin info
        const { rows: [plugin] } = await pool.query(
          'SELECT * FROM plugin_installations WHERE id = $1',
          [plugin_id]
        );

        // Check platform match
        if (!rule.platforms.includes('all') && !rule.platforms.includes(plugin.cms)) {
          continue;
        }

        // Create healing log
        const log = await detectAndLogIssue({
          plugin_id,
          detected_issue: error_message,
          issue_severity: 'medium',
          patch_type: rule.patch_template.type || 'bug_fix',
          sira_decision: {
            rule_id: rule.id,
            rule_name: rule.rule_name,
            proposed_patch: rule.patch_template
          },
          sira_confidence: rule.auto_apply ? 100 : 75
        });

        // Auto-apply if configured
        if (rule.auto_apply) {
          await applyPatch(log.id, rule.patch_template);
        }

        return log;
      }
    }

    return null;
  } catch (error) {
    console.error('[AUTO-HEAL] Failed to check rules:', error);
    return null;
  }
}

/**
 * Get auto-healing statistics
 * @param {number} days - Days to look back
 * @returns {Promise<Object>} Statistics
 */
async function getStats(days = 30) {
  try {
    const { rows: [stats] } = await pool.query(
      'SELECT * FROM get_auto_healing_stats($1)',
      [days]
    );

    return stats;
  } catch (error) {
    console.error('[AUTO-HEAL] Failed to get stats:', error);
    return {
      total_patches: 0,
      applied: 0,
      rolled_back: 0,
      failed: 0,
      avg_confidence: 0,
      success_rate: 0
    };
  }
}

/**
 * Get healing logs
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Healing logs
 */
async function getHealingLogs(filters = {}) {
  try {
    let query = `
      SELECT hl.*,
             pi.merchant_id,
             pi.cms,
             pi.plugin_version
      FROM plugin_auto_healing_logs hl
      JOIN plugin_installations pi ON pi.id = hl.plugin_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (filters.plugin_id) {
      params.push(filters.plugin_id);
      query += ` AND hl.plugin_id = $${paramIndex++}`;
    }

    if (filters.status) {
      params.push(filters.status);
      query += ` AND hl.status = $${paramIndex++}`;
    }

    if (filters.issue_severity) {
      params.push(filters.issue_severity);
      query += ` AND hl.issue_severity = $${paramIndex++}`;
    }

    query += ` ORDER BY hl.created_at DESC LIMIT ${filters.limit || 100}`;

    const { rows } = await pool.query(query, params);
    return rows;
  } catch (error) {
    console.error('[AUTO-HEAL] Failed to get healing logs:', error);
    return [];
  }
}

/**
 * Set database pool
 */
function setPool(dbPool) {
  pool = dbPool;
}

module.exports = {
  setPool,
  detectAndLogIssue,
  applyPatch,
  rollbackPatch,
  sendPluginCommand,
  getPendingCommands,
  acknowledgeCommand,
  checkAndApplyRules,
  getStats,
  getHealingLogs
};
