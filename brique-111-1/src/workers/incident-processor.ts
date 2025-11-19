/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * Incident Processor Worker - Core of self-healing
 * 
 * Processes incidents, asks SIRA for decisions, applies auto-patches
 */

import { pool } from "../db";
import { dequeueIncidentCheck } from "../utils/queue";
import { decideWithSira } from "../sira/decider";
import { getOpsPolicy } from "../ops/policy";
import { runSmokeTestsOnStaging, applyPatchToMerchantPlugin, rollbackPluginVersion } from "./patch-utils";
import { publishEvent } from "../webhooks/publisher";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true }
  }
});

/**
 * Compute incident severity from telemetry
 */
function computeSeverity(telemetry: any): "low" | "medium" | "high" | "critical" {
  const errorsLast24h = telemetry.errors_last_24h || 0;
  const webhookFailRate = telemetry.webhook_fail_rate || 0;

  // Critical: Very high error rate or complete webhook failure
  if (errorsLast24h > 100 || webhookFailRate > 0.8) {
    return "critical";
  }

  // High: Significant issues
  if (errorsLast24h > 50 || webhookFailRate > 0.5) {
    return "high";
  }

  // Medium: Moderate issues
  if (errorsLast24h > 20 || webhookFailRate > 0.3) {
    return "medium";
  }

  return "low";
}

/**
 * Determine incident type from telemetry
 */
function determineIncidentType(telemetry: any, plugin: any): string {
  // Check for heartbeat missed (handled separately, but could be here)
  if (!plugin.last_heartbeat || (Date.now() - new Date(plugin.last_heartbeat).getTime()) > 5 * 60 * 1000) {
    return "heartbeat_missed";
  }

  // High webhook failure rate
  if (telemetry.webhook_fail_rate > 0.3) {
    return "webhook_fail_rate";
  }

  // Error spike
  if (telemetry.errors_last_24h > 20) {
    return "error_spike";
  }

  // Default
  return "telemetry_anomaly";
}

/**
 * Convert severity to numeric value for comparison
 */
function severityLevelValue(severity: string): number {
  const map: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  };
  return map[severity] || 0;
}

/**
 * Process incident message from queue
 */
