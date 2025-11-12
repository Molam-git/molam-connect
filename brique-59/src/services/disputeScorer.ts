import { pool } from '../utils/db';
import fetch from 'node-fetch';

const SIRA_ML_API_URL = process.env.SIRA_ML_API_URL || 'http://localhost:9000';

export interface DisputeFeatures {
  amount: number;
  currency: string;
  reason_code: string;
  country: string | null;
  age_days: number;
  merchant_id: string;
  evidence_count: number;
  evidence_quality_score: number;
  merchant_win_rate: number;
  sector_avg_win_rate: number;
}

export interface SiraScore {
  win_probability: number; // 0-1
  confidence: number; // 0-1
  recommended_action: 'auto_submit' | 'suggest_submit' | 'suggest_refund' | 'manual_review';
  reasons: string[];
  model_version: string;
  prediction_time_ms: number;
}

/**
 * Score a dispute using active ML model
 */
export async function scoreDispute(dispute: any): Promise<SiraScore> {
  const startTime = Date.now();

  try {
    // Get active model
    const model = await getActiveModel('dispute_scorer');
    if (!model) {
      throw new Error('No active dispute scoring model found');
    }

    // Extract features
    const features = await extractFeatures(dispute);

    // Call ML API for prediction
    const prediction = await callMLAPI(model, features);

    // Adjust with benchmarks
    const adjusted = await adjustWithBenchmark(prediction.win_probability, features);

    // Determine recommended action
    const recommended_action = determineAction(adjusted, prediction.confidence);

    const score: SiraScore = {
      win_probability: adjusted,
      confidence: prediction.confidence,
      recommended_action,
      reasons: prediction.reasons || [],
      model_version: model.version,
      prediction_time_ms: Date.now() - startTime,
    };

    // Store prediction for feedback loop
    await storePrediction(dispute.id, model.id, model.version, score, features);

    return score;
  } catch (error: any) {
    console.error('[DisputeScorer] Error scoring dispute:', error.message);

    // Fallback to rule-based scoring
    return fallbackScore(dispute);
  }
}

/**
 * Extract features from dispute for ML model
 */
async function extractFeatures(dispute: any): Promise<DisputeFeatures> {
  // Calculate age in days
  const createdAt = new Date(dispute.created_at);
  const age_days = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // Get evidence count
  const { rows: evidenceRows } = await pool.query(
    'SELECT COUNT(*) as count FROM dispute_evidence WHERE dispute_id = $1',
    [dispute.id]
  );
  const evidence_count = parseInt(evidenceRows[0]?.count || '0', 10);

  // Get merchant profile
  const { rows: profileRows } = await pool.query(
    'SELECT * FROM merchant_dispute_profiles WHERE merchant_id = $1',
    [dispute.merchant_id]
  );
  const profile = profileRows[0];

  return {
    amount: dispute.amount,
    currency: dispute.currency,
    reason_code: dispute.reason_code,
    country: dispute.country,
    age_days,
    merchant_id: dispute.merchant_id,
    evidence_count,
    evidence_quality_score: profile?.evidence_quality_score || 0.5,
    merchant_win_rate: profile?.win_rate || 50,
    sector_avg_win_rate: profile?.benchmark_win_rate || 50,
  };
}

/**
 * Call external ML API for prediction
 */
