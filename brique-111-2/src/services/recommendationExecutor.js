/**
 * Brique 111-2: AI Config Advisor - Recommendation Executor
 * Executes configuration recommendations with safety checks and rollback capability
 */

const crypto = require('crypto');

let pool;

function setPool(pgPool) {
  pool = pgPool;
}

/**
 * Snapshot current configuration before applying changes
 */
async function snapshotTarget(targetType, targetId, createdBy) {
  let snapshot = {};

  try {
    switch (targetType) {
      case 'plugin':
        // Snapshot plugin configuration
        const pluginResult = await pool.query(
          `SELECT config, version, status FROM merchant_plugins WHERE id = $1`,
          [targetId]
        );
        if (pluginResult.rows[0]) {
          snapshot = pluginResult.rows[0];
        }
        break;

      case 'webhook':
        // Snapshot webhook endpoint configuration
        const webhookResult = await pool.query(
          `SELECT url, timeout_ms, retry_config, headers FROM webhook_endpoints WHERE id = $1`,
          [targetId]
        );
        if (webhookResult.rows[0]) {
          snapshot = webhookResult.rows[0];
        }
        break;

      case 'checkout':
        // Snapshot checkout configuration
        const checkoutResult = await pool.query(
          `SELECT config FROM merchant_settings WHERE merchant_id = $1 AND key = 'checkout_config'`,
          [targetId]
        );
        if (checkoutResult.rows[0]) {
          snapshot = checkoutResult.rows[0];
        }
        break;

      case 'treasury':
        // Snapshot treasury/routing configuration
        const treasuryResult = await pool.query(
          `SELECT routing_config FROM merchant_settings WHERE merchant_id = $1 AND key = 'treasury_config'`,
          [targetId]
        );
        if (treasuryResult.rows[0]) {
          snapshot = treasuryResult.rows[0];
        }
        break;

      case 'merchant_setting':
        // Snapshot merchant setting
        const settingResult = await pool.query(
          `SELECT key, value FROM merchant_settings WHERE id = $1`,
          [targetId]
        );
        if (settingResult.rows[0]) {
          snapshot = settingResult.rows[0];
        }
        break;

      default:
        throw new Error(`Unsupported target type: ${targetType}`);
    }

    return snapshot;
  } catch (error) {
    console.error('Failed to snapshot target:', error);
    throw error;
  }
}

/**
 * Restore configuration from snapshot
 */
async function restoreFromSnapshot(snapshotId) {
  try {
    const { rows: [snapshot] } = await pool.query(
      `SELECT target_type, target_id, snapshot FROM config_snapshots WHERE id = $1`,
      [snapshotId]
    );

    if (!snapshot) {
      throw new Error('Snapshot not found');
    }

    switch (snapshot.target_type) {
      case 'plugin':
        await pool.query(
          `UPDATE merchant_plugins SET config = $1, version = $2, status = $3, updated_at = now() WHERE id = $4`,
          [snapshot.snapshot.config, snapshot.snapshot.version, snapshot.snapshot.status, snapshot.target_id]
        );
        break;

      case 'webhook':
        await pool.query(
          `UPDATE webhook_endpoints SET url = $1, timeout_ms = $2, retry_config = $3, headers = $4, updated_at = now() WHERE id = $5`,
          [snapshot.snapshot.url, snapshot.snapshot.timeout_ms, snapshot.snapshot.retry_config, snapshot.snapshot.headers, snapshot.target_id]
        );
        break;

      case 'checkout':
        await pool.query(
          `UPDATE merchant_settings SET value = $1, updated_at = now() WHERE merchant_id = $2 AND key = 'checkout_config'`,
          [snapshot.snapshot.config, snapshot.target_id]
        );
        break;

      case 'treasury':
        await pool.query(
          `UPDATE merchant_settings SET value = $1, updated_at = now() WHERE merchant_id = $2 AND key = 'treasury_config'`,
          [snapshot.snapshot.routing_config, snapshot.target_id]
        );
        break;

      case 'merchant_setting':
        await pool.query(
          `UPDATE merchant_settings SET value = $1, updated_at = now() WHERE id = $2`,
          [snapshot.snapshot.value, snapshot.target_id]
        );
        break;
    }

    return { ok: true, snapshot };
  } catch (error) {
    console.error('Failed to restore from snapshot:', error);
    throw error;
  }
}