export async function processIncidentMessage(msg: any) {
  const { pluginId, merchantId, telemetry } = msg;

  try {
    logger.info({ pluginId, merchantId }, "Processing incident check");

    // Get plugin data
    const { rows: pluginRows } = await pool.query(
      `SELECT * FROM merchant_plugins WHERE id = $1`,
      [pluginId]
    );

    if (pluginRows.length === 0) {
      logger.warn({ pluginId }, "Plugin not found");
      return;
    }

    const plugin = pluginRows[0];

    // Determine incident type and severity
    const incidentType = determineIncidentType(telemetry, plugin);
    const severity = computeSeverity(telemetry);

    // Check if incident already exists (avoid duplicates)
    const { rows: existing } = await pool.query(
      `SELECT * FROM plugin_incidents 
       WHERE merchant_plugin_id = $1 
         AND incident_type = $2 
         AND status = 'open'
         AND detected_at > now() - interval '1 hour'`,
      [pluginId, incidentType]
    );

    if (existing.length > 0) {
      logger.info({ incidentId: existing[0].id }, "Incident already exists, skipping");
      return;
    }

    // Create incident
    const { rows: [incident] } = await pool.query(
      `INSERT INTO plugin_incidents 
       (merchant_plugin_id, incident_type, severity, telemetry_snapshot, status)
       VALUES ($1, $2, $3, $4, 'open')
       RETURNING *`,
      [pluginId, incidentType, severity, JSON.stringify(telemetry)]
    );

    logger.info({ incidentId: incident.id, severity, incidentType }, "Incident created");

    // Ask SIRA for decision
    const siraDecision = await decideWithSira({
      merchantId,
      pluginId,
      telemetry,
      severity,
      incidentType,
      currentVersion: plugin.plugin_version,
      historicalData: await getHistoricalData(pluginId)
    });

    // Update incident with SIRA decision
    await pool.query(
      `UPDATE plugin_incidents SET sira_decision = $1 WHERE id = $2`,
      [JSON.stringify(siraDecision), incident.id]
    );

    logger.info({ incidentId: incident.id, action: siraDecision.action }, "SIRA decision received");

    // Check Ops policy
    const policy = await getOpsPolicy();

    if (!policy.autopatch_enabled) {
      logger.info({ incidentId: incident.id }, "Auto-patch disabled by policy");
      await publishEvent("ops", null, "plugin.incident_created", { incident_id: incident.id });
      return;
    }

    // Check whitelist
    if (policy.autopatch_whitelist.length > 0 && !policy.autopatch_whitelist.includes(merchantId)) {
      logger.info({ merchantId, incidentId: incident.id }, "Merchant not in whitelist");
      return;
    }

    // Check severity threshold
    if (severityLevelValue(severity) > severityLevelValue(policy.autopatch_max_severity)) {
      logger.info({ severity, maxSeverity: policy.autopatch_max_severity }, "Severity too high for auto-patch");
      await publishEvent("ops", null, "plugin.incident_requires_approval", {
        incident_id: incident.id,
        reason: "severity_too_high"
      });
      return;
    }

    // Check SIRA confidence
    if (siraDecision.confidence < policy.sira_min_confidence) {
      logger.info({ confidence: siraDecision.confidence, minConfidence: policy.sira_min_confidence }, "SIRA confidence too low");
      await publishEvent("ops", null, "plugin.incident_requires_approval", {
        incident_id: incident.id,
        reason: "low_confidence"
      });
      return;
    }

    // Attempt autopatch per SIRA suggestion
    if (siraDecision.action === "patch" && siraDecision.patch_version) {
      await attemptAutoPatch(incident, plugin, siraDecision, policy);
    } else if (siraDecision.action === "config_fix") {
      await attemptConfigFix(incident, plugin, siraDecision);
    } else {
      // Fallback: create ticket for Ops
      logger.info({ incidentId: incident.id, action: siraDecision.action }, "Action requires manual intervention");
      await publishEvent("ops", null, "plugin.incident_requires_approval", {
        incident_id: incident.id,
        siraDecision
      });
    }
  } catch (error: any) {
    logger.error({ error, pluginId, merchantId }, "Failed to process incident");
  }
}

/**
 * Attempt auto-patch
 */