async function callMLAPI(model: any, features: DisputeFeatures): Promise<{
  win_probability: number;
  confidence: number;
  reasons: string[];
}> {
  try {
    const response = await fetch(`${SIRA_ML_API_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_version: model.version,
        features,
      }),
    });

    if (!response.ok) {
      throw new Error(`ML API returned ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[DisputeScorer] ML API call failed:', error.message);
    throw error;
  }
}

/**
 * Adjust prediction with sector benchmarks
 */
async function adjustWithBenchmark(rawProbability: number, features: DisputeFeatures): Promise<number> {
  // If merchant performs better than sector, boost win probability slightly
  const merchantVsSector = features.merchant_win_rate - features.sector_avg_win_rate;

  let adjustment = 0;
  if (merchantVsSector > 10) {
    adjustment = 0.05; // +5% if significantly better
  } else if (merchantVsSector < -10) {
    adjustment = -0.05; // -5% if significantly worse
  }

  const adjusted = Math.max(0, Math.min(1, rawProbability + adjustment));
  return adjusted;
}

/**
 * Determine recommended action based on probability and confidence
 */
function determineAction(probability: number, confidence: number): SiraScore['recommended_action'] {
  if (probability > 0.9 && confidence > 0.85) {
    return 'auto_submit';
  } else if (probability > 0.7) {
    return 'suggest_submit';
  } else if (probability < 0.3) {
    return 'suggest_refund';
  } else {
    return 'manual_review';
  }
}

/**
 * Store prediction for feedback loop
 */
async function storePrediction(
  disputeId: string,
  modelId: string,
  modelVersion: string,
  score: SiraScore,
  features: DisputeFeatures
): Promise<void> {
  await pool.query(
    `INSERT INTO sira_predictions (
      dispute_id, model_id, model_version, win_probability, confidence,
      recommended_action, reasons, features_used, prediction_time_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      disputeId,
      modelId,
      modelVersion,
      score.win_probability,
      score.confidence,
      score.recommended_action,
      JSON.stringify(score.reasons),
      JSON.stringify(features),
      score.prediction_time_ms,
    ]
  );
}

/**
 * Get active ML model
 */
async function getActiveModel(modelType: string): Promise<any> {
  const { rows } = await pool.query(
    `SELECT * FROM sira_models WHERE model_type = $1 AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [modelType]
  );

  return rows[0] || null;
}

/**
 * Fallback rule-based scoring when ML fails
 */
function fallbackScore(dispute: any): SiraScore {
  // Simple rules based on reason code and amount
  let win_probability = 0.5;
  const reasons: string[] = ['ML unavailable - using fallback rules'];

  if (dispute.reason_code === '10.4') {
    // Fraud - harder to win
    win_probability = 0.3;
    reasons.push('Fraud disputes typically harder to win');
  } else if (dispute.reason_code === '13.1') {
    // Service not provided - medium difficulty
    win_probability = 0.5;
    reasons.push('Service disputes require strong evidence');
  }

  // Lower amounts easier to win
  if (dispute.amount < 50) {
    win_probability += 0.1;
    reasons.push('Low amount disputes have higher win rates');
  }

  return {
    win_probability: Math.max(0, Math.min(1, win_probability)),
    confidence: 0.4, // Low confidence for fallback
    recommended_action: 'manual_review',
    reasons,
    model_version: 'fallback-v1',
    prediction_time_ms: 0,
  };
}

/**
 * Record actual outcome for feedback loop
 */
export async function recordOutcome(disputeId: string, outcome: 'won' | 'lost' | 'settled'): Promise<void> {
  // Get the prediction
  const { rows: predictions } = await pool.query(
    `SELECT * FROM sira_predictions WHERE dispute_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [disputeId]
  );

  if (predictions.length === 0) {
    console.warn(`[DisputeScorer] No prediction found for dispute ${disputeId}`);
    return;
  }

  const prediction = predictions[0];

  // Determine if prediction was correct
  let prediction_correct = false;
  if (outcome === 'won' && prediction.win_probability > 0.5) {
    prediction_correct = true;
  } else if (outcome === 'lost' && prediction.win_probability < 0.5) {
    prediction_correct = true;
  }

  // Update prediction with outcome
  await pool.query(
    `UPDATE sira_predictions
     SET actual_outcome = $1, prediction_correct = $2, outcome_recorded_at = NOW()
     WHERE id = $3`,
    [outcome, prediction_correct, prediction.id]
  );

  console.log(`[DisputeScorer] Recorded outcome for dispute ${disputeId}: ${outcome} (correct: ${prediction_correct})`);
}
