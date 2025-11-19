/**
 * Brique 113: Prediction Engine
 * Combines router, loader, and runtime for end-to-end inference
 */

import { LRUCache } from 'lru-cache';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { logger } from '../utils/logger';
import {
  inferenceRequestsTotal,
  inferenceLatencyHistogram,
  cacheHitsTotal,
  cacheMissesTotal,
  predictionErrorsTotal,
} from '../utils/metrics';
import { pickModelForEvent } from './router';
import { getModelManager } from './loader';
import { runONNXPredict } from './runtimes';

// LRU Cache configuration
const lruCache = new LRUCache<string, PredictionOutput>({
  max: parseInt(process.env.CACHE_MAX_ITEMS || '5000', 10),
  ttl: parseInt(process.env.CACHE_TTL_MS || '300000', 10), // 5 minutes default
  updateAgeOnGet: true,
});

export interface PredictionInput {
  event_id: string;
  product: string;
  features: Record<string, any>;
  user_context?: {
    threshold?: number;
    [key: string]: any;
  };
}

export interface PredictionOutput {
  prediction_id: string;
  model_id: string;
  model_role: 'production' | 'canary';
  score: number;
  decision: string;
  explain_summary: { feature: string; importance: number }[];
  latency_ms: number;
  cached: boolean;
}

/**
 * Extract features from payload
 * This is a placeholder - in production, implement proper feature engineering
 */
export function extractFeatures(payload: any): Record<string, any> {
  // Mock feature extraction
  // In production, this should call feature engineering service or inline logic

  return {
    amount: parseFloat(payload.amount) || 0,
    currency: payload.currency || 'USD',
    country: payload.country || 'US',
    payment_method: payload.payment_method || 'card',
    hour_of_day: new Date().getHours(),
    day_of_week: new Date().getDay(),
    is_weekend: [0, 6].includes(new Date().getDay()) ? 1 : 0,
    // Add more features based on your model's requirements
    ...payload.features,
  };
}

/**
 * Make decision based on score and threshold
 */
function makeDecision(score: number, threshold: number = 0.5): string {
  if (score >= threshold) {
    return 'block';
  } else if (score >= threshold * 0.7) {
    return 'review';
  } else {
    return 'allow';
  }
}

/**
 * Persist prediction to database (immutable log)
 */
async function persistPrediction(
  predictionId: string,
  modelId: string,
  modelRole: 'production' | 'canary',
  eventId: string,
  product: string,
  score: number,
  decision: string,
  explain: any,
  latencyMs: number
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO siramodel_predictions (
        prediction_id, model_id, event_id, product, score, decision, explain, latency_ms, model_role, model_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        predictionId,
        modelId,
        eventId,
        product,
        score,
        decision,
        JSON.stringify(explain),
        latencyMs,
        modelRole,
        null, // model_version can be populated from metadata
      ]
    );

    logger.debug('Prediction persisted', { prediction_id: predictionId, event_id: eventId });
  } catch (err) {
    logger.error('Failed to persist prediction', {
      prediction_id: predictionId,
      error: (err as Error).message,
    });
    // Don't throw - prediction already succeeded, persistence is best-effort
  }
}

/**
 * Main inference function
 */
export async function infer(input: PredictionInput): Promise<PredictionOutput> {
  const { event_id, product, features, user_context } = input;
  const predictionId = uuidv4();
  const startTime = Date.now();

  logger.info('Inference request received', {
    prediction_id: predictionId,
    event_id,
    product,
  });

  try {
    // Check cache first
    const cacheKey = `${product}:${JSON.stringify(features)}`;
    const cached = lruCache.get(cacheKey);

    if (cached) {
      logger.debug('Cache hit', { cache_key: cacheKey });
      cacheHitsTotal.inc({ cache_type: 'memory' });

      // Update metrics
      inferenceRequestsTotal.inc({
        product,
        model_id: cached.model_id,
        model_role: cached.model_role,
        decision: cached.decision,
        status: 'success',
      });

      return { ...cached, prediction_id: predictionId, cached: true };
    }

    cacheMissesTotal.inc({ cache_type: 'memory' });

    // Pick model (canary routing)
    const modelChoice = await pickModelForEvent(event_id, product);

    // Get model path
    const modelManager = getModelManager();
    const modelPath = modelManager.getModelPath(modelChoice.model_id);

    if (!modelPath) {
      throw new Error(`Model not loaded: ${modelChoice.model_id}`);
    }

    // Run prediction
    const predictionStart = Date.now();
    const { score, explain } = await runONNXPredict(modelPath, features);
    const predictionLatency = Date.now() - predictionStart;

    logger.debug('Prediction completed', {
      model_id: modelChoice.model_id,
      score,
      latency_ms: predictionLatency,
    });

    // Make decision
    const threshold = user_context?.threshold ?? 0.5;
    const decision = makeDecision(score, threshold);

    const totalLatency = Date.now() - startTime;

    // Persist to database (async, don't await)
    persistPrediction(
      predictionId,
      modelChoice.model_id,
      modelChoice.role,
      event_id,
      product,
      score,
      decision,
      explain,
      totalLatency
    ).catch((err) => {
      logger.error('Async persist failed', { error: err.message });
    });

    // Build output
    const output: PredictionOutput = {
      prediction_id: predictionId,
      model_id: modelChoice.model_id,
      model_role: modelChoice.role,
      score,
      decision,
      explain_summary: explain.summary,
      latency_ms: totalLatency,
      cached: false,
    };

    // Cache result
    lruCache.set(cacheKey, output);

    // Update metrics
    inferenceRequestsTotal.inc({
      product,
      model_id: modelChoice.model_id,
      model_role: modelChoice.role,
      decision,
      status: 'success',
    });

    inferenceLatencyHistogram.observe(
      {
        product,
        model_id: modelChoice.model_id,
        model_role: modelChoice.role,
      },
      totalLatency / 1000 // Convert to seconds
    );

    logger.info('Inference completed', {
      prediction_id: predictionId,
      event_id,
      model_id: modelChoice.model_id,
      model_role: modelChoice.role,
      score,
      decision,
      latency_ms: totalLatency,
    });

    return output;
  } catch (err) {
    const error = err as Error;
    logger.error('Inference failed', {
      prediction_id: predictionId,
      event_id,
      product,
      error: error.message,
      stack: error.stack,
    });

    predictionErrorsTotal.inc({
      product,
      model_id: 'unknown',
      error_type: error.message.includes('not loaded') ? 'model_not_loaded' : 'runtime_error',
    });

    inferenceRequestsTotal.inc({
      product,
      model_id: 'unknown',
      model_role: 'unknown',
      decision: 'error',
      status: 'error',
    });

    throw error;
  }
}

/**
 * Get prediction by ID
 */
export async function getPrediction(predictionId: string): Promise<any> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM siramodel_predictions WHERE prediction_id = $1`,
      [predictionId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0];
  } catch (err) {
    logger.error('Failed to get prediction', {
      prediction_id: predictionId,
      error: (err as Error).message,
    });
    throw err;
  }
}
