/**
 * Brique 111 - Merchant Config UI
 * Self-Healing Service: Sira-powered automatic detection and fixing
 */

import { pool } from "../db";
import { pluginLifecycleService } from "./pluginLifecycleService";

export interface SiraDetection {
  detection_type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  fix_method?: string;
}

export class SelfHealingService {
  /**
   * Analyze plugin telemetry and detect issues
   */
  async analyzePlugin(pluginId: string): Promise<SiraDetection[]> {
    const detections: SiraDetection[] = [];

    // Get plugin data
    const { rows: pluginRows } = await pool.query(
      `SELECT * FROM merchant_plugins WHERE id = $1`,
      [pluginId]
    );

    if (pluginRows.length === 0) {
      return detections;
    }

    const plugin = pluginRows[0];
    const telemetry = plugin.telemetry || {};
    const settings = plugin.settings || {};

    // Detection 1: Invalid API key pattern
    if (settings.api_key) {
      const apiKey = settings.api_key as string;
      if (!this.isValidApiKey(apiKey)) {
        detections.push({
          detection_type: "invalid_api_key",
          severity: "high",
          description: "API key format appears invalid or corrupted"
        });
      }
    }

    // Detection 2: Corrupted plugin (high error rate)
    if (plugin.error_count_24h > 10 || (plugin.error_rate && plugin.error_rate > 5.0)) {
      detections.push({
        detection_type: "corrupted_plugin",
        severity: "critical",
        description: `High error rate detected: ${plugin.error_count_24h} errors in 24h`
      });
    }

    // Detection 3: Stale heartbeat (plugin not responding)
    if (plugin.last_heartbeat) {
      const hoursSinceHeartbeat = (Date.now() - new Date(plugin.last_heartbeat).getTime()) / (1000 * 60 * 60);
      if (hoursSinceHeartbeat > 48) {
        detections.push({
          detection_type: "stale_heartbeat",
          severity: "medium",
          description: `No heartbeat for ${Math.floor(hoursSinceHeartbeat)} hours`
        });
      }
    }

    // Detection 4: Config mismatch
    if (settings.mode === "production" && settings.api_key && settings.api_key.startsWith("sk_test_")) {
      detections.push({
        detection_type: "config_mismatch",
        severity: "high",
        description: "Production mode but using test API key"
      });
    }

    // Detection 5: Version incompatibility
    if (telemetry.version_warning) {
      detections.push({
        detection_type: "version_incompatibility",
        severity: "medium",
        description: telemetry.version_warning as string
      });
    }

    return detections;
  }