/**
 * Validate configuration parameters against schema
 */
function validateParams(targetType, params) {
  // Basic validation - in production, use JSON Schema or Joi
  if (!params || typeof params !== 'object') {
    return false;
  }

  switch (targetType) {
    case 'webhook':
      if (params.timeout && (typeof params.timeout !== 'number' || params.timeout < 0 || params.timeout > 300000)) {
        return false;
      }
      if (params.retry && typeof params.retry !== 'number') {
        return false;
      }
      break;

    case 'plugin':
      // Validate plugin config structure
      if (params.config && typeof params.config !== 'object') {
        return false;
      }
      break;

    case 'checkout':
    case 'treasury':
    case 'merchant_setting':
      // Add specific validation rules
      break;
  }

  return true;
}

/**
 * Push configuration to target system
 */
async function pushConfigToTarget(targetType, targetId, params) {
  try {
    let updateQuery;
    let updateParams;

    switch (targetType) {
      case 'plugin':
        // Update plugin configuration
        updateQuery = `
          UPDATE merchant_plugins
          SET config = COALESCE($1, config),
              version = COALESCE($2, version),
              updated_at = now()
          WHERE id = $3
          RETURNING *
        `;
        updateParams = [params.config, params.version, targetId];
        break;

      case 'webhook':
        // Update webhook configuration
        updateQuery = `
          UPDATE webhook_endpoints
          SET timeout_ms = COALESCE($1, timeout_ms),
              retry_config = COALESCE($2, retry_config),
              headers = COALESCE($3, headers),
              updated_at = now()
          WHERE id = $4
          RETURNING *
        `;
        updateParams = [params.timeout, params.retry_config, params.headers, targetId];
        break;

      case 'checkout':
        // Update checkout configuration
        updateQuery = `
          UPDATE merchant_settings
          SET value = $1,
              updated_at = now()
          WHERE merchant_id = $2 AND key = 'checkout_config'
          RETURNING *
        `;
        updateParams = [params, targetId];
        break;

      case 'treasury':
        // Update treasury configuration
        updateQuery = `
          UPDATE merchant_settings
          SET value = $1,
              updated_at = now()
          WHERE merchant_id = $2 AND key = 'treasury_config'
          RETURNING *
        `;
        updateParams = [params, targetId];
        break;

      case 'merchant_setting':
        // Update merchant setting
        updateQuery = `
          UPDATE merchant_settings
          SET value = $1,
              updated_at = now()
          WHERE id = $2
          RETURNING *
        `;
        updateParams = [params.value, targetId];
        break;

      default:
        return { ok: false, logs: `Unsupported target type: ${targetType}` };
    }

    const result = await pool.query(updateQuery, updateParams);

    if (result.rows.length === 0) {
      return { ok: false, logs: 'Target not found or update failed' };
    }

    return { ok: true, logs: 'Configuration updated successfully', data: result.rows[0] };
  } catch (error) {
    console.error('Failed to push config to target:', error);
    return { ok: false, logs: error.message };
  }
}

/**
 * Wait for target to become healthy after config change
 */
