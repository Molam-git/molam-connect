/**
 * Brique 113: Inference API Routes
 */

import express, { Response } from 'express';
import { requireRole, AuthenticatedRequest } from '../utils/auth';
import { infer, extractFeatures, getPrediction } from '../inference/predict';
import { setCanaryConfig, stopCanary, getCanaryConfig } from '../inference/router';
import { getModelManager } from '../inference/loader';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * POST /v1/infer
 * Main inference endpoint
 */
router.post(
  '/infer',
  requireRole(['sira_service', 'pay_admin', 'ml_ops', 'internal_service', 'fraud_analyst']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { event_id, payload, product } = req.body;

      // Validation
      if (!event_id || !product) {
        res.status(400).json({ error: 'missing_required_fields', required: ['event_id', 'product'] });
        return;
      }

      // Extract features from payload
      const features = extractFeatures(payload);

      // User context (e.g., custom threshold)
      const userContext = {
        threshold: req.user?.sira_threshold || parseFloat(process.env.DEFAULT_THRESHOLD || '0.5'),
      };

      // Run inference
      const result = await infer({
        event_id,
        product,
        features,
        user_context: userContext,
      });

      logger.info('Inference API success', {
        user_id: req.user?.user_id,
        event_id,
        prediction_id: result.prediction_id,
        decision: result.decision,
      });

      res.json(result);
    } catch (err: any) {
      logger.error('Inference API error', {
        user_id: req.user?.user_id,
        error: err.message,
        stack: err.stack,
      });

      res.status(500).json({
        error: 'inference_failed',
        detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
      });
    }
  }
);

/**
 * GET /v1/infer/:prediction_id
 * Get prediction details by ID
 */
router.get(
  '/infer/:prediction_id',
  requireRole(['sira_service', 'pay_admin', 'ml_ops', 'internal_service', 'fraud_analyst']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { prediction_id } = req.params;

      const prediction = await getPrediction(prediction_id);

      if (!prediction) {
        res.status(404).json({ error: 'prediction_not_found' });
        return;
      }

      res.json(prediction);
    } catch (err: any) {
      logger.error('Get prediction error', { error: err.message });
      res.status(500).json({ error: 'server_error', detail: err.message });
    }
  }
);

/**
 * GET /v1/models
 * List loaded models (ml_ops only)
 */
router.get(
  '/models',
  requireRole(['ml_ops', 'internal_service']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const modelManager = getModelManager();
      const loadedModels = modelManager.listLoadedModels();

      res.json({
        models: loadedModels.map((m) => ({
          model_id: m.model_id,
          name: m.metadata.name,
          version: m.metadata.version,
          product: m.metadata.product,
          status: m.metadata.status,
          loaded_at: m.loaded_at,
        })),
        total: loadedModels.length,
      });
    } catch (err: any) {
      logger.error('List models error', { error: err.message });
      res.status(500).json({ error: 'server_error', detail: err.message });
    }
  }
);

/**
 * POST /v1/canary
 * Set canary configuration (ml_ops only)
 */
router.post(
  '/canary',
  requireRole(['ml_ops', 'internal_service']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { product, canary_model_id, production_model_id, canary_percent } = req.body;

      // Validation
      if (!product || !canary_model_id || !production_model_id || canary_percent === undefined) {
        res.status(400).json({
          error: 'missing_required_fields',
          required: ['product', 'canary_model_id', 'production_model_id', 'canary_percent'],
        });
        return;
      }

      const config = await setCanaryConfig(
        product,
        canary_model_id,
        production_model_id,
        canary_percent
      );

      logger.info('Canary config set', {
        user_id: req.user?.user_id,
        product,
        canary_percent,
      });

      res.json(config);
    } catch (err: any) {
      logger.error('Set canary error', { error: err.message });
      res.status(500).json({ error: 'server_error', detail: err.message });
    }
  }
);

/**
 * POST /v1/canary/:product/stop
 * Stop canary deployment (ml_ops only)
 */
router.post(
  '/canary/:product/stop',
  requireRole(['ml_ops', 'internal_service']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { product } = req.params;

      await stopCanary(product);

      logger.info('Canary stopped', {
        user_id: req.user?.user_id,
        product,
      });

      res.json({ ok: true, product, canary_percent: 0 });
    } catch (err: any) {
      logger.error('Stop canary error', { error: err.message });
      res.status(500).json({ error: 'server_error', detail: err.message });
    }
  }
);

/**
 * GET /v1/canary/:product
 * Get canary configuration
 */
router.get(
  '/canary/:product',
  requireRole(['ml_ops', 'pay_admin', 'internal_service']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { product } = req.params;

      const config = await getCanaryConfig(product);

      if (!config) {
        res.status(404).json({ error: 'canary_config_not_found' });
        return;
      }

      res.json(config);
    } catch (err: any) {
      logger.error('Get canary config error', { error: err.message });
      res.status(500).json({ error: 'server_error', detail: err.message });
    }
  }
);

export { router as inferRouter };