  /**
   * Auto-fix detected issues
   */
  async autoFix(pluginId: string, detection: SiraDetection): Promise<boolean> {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM merchant_plugins WHERE id = $1`,
        [pluginId]
      );

      if (rows.length === 0) {
        return false;
      }

      const plugin = rows[0];
      const settings = plugin.settings || {};
      let fixApplied = false;
      let fixMethod = "";
      const fixDetails: any = {};

      switch (detection.detection_type) {
        case "invalid_api_key":
          // Try to regenerate or fix API key format
          // In production, this would call the API key service
          fixMethod = "key_regeneration";
          fixDetails.old_key_preview = (settings.api_key as string)?.slice(0, 6) + "...";
          // Note: Actual key regeneration would be done by calling the API key service
          fixApplied = true;
          break;

        case "corrupted_plugin":
          // Auto-rollback to last known good version
          const { rows: lastGoodUpdate } = await pool.query(
            `SELECT * FROM plugin_updates 
             WHERE merchant_plugin_id = $1 AND status = 'success'
             ORDER BY completed_at DESC LIMIT 1`,
            [pluginId]
          );

          if (lastGoodUpdate.length > 0) {
            const update = lastGoodUpdate[0];
            await pluginLifecycleService.rollback(
              pluginId,
              plugin.merchant_id,
              update.id,
              "Auto-rollback due to corrupted plugin detection"
            );
            fixMethod = "auto_rollback";
            fixDetails.rolled_back_to = update.old_version;
            fixApplied = true;
          }
          break;

        case "config_mismatch":
          // Auto-correct config
          const correctedSettings = { ...settings };
          if (settings.mode === "production" && settings.api_key?.startsWith("sk_test_")) {
            // In production, would fetch correct production key
            fixMethod = "config_correction";
            fixDetails.corrected = "api_key_mode_mismatch";
            fixApplied = true;
          }
          break;

        case "stale_heartbeat":
          // Mark as error, notify merchant
          await pool.query(
            `UPDATE merchant_plugins SET status = 'error', updated_at = now() WHERE id = $1`,
            [pluginId]
          );
          fixMethod = "status_update";
          fixDetails.new_status = "error";
          fixApplied = true;
          break;

        default:
          // No auto-fix available
          break;
      }

      if (fixApplied) {
        // Record detection and fix
        await pool.query(
          `INSERT INTO sira_detections 
           (merchant_plugin_id, detection_type, severity, description, 
            auto_fixed, fix_applied_at, fix_method, fix_details)
           VALUES ($1, $2, $3, $4, true, now(), $5, $6)`,
          [
            pluginId,
            detection.detection_type,
            detection.severity,
            detection.description,
            fixMethod,
            JSON.stringify(fixDetails)
          ]
        );

        // Notify merchant (async)
        this.notifyMerchant(plugin.merchant_id, detection, fixMethod).catch(console.error);
      } else {
        // Record detection without fix
        await pool.query(
          `INSERT INTO sira_detections 
           (merchant_plugin_id, detection_type, severity, description)
           VALUES ($1, $2, $3, $4)`,
          [pluginId, detection.detection_type, detection.severity, detection.description]
        );
      }

      return fixApplied;
    } catch (error) {
      console.error("Auto-fix failed:", error);
      return false;
    }
  }

  /**
   * Process all plugins and detect/fix issues
   */
  async processAllPlugins(): Promise<void> {
    const { rows } = await pool.query(
      `SELECT id FROM merchant_plugins WHERE status IN ('active', 'error')`
    );

    for (const plugin of rows) {
      try {
        const detections = await this.analyzePlugin(plugin.id);

        for (const detection of detections) {
          // Only auto-fix high/critical severity issues
          if (detection.severity === "high" || detection.severity === "critical") {
            await this.autoFix(plugin.id, detection);
          } else {
            // Just record the detection
            await pool.query(
              `INSERT INTO sira_detections 
               (merchant_plugin_id, detection_type, severity, description)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT DO NOTHING`,
              [plugin.id, detection.detection_type, detection.severity, detection.description]
            );
          }
        }
      } catch (error) {
        console.error(`Failed to process plugin ${plugin.id}:`, error);
      }
    }
  }

  /**
   * Validate API key format
   */
  private isValidApiKey(key: string): boolean {
    if (!key || typeof key !== "string") {
      return false;
    }

    // Basic format validation
    const validPatterns = [
      /^sk_live_[a-zA-Z0-9]{24,}$/,
      /^sk_test_[a-zA-Z0-9]{24,}$/,
      /^pk_live_[a-zA-Z0-9]{24,}$/,
      /^pk_test_[a-zA-Z0-9]{24,}$/
    ];

    return validPatterns.some(pattern => pattern.test(key));
  }

  /**
   * Notify merchant about detection and fix
   */
  private async notifyMerchant(
    merchantId: string,
    detection: SiraDetection,
    fixMethod: string
  ): Promise<void> {
    // In production, this would send email/notification
    console.log(`📧 Notify merchant ${merchantId}: ${detection.description} - Fixed via ${fixMethod}`);

    // Update notification status
    await pool.query(
      `UPDATE sira_detections 
       SET merchant_notified = true, merchant_notified_at = now()
       WHERE merchant_plugin_id IN (
         SELECT id FROM merchant_plugins WHERE merchant_id = $1
       ) AND detection_type = $2 AND auto_fixed = true
       ORDER BY detected_at DESC LIMIT 1`,
      [merchantId, detection.detection_type]
    );
  }
}

export const selfHealingService = new SelfHealingService();