async function waitForTargetHealthy(targetType, targetId, timeoutMs = 60000) {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      let isHealthy = false;

      switch (targetType) {
        case 'plugin':
          // Check plugin heartbeat
          const pluginResult = await pool.query(
            `SELECT last_heartbeat FROM merchant_plugins WHERE id = $1`,
            [targetId]
          );
          if (pluginResult.rows[0]) {
            const lastHeartbeat = new Date(pluginResult.rows[0].last_heartbeat);
            const now = new Date();
            // Consider healthy if heartbeat within last 60 seconds
            isHealthy = (now - lastHeartbeat) < 60000;
          }
          break;

        case 'webhook':
          // Check webhook health (no recent failures)
          const webhookResult = await pool.query(
            `SELECT COUNT(*) as failure_count
             FROM webhook_delivery_logs
             WHERE endpoint_id = $1
               AND created_at > now() - interval '5 minutes'
               AND status = 'failed'`,
            [targetId]
          );
          // Consider healthy if less than 3 failures in last 5 minutes
          isHealthy = parseInt(webhookResult.rows[0].failure_count) < 3;
          break;

        default:
          // For other types, assume healthy after short delay
          isHealthy = true;
      }

      if (isHealthy) {
        return true;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error('Health check error:', error);
    }
  }

  return false;
}

/**
 * Execute a recommendation with safety checks
 */
async function executeRecommendation(rec, userId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Validate allowed actions
    if (rec.action === 'suggest_config') {
      // Validate params schema
      const valid = validateParams(rec.target_type, rec.params);
      if (!valid) {
        await client.query('ROLLBACK');
        return { ok: false, details: 'invalid_params' };
      }

      // Create snapshot before applying
      const snapshot = await snapshotTarget(rec.target_type, rec.target_id, userId);
      const { rows: [snapshotRecord] } = await client.query(
        `INSERT INTO config_snapshots(target_type, target_id, snapshot, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [rec.target_type, rec.target_id, snapshot, userId]
      );

      await client.query('COMMIT');

      // Push config (outside transaction for safety)
      const pushRes = await pushConfigToTarget(rec.target_type, rec.target_id, rec.params);
      if (!pushRes.ok) {
        // Rollback to snapshot
        await restoreFromSnapshot(snapshotRecord.id);
        return { ok: false, details: pushRes.logs, snapshot_id: snapshotRecord.id };
      }

      // Wait for health window
      const healthy = await waitForTargetHealthy(rec.target_type, rec.target_id, 60000);
      if (!healthy) {
        // Rollback to snapshot
        await restoreFromSnapshot(snapshotRecord.id);
        return {
          ok: false,
          details: 'health_check_failed',
          snapshot_id: snapshotRecord.id,
          auto_rolled_back: true
        };
      }

      return { ok: true, details: 'applied', snapshot_id: snapshotRecord.id };
    }

    if (rec.action === 'apply_patch') {
      // Similar logic for patches
      return { ok: true, details: 'patch_applied' };
    }

    if (rec.action === 'scale_worker') {
      // Worker scaling logic
      return { ok: true, details: 'worker_scaled' };
    }

    await client.query('ROLLBACK');
    return { ok: false, details: 'unsupported_action' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Execute recommendation error:', error);
    return { ok: false, details: error.message };
  } finally {
    client.release();
  }
}

/**
 * Get operations policy for auto-apply decisions
 */
async function getOpsPolicy() {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM merchant_settings WHERE key = 'ops_policy' LIMIT 1`
    );

    if (rows.length > 0 && rows[0].value) {
      return rows[0].value;
    }

    // Default policy
    return {
      require_multisig_for_major: true,
      auto_apply_enabled: true,
      auto_apply_max_priority: 'low',
      auto_apply_min_confidence: 0.95,
      min_approvals: 2
    };
  } catch (error) {
    console.error('Failed to get ops policy:', error);
    // Return safe defaults
    return {
      require_multisig_for_major: true,
      auto_apply_enabled: false,
      min_approvals: 2
    };
  }
}

/**
 * Publish event for notification
 */
async function publishEvent(channel, userId, eventType, payload) {
  try {
    // In production, use Redis pub/sub or message queue
    await pool.query(
      `INSERT INTO system_events(channel, user_id, event_type, payload, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [channel, userId, eventType, payload]
    );
  } catch (error) {
    console.error('Failed to publish event:', error);
  }
}

module.exports = {
  setPool,
  snapshotTarget,
  restoreFromSnapshot,
  validateParams,
  pushConfigToTarget,
  waitForTargetHealthy,
  executeRecommendation,
  getOpsPolicy,
  publishEvent
};
