/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * SIRA Decision API Integration
 * 
 * Calls SIRA model to get patch recommendations
 */

import fetch from "node-fetch";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info"
});

export interface SiraDecision {
  action: "patch" | "config_fix" | "notify_ops" | "rollback" | "no_action";
  patch_version?: string;
  current_version?: string;
  confidence: number;
  explanation: string;
  estimated_impact?: "low" | "medium" | "high";
  method?: string;
}

/**
 * Call SIRA API to get decision
 */
export async function decideWithSira(input: {
  merchantId: string;
  pluginId: string;
  telemetry: any;
  severity: string;
  incidentType: string;
  currentVersion: string;
  historicalData?: any;
}): Promise<SiraDecision> {
  try {
    const siraApiUrl = process.env.SIRA_API_URL || "http://localhost:8000";
    
    logger.info({ pluginId: input.pluginId, severity: input.severity }, "Calling SIRA decision API");

    const response = await fetch(`${siraApiUrl}/api/sira/decide`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SIRA_API_TOKEN || ""}`
      },
      body: JSON.stringify({
        merchant_id: input.merchantId,
        plugin_id: input.pluginId,
        telemetry: input.telemetry,
        severity: input.severity,
        incident_type: input.incidentType,
        current_version: input.currentVersion,
        historical_data: input.historicalData || {}
      }),
      timeout: 10000 // 10 seconds
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "SIRA API error");
      // Fallback to default decision
      return getDefaultDecision(input);
    }

    const decision = await response.json();
    logger.info({ decision }, "SIRA decision received");

    return {
      action: decision.action || "notify_ops",
      patch_version: decision.patch_version,
      current_version: input.currentVersion,
      confidence: decision.confidence || 0.5,
      explanation: decision.explanation || "No explanation provided",
      estimated_impact: decision.estimated_impact || "low",
      method: decision.method || "patch"
    };
  } catch (error: any) {
    logger.error({ error }, "SIRA API call failed");
    // Fallback to default decision
    return getDefaultDecision(input);
  }
}

/**
 * Get default decision when SIRA is unavailable
 */
function getDefaultDecision(input: {
  telemetry: any;
  severity: string;
  incidentType: string;
  currentVersion: string;
}): SiraDecision {
  // Simple heuristics when SIRA is down
  const webhookFailRate = input.telemetry.webhook_fail_rate || 0;
  const errorsLast24h = input.telemetry.errors_last_24h || 0;

  // High webhook failure -> likely config issue
  if (webhookFailRate > 0.5) {
    return {
      action: "config_fix",
      confidence: 0.6,
      explanation: "High webhook failure rate suggests configuration issue",
      estimated_impact: "low"
    };
  }

  // High error count -> likely needs patch
  if (errorsLast24h > 50) {
    return {
      action: "notify_ops",
      confidence: 0.5,
      explanation: "High error count requires manual investigation",
      estimated_impact: "medium"
    };
  }

  // Default: notify ops
  return {
    action: "notify_ops",
    confidence: 0.3,
    explanation: "Insufficient data for automatic decision",
    estimated_impact: "low"
  };
}



