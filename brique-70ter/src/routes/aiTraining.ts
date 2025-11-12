/**
 * AI Training API Routes
 */

import { Router, Request, Response } from 'express';
import { trainLocalModel, getTrainingRuns, getGlobalModels, deployModel, aggregateFederatedModels } from '../services/aiTrainer';
import { getMerchantConfig, updateMerchantConfig, trainPersonalizedModel } from '../services/personalizedModels';
import { createCrawlerJob, getExternalData, getPendingCrawlerJobs } from '../services/externalDataCollector';

export const aiTrainingRouter = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    merchantId: string;
    role: string;
  };
}

/**
 * POST /api/ai-training/train
 * Train local model for merchant
 */
aiTrainingRouter.post('/train', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const run = await trainLocalModel(merchantId);

    res.json({
      success: true,
      data: run,
      message: `Model trained successfully with ${run.metrics.accuracy * 100}% accuracy`,
    });
  } catch (error) {
    console.error('Error training model:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ai-training/train-personalized
 * Train personalized model with config
 */
aiTrainingRouter.post('/train-personalized', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const run = await trainPersonalizedModel(merchantId);

    res.json({
      success: true,
      data: run,
    });
  } catch (error) {
    console.error('Error training personalized model:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/ai-training/runs
 * Get training runs for merchant
 */
aiTrainingRouter.get('/runs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const runs = await getTrainingRuns(merchantId, limit);

    res.json({
      success: true,
      data: runs,
    });
  } catch (error) {
    console.error('Error fetching training runs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ai-training/aggregate
 * Aggregate federated models (Ops only)
 */
aiTrainingRouter.post('/aggregate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'ops' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Ops/Admin only' });
    }

    const minContributors = parseInt(req.body.minContributors) || 5;
    const globalModel = await aggregateFederatedModels(minContributors);

    res.json({
      success: true,
      data: globalModel,
      message: `Global model aggregated from ${globalModel.metrics.contributing_merchants} merchants`,
    });
  } catch (error) {
    console.error('Error aggregating models:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/ai-training/global-models
 * Get global models
 */
aiTrainingRouter.get('/global-models', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const models = await getGlobalModels(limit);

    res.json({
      success: true,
      data: models,
    });
  } catch (error) {
    console.error('Error fetching global models:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/ai-training/config
 * Get merchant configuration
 */
aiTrainingRouter.get('/config', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const config = await getMerchantConfig(merchantId);

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/ai-training/config
 * Update merchant configuration
 */
aiTrainingRouter.put('/config', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const config = await updateMerchantConfig(merchantId, req.body);

    res.json({
      success: true,
      data: config,
      message: 'Configuration updated successfully',
    });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ai-training/crawler-job
 * Create crawler job
 */
aiTrainingRouter.post('/crawler-job', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'ops' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Ops/Admin only' });
    }

    const { jobType, targetUrls, filters, priority } = req.body;

    if (!jobType || !targetUrls || !Array.isArray(targetUrls)) {
      return res.status(400).json({ error: 'Invalid request: jobType and targetUrls required' });
    }

    const job = await createCrawlerJob(jobType, targetUrls, filters, priority);

    res.json({
      success: true,
      data: job,
      message: 'Crawler job created successfully',
    });
  } catch (error) {
    console.error('Error creating crawler job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/ai-training/external-data
 * Get external data sources
 */
aiTrainingRouter.get('/external-data', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sourceType = req.query.sourceType as string | undefined;
    const category = req.query.category as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const data = await getExternalData(sourceType, category, limit);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching external data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ai-training/:id/deploy
 * Deploy a trained model
 */
aiTrainingRouter.post('/:id/deploy', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const success = await deployModel(id);

    if (!success) {
      return res.status(404).json({ error: 'Training run not found' });
    }

    res.json({
      success: true,
      message: 'Model deployed successfully',
    });
  } catch (error) {
    console.error('Error deploying model:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