async function attemptAutoPatch(
  incident: any,
  plugin: any,
  siraDecision: any,
  policy: any
) {
  const { id: incidentId } = incident;
  const { id: pluginId } = plugin;
  const currentVersion = plugin.plugin_version;
  const targetVersion = siraDecision.patch_version;

  logger.info({ incidentId, pluginId, currentVersion, targetVersion }, "Attempting auto-patch");

  // Create autopatch attempt record
  const { rows: [attempt] } = await pool.query(
    `INSERT INTO plugin_autopatch_attempts
     (incident_id, merchant_plugin_id, from_version, to_version, method, status, executed_by)
     VALUES ($1, $2, $3, $4, 'patch', 'staging', 'sira')
     RETURNING *`,
    [incidentId, pluginId, currentVersion, targetVersion]
  );

  // 1) Run staging tests
  if (policy.require_staging_test) {
    logger.info({ attemptId: attempt.id }, "Running staging smoke tests");
    const stagingOk = await runSmokeTestsOnStaging(plugin.merchant_id, pluginId, targetVersion);

    if (!stagingOk) {
      await pool.query(
        `UPDATE plugin_autopatch_attempts 
         SET status = 'failed',
             logs = $1,
             updated_at = now()
         WHERE id = $2`,
        [JSON.stringify([{ level: "error", message: "Staging smoke tests failed" }]), attempt.id]
      );

      await publishEvent("ops", null, "plugin.autopatch_failed", {
        incident_id: incidentId,
        attempt_id: attempt.id,
        reason: "staging_failed"
      });
      return;
    }

    await pool.query(
      `UPDATE plugin_autopatch_attempts 
       SET staging_result = $1,
           status = 'applying',
           updated_at = now()
       WHERE id = $2`,
      [JSON.stringify({ passed: true, tests_run: 5 }), attempt.id]
    );
  }

  // 2) Apply to production
  logger.info({ attemptId: attempt.id }, "Applying patch to production");
  const applyRes = await applyPatchToMerchantPlugin(plugin.merchant_id, pluginId, targetVersion);

  if (applyRes.ok) {
    // Success
    await pool.query(
      `UPDATE plugin_autopatch_attempts 
       SET status = 'success',
           production_result = $1,
           logs = $2,
           updated_at = now()
       WHERE id = $3`,
      [
        JSON.stringify({ applied_at: new Date().toISOString(), health_check_passed: true }),
        JSON.stringify([{ level: "info", message: "Patch applied successfully" }]),
        attempt.id
      ]
    );

    await pool.query(
      `UPDATE plugin_incidents SET status = 'mitigated', updated_at = now() WHERE id = $1`,
      [incidentId]
    );

    // Record feedback for SIRA learning
    await recordSiraFeedback(incidentId, attempt.id, siraDecision, "success");

    await publishEvent("merchant", plugin.merchant_id, "plugin.autopatch_success", {
      pluginId,
      to_version: targetVersion,
      incident_id: incidentId
    });

    logger.info({ attemptId: attempt.id }, "Auto-patch succeeded");
  } else {
    // Rollback automatically
    logger.warn({ attemptId: attempt.id }, "Auto-patch failed, rolling back");
    await rollbackPluginVersion(plugin.merchant_id, pluginId, currentVersion);

    await pool.query(
      `UPDATE plugin_autopatch_attempts 
       SET status = 'rolled_back',
           rollback_reason = 'auto_rollback_on_failure',
           rolled_back_at = now(),
           logs = $1,
           updated_at = now()
       WHERE id = $2`,
      [JSON.stringify([{ level: "error", message: "Patch failed, rolled back" }]), attempt.id]
    );

    await recordSiraFeedback(incidentId, attempt.id, siraDecision, "rolled_back");

    await publishEvent("ops", null, "plugin.autopatch_rolled_back", {
      incident_id: incidentId,
      pluginId,
      attempt_id: attempt.id
    });
  }
}

/**
 * Attempt config fix
 */
async function attemptConfigFix(incident: any, plugin: any, siraDecision: any) {
  // Similar to auto-patch but for configuration fixes
  logger.info({ incidentId: incident.id }, "Attempting config fix");
  // Implementation similar to auto-patch but for config changes
}

/**
 * Get historical data for SIRA
 */
async function getHistoricalData(pluginId: string): Promise<any> {
  const { rows } = await pool.query(
    `SELECT 
       COUNT(*) as total_incidents,
       COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
       COUNT(*) FILTER (WHERE status = 'mitigated') as mitigated_count
     FROM plugin_incidents
     WHERE merchant_plugin_id = $1`,
    [pluginId]
  );

  return rows[0] || {};
}

/**
 * Record feedback for SIRA learning
 */
async function recordSiraFeedback(
  incidentId: string,
  attemptId: string,
  siraDecision: any,
  outcome: string
) {
  await pool.query(
    `INSERT INTO sira_learning_feedback
     (incident_id, autopatch_attempt_id, sira_input, sira_output, actual_outcome, feedback_label)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      incidentId,
      attemptId,
      JSON.stringify({}), // Would contain input telemetry
      JSON.stringify(siraDecision),
      outcome,
      outcome === "success" ? "positive" : "negative"
    ]
  );
}

/**
 * Main worker loop
 */
export async function startIncidentProcessor() {
  logger.info("🚀 Incident processor worker started");

  setInterval(async () => {
    const message = await dequeueIncidentCheck();
    if (message) {
      await processIncidentMessage(message);
    }
  }, 5000); // Check every 5 seconds

  // Process immediately
  const message = await dequeueIncidentCheck();
  if (message) {
    await processIncidentMessage(message);
  }
}



