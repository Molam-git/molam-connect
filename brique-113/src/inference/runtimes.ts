/**
 * Brique 113: Model Runtimes
 * ONNX Runtime integration for fast inference
 */

import * as ort from 'onnxruntime-node';
import { logger } from '../utils/logger';

export interface PredictionResult {
  score: number;
  explain: {
    summary: { feature: string; importance: number }[];
    top_features: string[];
  };
}

// Cache for loaded ONNX sessions
const sessionCache = new Map<string, ort.InferenceSession>();

/**
 * Load ONNX model session (cached)
 */
async function loadONNXSession(modelPath: string): Promise<ort.InferenceSession> {
  // Check cache
  if (sessionCache.has(modelPath)) {
    return sessionCache.get(modelPath)!;
  }

  try {
    logger.debug('Loading ONNX model', { model_path: modelPath });

    const session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'], // Use 'cuda' for GPU
      graphOptimizationLevel: 'all',
    });

    sessionCache.set(modelPath, session);

    logger.info('ONNX model loaded', { model_path: modelPath });

    return session;
  } catch (err) {
    logger.error('Failed to load ONNX model', {
      model_path: modelPath,
      error: (err as Error).message,
    });
    throw err;
  }
}

/**
 * Run prediction using ONNX Runtime
 */
export async function runONNXPredict(
  modelPath: string,
  features: Record<string, any>
): Promise<PredictionResult> {
  try {
    const session = await loadONNXSession(modelPath);

    // Prepare input tensor
    // Assuming features is a flat object with numeric values
    const featureNames = Object.keys(features);
    const featureValues = featureNames.map((name) => parseFloat(features[name]) || 0);

    const inputTensor = new ort.Tensor('float32', new Float32Array(featureValues), [
      1,
      featureValues.length,
    ]);

    // Get input name from model
    const inputName = session.inputNames[0];

    // Run inference
    const feeds = { [inputName]: inputTensor };
    const results = await session.run(feeds);

    // Extract output (assuming single output with probabilities)
    const outputName = session.outputNames[0];
    const outputTensor = results[outputName];
    const outputData = outputTensor.data as Float32Array;

    // Get fraud probability (assuming binary classification, index 1 is fraud probability)
    const score = outputData.length > 1 ? outputData[1] : outputData[0];

    // Mock SHAP explain (in production, use pre-computed or real-time SHAP)
    const explain = {
      summary: featureNames.slice(0, 5).map((name, idx) => ({
        feature: name,
        importance: Math.random() * 0.5, // Mock importance
      })),
      top_features: featureNames.slice(0, 3),
    };

    return { score, explain };
  } catch (err) {
    logger.error('ONNX prediction failed', {
      model_path: modelPath,
      error: (err as Error).message,
    });
    throw err;
  }
}

/**
 * Fallback: Run prediction using LightGBM (if ONNX not available)
 * This is a placeholder - in production, you'd use lightgbm bindings or microservice
 */
export async function runLightGBMPredict(
  modelPath: string,
  features: Record<string, any>
): Promise<PredictionResult> {
  // For now, fallback to ONNX or throw error
  logger.warn('LightGBM runtime not implemented, using ONNX fallback', { model_path: modelPath });

  // In production, you would:
  // 1. Use node-lightgbm bindings (if available)
  // 2. Call a Python microservice via HTTP/gRPC
  // 3. Use ONNX exported LightGBM models

  try {
    return await runONNXPredict(modelPath, features);
  } catch {
    // Conservative fallback
    logger.error('Prediction failed, returning conservative default');

    return {
      score: 0.5, // Neutral score
      explain: {
        summary: [],
        top_features: [],
      },
    };
  }
}

/**
 * Clear session cache (for hot-swapping models)
 */
export function clearSessionCache(modelPath?: string): void {
  if (modelPath) {
    sessionCache.delete(modelPath);
    logger.info('Session cache cleared for model', { model_path: modelPath });
  } else {
    sessionCache.clear();
    logger.info('All session cache cleared');
  }
}
