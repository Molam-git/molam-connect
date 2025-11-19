// ============================================================================
// SIRA Risk Scoring Service
// ============================================================================

import axios from "axios";
import { pool } from "../db";
import { logger } from "../logger";

const SIRA_URL = process.env.SIRA_URL || "";
const SIRA_TIMEOUT = parseInt(process.env.SIRA_TIMEOUT_MS || "5000", 10);
const SIRA_MODEL_VERSION = process.env.SIRA_MODEL_VERSION || "v1.0";

export interface SiraScorePayload {
  action_type: string;
  origin_module: string;
  amount?: number;
  currency?: string;
  origin_country?: string;
  account_country?: string;
  actor_id?: string;
  actor_role?: string;
  historical_risk_score?: number;
  entity_type?: string;
  metadata?: any;
}

export interface SiraScoreResult {
  score: number;                    // 0..100
  tags: string[];                   // ['high_amount', 'cross_country', etc.]
  reason: string;                   // human-readable
  recommended_approvals: number;    // 1..5
  recommended_channels: string[];   // ['email', 'slack', 'push']
  confidence: number;               // 0..1
  model_version: string;
}

/**
 * Score action via SIRA AI risk model
 */
export async function scoreAction(
  payload: SiraScorePayload,
  approvalId?: string
): Promise<SiraScoreResult> {
  const startTime = Date.now();

  try {
    if (SIRA_URL) {
      // Call real SIRA service
      logger.info("Calling SIRA scoring service", {
        approval_id: approvalId,
        action_type: payload.action_type,
      });

      const response = await axios.post(
        `${SIRA_URL}/api/score`,
        {
          action: payload.action_type,
          module: payload.origin_module,
          amount: payload.amount,
          currency: payload.currency,
          origin_country: payload.origin_country,
          destination_country: payload.account_country,
          actor_id: payload.actor_id,
          actor_role: payload.actor_role,
          historical_risk: payload.historical_risk_score,
          entity_type: payload.entity_type,
          metadata: payload.metadata,
        },
        {
          timeout: SIRA_TIMEOUT,
          headers: {
            "Content-Type": "application/json",
            "X-Model-Version": SIRA_MODEL_VERSION,
          },
        }
      );

      const latency = Date.now() - startTime;

      const result: SiraScoreResult = {
        score: response.data.score || 0,
        tags: response.data.tags || [],
        reason: response.data.reason || "SIRA analysis",
        recommended_approvals: response.data.recommended_approvals || 1,
        recommended_channels: response.data.recommended_channels || ["email"],
        confidence: response.data.confidence || 0.8,
        model_version: response.data.model_version || SIRA_MODEL_VERSION,
      };

      // Audit SIRA call
      await auditSiraScore(approvalId, payload, result, latency);

      return result;
    } else {
      // Fallback: heuristic scoring (deterministic)
      logger.warn("SIRA_URL not configured, using fallback heuristic scoring");
      return fallbackHeuristicScoring(payload, approvalId);
    }
  } catch (error: any) {
    logger.error("SIRA scoring failed, using fallback", {
      error: error.message,
      approval_id: approvalId,
    });

    // Fallback on error
    return fallbackHeuristicScoring(payload, approvalId);
  }
}

/**
 * Fallback heuristic scoring when SIRA unavailable
 */
function fallbackHeuristicScoring(
  payload: SiraScorePayload,
  approvalId?: string
): SiraScoreResult {
  let score = 0;
  const tags: string[] = [];
  let reason = "Heuristic risk assessment: ";

  // Amount-based scoring
  if (payload.amount) {
    if (payload.amount > 1000000) {
      score += 60;
      tags.push("very_high_amount");
      reason += "Very high amount. ";
    } else if (payload.amount > 100000) {
      score += 40;
      tags.push("high_amount");
      reason += "High amount. ";
    } else if (payload.amount > 10000) {
      score += 20;
      tags.push("medium_amount");
      reason += "Medium amount. ";
    }
  }

  // Cross-country risk
  if (
    payload.origin_country &&
    payload.account_country &&
    payload.origin_country !== payload.account_country
  ) {
    score += 15;
    tags.push("cross_country");
    reason += "Cross-country transaction. ";
  }

  // Historical risk
  if (payload.historical_risk_score && payload.historical_risk_score > 0.7) {
    score += 25;
    tags.push("high_historical_risk");
    reason += "High historical risk profile. ";
  }

  // Action type specific
  if (payload.action_type.includes("freeze") || payload.action_type.includes("reverse")) {
    score += 10;
    tags.push("critical_action");
    reason += "Critical operational action. ";
  }

  // Cap at 100
  if (score > 100) score = 100;

  // Determine recommendations
  let recommendedApprovals = 1;
  if (score >= 85) {
    recommendedApprovals = 3;
  } else if (score >= 60) {
    recommendedApprovals = 2;
  } else if (score >= 25) {
    recommendedApprovals = 1;
  }

  const recommendedChannels =
    score >= 60 ? ["email", "slack", "push"] : score >= 25 ? ["email", "push"] : ["email"];

  const result: SiraScoreResult = {
    score,
    tags,
    reason: reason.trim() || "Low risk",
    recommended_approvals: recommendedApprovals,
    recommended_channels: recommendedChannels,
    confidence: 0.6, // Lower confidence for heuristic
    model_version: "fallback-heuristic-v1",
  };

  // Audit fallback scoring
  const latency = 0;
  auditSiraScore(approvalId, payload, result, latency).catch((err) =>
    logger.error("Failed to audit fallback score", { error: err.message })
  );

  return result;
}

/**
 * Audit SIRA scoring call
 */
async function auditSiraScore(
  approvalId: string | undefined,
  payload: SiraScorePayload,
  result: SiraScoreResult,
  latencyMs: number
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO sira_scoring_audit(approval_id, payload, score, tags, reason, recommended_approvals, model_version, latency_ms)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        approvalId || null,
        JSON.stringify(payload),
        result.score,
        result.tags,
        result.reason,
        result.recommended_approvals,
        result.model_version,
        latencyMs,
      ]
    );
  } catch (error: any) {
    logger.error("Failed to audit SIRA score", { error: error.message });
  }
}

/**
 * Re-score an existing approval (for override scenarios)
 */
export async function rescoreApproval(approvalId: string): Promise<SiraScoreResult> {
  const { rows } = await pool.query(
    `SELECT payload FROM approvals_action WHERE id = $1 LIMIT 1`,
    [approvalId]
  );

  if (rows.length === 0) {
    throw new Error("Approval not found");
  }

  const payload = rows[0].payload as SiraScorePayload;
  return scoreAction(payload, approvalId);
}
