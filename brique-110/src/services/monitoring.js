// src/services/monitoring.js
// Plugin Monitoring Service

let pool; // Initialized by setPool()

/**
 * Check if plugin needs upgrade
 * @param {Object} installation - Plugin installation record
 * @returns {Promise<boolean>} True if upgrade available
 */
async function checkForUpgrades(installation) {
  try {
    // Get latest version for this CMS
    const { rows: [latest] } = await pool.query(
      `SELECT * FROM plugin_versions_registry
       WHERE cms = $1 AND is_latest = true`,
      [installation.cms]
    );

    if (!latest) {
      return false;
    }

    // Compare versions
    if (latest.version !== installation.plugin_version) {
      // Update status to outdated
      await pool.query(
        `UPDATE plugin_installations
         SET status = 'outdated'
         WHERE id = $1 AND status = 'active'`,
        [installation.id]
      );

      console.log(`[MONITORING] Plugin ${installation.id} is outdated: ${installation.plugin_version} -> ${latest.version}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error('[MONITORING] Upgrade check failed:', error);
    return false;
  }
}

/**
 * Get active Ops toggles for plugin
 * @param {string} plugin_id - Plugin ID
 * @returns {Promise<Object>} Active toggles
 */
async function getActiveToggles(plugin_id) {
  try {
    const { rows } = await pool.query(
      `SELECT toggle_key, toggle_value
       FROM plugin_ops_toggles
       WHERE plugin_id = $1
         AND (expires_at IS NULL OR expires_at > now())`,
      [plugin_id]
    );

    const toggles = {};
    rows.forEach(row => {
      toggles[row.toggle_key] = row.toggle_value;
    });

    return toggles;
  } catch (error) {
    console.error('[MONITORING] Get toggles failed:', error);
    return {};
  }
}

/**
 * Calculate and update error rate for plugin
 * @param {string} plugin_id - Plugin ID
 * @param {number} hours - Hours to look back
 * @returns {Promise<number>} Error rate percentage
 */
async function calculateErrorRate(plugin_id, hours = 24) {
  try {
    const { rows: [result] } = await pool.query(
      `SELECT calculate_plugin_error_rate($1, $2) as error_rate`,
      [plugin_id, hours]
    );

    const errorRate = parseFloat(result.error_rate) || 0;

    // Update plugin record
    await pool.query(
      `UPDATE plugin_installations
       SET error_rate = $1
       WHERE id = $2`,
      [errorRate, plugin_id]
    );

    return errorRate;
  } catch (error) {
    console.error('[MONITORING] Error rate calculation failed:', error);
    return 0;
  }
}

/**
 * Mark stale plugins (no heartbeat > 48 hours)
 * @returns {Promise<number>} Number of plugins marked stale
 */
async function markStalePlugins() {
  try {
    const { rows } = await pool.query(
      `UPDATE plugin_installations
       SET status = 'error'
       WHERE last_heartbeat < now() - interval '48 hours'
         AND status NOT IN ('blocked', 'deprecated')
       RETURNING id`
    );

    console.log(`[MONITORING] Marked ${rows.length} stale plugins`);
    return rows.length;
  } catch (error) {
    console.error('[MONITORING] Mark stale failed:', error);
    return 0;
  }
}

/**
 * Check for critical issues (high error rate, outdated plugins)
 * @returns {Promise<Object>} Alert summary
 */
async function checkCriticalIssues() {
  try {
    // Count outdated plugins
    const { rows: [outdated] } = await pool.query(
      `SELECT COUNT(*) as count,
              ROUND(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM plugin_installations)::NUMERIC * 100, 2) as percentage
       FROM plugin_installations
       WHERE status = 'outdated'`
    );

    // Count high error rate plugins
    const { rows: [highErrors] } = await pool.query(
      `SELECT COUNT(*) as count
       FROM plugin_installations
       WHERE error_rate > 5.0`
    );

    // Count blocked plugins
    const { rows: [blocked] } = await pool.query(
      `SELECT COUNT(*) as count
       FROM plugin_installations
       WHERE status = 'blocked'`
    );

    const alerts = [];

    // Alert if >20% outdated
    if (parseFloat(outdated.percentage) > 20) {
      alerts.push({
        type: 'outdated_plugins',
        severity: 'warning',
        message: `${outdated.percentage}% of plugins are outdated (${outdated.count} plugins)`,
        count: parseInt(outdated.count)
      });
    }

    // Alert if >5 plugins with high error rate
    if (parseInt(highErrors.count) > 5) {
      alerts.push({
        type: 'high_error_rate',
        severity: 'critical',
        message: `${highErrors.count} plugins have error rate > 5%`,
        count: parseInt(highErrors.count)
      });
    }

    console.log(`[MONITORING] Critical issues check: ${alerts.length} alerts`);
    return {
      alerts,
      outdated_count: parseInt(outdated.count),
      outdated_percentage: parseFloat(outdated.percentage),
      high_error_count: parseInt(highErrors.count),
      blocked_count: parseInt(blocked.count)
    };
  } catch (error) {
    console.error('[MONITORING] Critical issues check failed:', error);
    return { alerts: [] };
  }
}

/**
 * Get plugin health metrics
 * @param {string} plugin_id - Plugin ID
 * @param {number} days - Days to look back
 * @returns {Promise<Array>} Health metrics
 */
async function getPluginHealth(plugin_id, days = 7) {
  try {
    const { rows } = await pool.query(
      `SELECT *
       FROM plugin_health_metrics
       WHERE plugin_id = $1
         AND metric_date >= CURRENT_DATE - $2
       ORDER BY metric_date DESC`,
      [plugin_id, days]
    );

    return rows;
  } catch (error) {
    console.error('[MONITORING] Get plugin health failed:', error);
    return [];
  }
}

/**
 * Record daily health metrics for all plugins
 * @returns {Promise<number>} Number of metrics recorded
 */
async function recordDailyHealthMetrics() {
  try {
    const { rows: plugins } = await pool.query(
      `SELECT id FROM plugin_installations WHERE status != 'deprecated'`
    );

    let recorded = 0;

    for (const plugin of plugins) {
      const { rows: [metrics] } = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE event_type = 'payment_success') as successful_payments,
           COUNT(*) FILTER (WHERE event_type = 'payment_failed') as failed_payments,
           COUNT(*) FILTER (WHERE severity = 'error') as error_count,
           COUNT(*) FILTER (WHERE severity = 'warning') as warning_count
         FROM plugin_telemetry_events
         WHERE plugin_id = $1
           AND recorded_at >= CURRENT_DATE
           AND recorded_at < CURRENT_DATE + interval '1 day'`,
        [plugin.id]
      );

      await pool.query(
        `INSERT INTO plugin_health_metrics
         (plugin_id, metric_date, total_payments, successful_payments, failed_payments, error_count, warning_count)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
         ON CONFLICT (plugin_id, metric_date)
         DO UPDATE SET
           total_payments = EXCLUDED.total_payments,
           successful_payments = EXCLUDED.successful_payments,
           failed_payments = EXCLUDED.failed_payments,
           error_count = EXCLUDED.error_count,
           warning_count = EXCLUDED.warning_count`,
        [
          plugin.id,
          parseInt(metrics.successful_payments) + parseInt(metrics.failed_payments),
          parseInt(metrics.successful_payments),
          parseInt(metrics.failed_payments),
          parseInt(metrics.error_count),
          parseInt(metrics.warning_count)
        ]
      );

      recorded++;
    }

    console.log(`[MONITORING] Recorded health metrics for ${recorded} plugins`);
    return recorded;
  } catch (error) {
    console.error('[MONITORING] Daily health metrics failed:', error);
    return 0;
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
  checkForUpgrades,
  getActiveToggles,
  calculateErrorRate,
  markStalePlugins,
  checkCriticalIssues,
  getPluginHealth,
  recordDailyHealthMetrics
};
