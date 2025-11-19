/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * Explain Service: Compute SHAP explanations
 */

import fetch from "node-fetch";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info"
});

export interface ExplainResult {
  summary: Array<{
    feature: string;
    contribution: number;
    direction: "positive" | "negative";
  }>;
  shap_values?: number[];
  top_features: number;
  model_version: string;
  partial?: boolean;
}

/**
 * Compute explainability for a prediction
 */
export async function computeExplain(prediction: any): Promise<ExplainResult> {
  try {
    const explainerUrl = process.env.EXPLAINER_URL || "http://localhost:8001";
    const timeout = 2000; // 2 seconds

    logger.info({ predictionId: prediction.id, modelId: prediction.model_id }, "Computing explain");

    const response = await fetch(`${explainerUrl}/explain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model_id: prediction.model_id,
        features: prediction.features,
        prediction_id: prediction.id
      }),
      timeout
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "Explain service error, returning partial");
      return getPartialExplain(prediction);
    }

    const result = await response.json();

    // Transform to our format
    const summary = result.shap_values
      ? Object.entries(result.shap_values)
          .map(([feature, value]: [string, any]) => ({
            feature,
            contribution: Math.abs(value),
            direction: value > 0 ? "positive" : "negative"
          }))
          .sort((a, b) => b.contribution - a.contribution)
          .slice(0, 10)
      : result.summary || [];

    return {
      summary,
      shap_values: result.shap_values,
      top_features: summary.length,
      model_version: result.model_version || prediction.model_id,
      partial: false
    };
  } catch (error: any) {
    logger.error({ error }, "Failed to compute explain, returning partial");
    return getPartialExplain(prediction);
  }
}

/**
 * Get partial explain when service is unavailable
 */
function getPartialExplain(prediction: any): ExplainResult {
  // Fallback: extract top features from prediction features
  const features = prediction.features || {};
  const summary = Object.entries(features)
    .map(([feature, value]: [string, any]) => ({
      feature,
      contribution: Math.abs(Number(value) || 0),
      direction: (Number(value) || 0) > 0 ? "positive" : "negative"
    }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 10);

  return {
    summary,
    top_features: summary.length,
    model_version: prediction.model_id || "unknown",
    partial: true
  };
}

