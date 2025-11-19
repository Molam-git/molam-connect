// ============================================================================
// SIRA Integration Hook - AI-driven module recommendations
// ============================================================================

import axios from "axios";
import { logger } from "../logger";

export interface SiraHint {
  preferred_module?: string;
  recommended_modules?: string[];
  confidence_score?: number;
  reason?: string;
}

/**
 * Publish event to SIRA service for AI-driven hints
 * Non-blocking call with timeout and error handling
 */
export async function publishSiraEvent(
  eventType: string,
  payload: any
): Promise<SiraHint | null> {
  // Skip if SIRA not configured
  const siraUrl = process.env.SIRA_URL;
  if (!siraUrl) {
    logger.debug("SIRA_URL not configured, skipping SIRA call");
    return null;
  }

  try {
    const response = await axios.post(
      `${siraUrl}/api/hints`,
      {
        eventType,
        payload,
        timestamp: new Date().toISOString(),
      },
      {
        timeout: 2000, // 2s timeout for SIRA
        headers: {
          "x-service": "pay-entry-service",
          "x-request-id": generateRequestId(),
        },
      }
    );

    logger.debug("SIRA hint received", {
      event_type: eventType,
      hint: response.data,
    });

    return response.data;
  } catch (error: any) {
    // Non-blocking - log and continue
    if (axios.isAxiosError(error)) {
      logger.warn("SIRA request failed", {
        event_type: eventType,
        error: error.message,
        code: error.code,
      });
    } else {
      logger.warn("Unexpected SIRA error", {
        event_type: eventType,
        error: error.message,
      });
    }

    return null;
  }
}

/**
 * Compute local recommendation based on usage patterns
 * Fallback when SIRA is unavailable
 */
export function computeLocalRecommendation(
  preferences: any
): SiraHint | null {
  // Simple heuristic: if user has only one module enabled and uses it frequently
  // recommend auto-redirect
  const enabledModules = preferences.modules_enabled || [];

  if (enabledModules.length === 1 && preferences.last_module_used) {
    return {
      preferred_module: preferences.last_module_used,
      recommended_modules: enabledModules,
      confidence_score: 0.7,
      reason: "single_module_usage_pattern",
    };
  }

  return null;
}

/**
 * Generate unique request ID for tracing
 */
function generateRequestId(): string {
  return `pay-entry-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}
