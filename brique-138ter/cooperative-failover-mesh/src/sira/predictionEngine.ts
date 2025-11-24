// ============================================================================
// SIRA Prediction Engine - Generate health predictions and routing proposals
// ============================================================================

import { pool } from "../utils/db";
import { logger } from "../utils/logger";
import { publishPrediction, publishRoutingProposal } from "../mesh/broker";
import jwt from "jsonwebtoken";
import axios from "axios";

const SIRA_MODEL_VERSION = process.env.SIRA_MODEL_VERSION || "v2.5.1";
const SIRA_API_URL = process.env.SIRA_API_URL || "http://sira-service:3000";
const SIRA_API_KEY = process.env.SIRA_API_KEY || "";
const SIRA_SIGNING_KEY = process.env.SIRA_SIGNING_KEY || "sira-secret-key";

/**
 * Generate health prediction for a bank
 */
export async function generateHealthPrediction(
  bankProfileId: string,
  meshRegionId?: string
): Promise<any> {
  // Get historical health data
  const { rows: healthLogs } = await pool.query(
    `SELECT * FROM bank_health_logs
     WHERE bank_profile_id = $1
       AND logged_at > now() - interval '24 hours'
     ORDER BY logged_at DESC
     LIMIT 1000`,
    [bankProfileId]
  );

  if (healthLogs.length === 0) {
    logger.warn("No health logs for prediction", { bank_profile_id: bankProfileId });
    return null;
  }

  // Call SIRA API for prediction
  let prediction;
  try {
    const response = await axios.post(
      `${SIRA_API_URL}/api/predict/health`,
      {
        bank_profile_id: bankProfileId,
        mesh_region_id: meshRegionId,
        historical_data: healthLogs.slice(0, 100), // Last 100 data points
        prediction_window_minutes: 60,
      },
      {
        headers: {
          "X-API-Key": SIRA_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    prediction = response.data;
  } catch (error: any) {
    logger.error("SIRA API call failed, using fallback", {
      bank_profile_id: bankProfileId,
      error: error.message,
    });

    // Fallback: simple heuristic prediction
    prediction = generateFallbackPrediction(healthLogs);
  }

  // Sign prediction
  const signature = jwt.sign(
    {
      bank_profile_id: bankProfileId,
      predicted_score: prediction.predicted_score,
      confidence: prediction.confidence,
      timestamp: Date.now(),
    },
    SIRA_SIGNING_KEY,
    { algorithm: "HS256", expiresIn: "1h" }
  );

  // Store prediction
  const validUntil = new Date(Date.now() + prediction.prediction_window_minutes * 60 * 1000);

  const { rows } = await pool.query(
    `INSERT INTO bank_health_predictions(
      bank_profile_id, mesh_region_id, predicted_score, confidence,
      prediction_window_minutes, prediction_reason, risk_factors,
      recommended_action, sira_model_version, sira_signature, valid_until
    )
    VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      bankProfileId,
      meshRegionId,
      prediction.predicted_score,
      prediction.confidence,
      prediction.prediction_window_minutes,
      prediction.reason,
      prediction.risk_factors || [],
      prediction.recommended_action,
      SIRA_MODEL_VERSION,
      signature,
      validUntil,
    ]
  );

  const storedPrediction = rows[0];

  // Publish to mesh
  await publishPrediction(storedPrediction);

  logger.info("Health prediction generated", {
    bank_profile_id: bankProfileId,
    predicted_score: prediction.predicted_score,
    confidence: prediction.confidence,
  });

  return storedPrediction;
}

/**
 * Fallback prediction using simple heuristics
 */
function generateFallbackPrediction(healthLogs: any[]): any {
  const recentLogs = healthLogs.slice(0, 20);

  const avgScore =
    recentLogs.reduce((sum, log) => sum + (log.health_score || 50), 0) / recentLogs.length;
  const avgLatency =
    recentLogs.reduce((sum, log) => sum + (log.latency_ms || 0), 0) / recentLogs.length;
  const successRate =
    recentLogs.filter((log) => log.status === "healthy").length / recentLogs.length;

  // Simple trend analysis
  const trend =
    recentLogs.slice(0, 5).reduce((sum, log) => sum + (log.health_score || 50), 0) / 5 -
    recentLogs.slice(5, 10).reduce((sum, log) => sum + (log.health_score || 50), 0) / 5;

  let predictedScore = avgScore + trend * 0.5; // Apply trend
  predictedScore = Math.max(0, Math.min(100, predictedScore)); // Clamp to 0-100

  const riskFactors: string[] = [];
  if (avgLatency > 500) riskFactors.push("high_latency");
  if (successRate < 0.95) riskFactors.push("low_success_rate");
  if (trend < -5) riskFactors.push("declining_health");

  let recommendedAction = "monitor";
  if (predictedScore < 60) recommendedAction = "failover";
  else if (predictedScore < 80) recommendedAction = "prepare_failover";

  return {
    predicted_score: predictedScore,
    confidence: 0.6, // Lower confidence for fallback
    prediction_window_minutes: 60,
    reason: "Fallback heuristic prediction based on recent health trends",
    risk_factors: riskFactors,
    recommended_action: recommendedAction,
  };
}

/**
 * Generate routing proposal for a region
 */
export async function generateRoutingProposal(
  meshRegionId: string,
  currency: string,
  minAmount: number = 0,
  maxAmount: number | null = null,
  reason?: string
): Promise<any> {
  // Get active mesh members for region
  const { rows: members } = await pool.query(
    `SELECT mm.*, bp.name as bank_name
     FROM mesh_members mm
     JOIN bank_profiles bp ON mm.bank_profile_id = bp.id
     WHERE mm.mesh_region_id = $1
       AND mm.status = 'active'
       AND mm.capabilities -> 'supported_currencies' ? $2
     ORDER BY mm.prefer_order ASC`,
    [meshRegionId, currency]
  );

  if (members.length === 0) {
    throw new Error("No active members found for routing proposal");
  }

  // Get recent predictions for each member
  const sequence: any[] = [];

  for (const member of members) {
    const { rows: predictions } = await pool.query(
      `SELECT * FROM bank_health_predictions
       WHERE bank_profile_id = $1
         AND valid_until > now()
       ORDER BY created_at DESC
       LIMIT 1`,
      [member.bank_profile_id]
    );

    const prediction = predictions[0];
    const healthScore = prediction?.predicted_score || member.current_health_score || 50;
    const confidence = prediction?.confidence || 0.5;

    // Estimate cost (simplified)
    const estimatedCost = calculateEstimatedCost(member, currency, minAmount);

    sequence.push({
      bank_profile_id: member.bank_profile_id,
      bank_name: member.bank_name,
      role: member.role,
      score: healthScore,
      confidence: confidence,
      estimated_cost: estimatedCost,
      reason: prediction?.prediction_reason || "Current health score",
    });
  }

  // Sort by score (highest first)
  sequence.sort((a, b) => b.score - a.score);

  // Create proposal
  const proposal = {
    sequence,
    reason: reason || "Optimized routing based on health predictions",
    sira_version: SIRA_MODEL_VERSION,
    timestamp: new Date().toISOString(),
  };

  // Sign proposal
  const signature = jwt.sign(
    {
      mesh_region_id: meshRegionId,
      currency,
      sequence: sequence.map((s) => s.bank_profile_id),
      timestamp: Date.now(),
    },
    SIRA_SIGNING_KEY,
    { algorithm: "HS256", expiresIn: "1h" }
  );

  // Store proposal
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const { rows } = await pool.query(
    `INSERT INTO mesh_routing_proposals(
      mesh_region_id, currency, min_amount, max_amount,
      proposal, status, created_by, sira_signature, expires_at
    )
    VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      meshRegionId,
      currency,
      minAmount,
      maxAmount,
      proposal,
      "proposed",
      "sira",
      signature,
      expiresAt,
    ]
  );

  const storedProposal = rows[0];

  // Publish to mesh
  await publishRoutingProposal(storedProposal);

  logger.info("Routing proposal generated", {
    proposal_id: storedProposal.id,
    mesh_region_id: meshRegionId,
    currency,
    sequence_length: sequence.length,
  });

  return storedProposal;
}

/**
 * Calculate estimated cost for a bank route
 */
function calculateEstimatedCost(member: any, currency: string, amount: number): number {
  // Simplified cost calculation
  const baseFee = 100; // Base fee in currency
  const percentageFee = 0.01; // 1%

  return baseFee + amount * percentageFee;
}

/**
 * Verify SIRA signature
 */
export function verifySignature(data: any, signature: string): boolean {
  try {
    jwt.verify(signature, SIRA_SIGNING_KEY, { algorithms: ["HS256"] });
    return true;
  } catch (error: any) {
    logger.error("Invalid SIRA signature", { error: error?.message || "Unknown error" });
    return false;
  }
}
