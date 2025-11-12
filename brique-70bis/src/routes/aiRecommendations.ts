/**
 * AI Recommendations API Routes
 *
 * Endpoints for managing SIRA-generated marketing recommendations
 */

import { Router, Request, Response } from 'express';
import {
  generateRecommendations,
  getRecommendations,
  applyRecommendation,
  dismissRecommendation,
  fetchMerchantMetrics,
} from '../services/aiEngine';

export const aiRecommendationsRouter = Router();

// Middleware to extract user context (would be provided by auth middleware)
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    merchantId: string;
    role: string;
  };
}

/**
 * GET /api/ai/recommendations
 * Get AI recommendations for merchant
 */
aiRecommendationsRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 10;
    const recommendations = await getRecommendations(merchantId, limit);

    res.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ai/recommendations/generate
 * Generate new AI recommendations for merchant
 */
aiRecommendationsRouter.post('/generate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const recommendations = await generateRecommendations(merchantId);

    res.json({
      success: true,
      data: recommendations,
      message: `Generated ${recommendations.length} new recommendations`,
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ai/recommendations/:id/apply
 * Apply a recommendation (create actual campaign/promo)
 */
aiRecommendationsRouter.post('/:id/apply', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await applyRecommendation(id, userId);

    if (!result.success) {
      return res.status(404).json({ error: 'Recommendation not found or already applied' });
    }

    res.json({
      success: true,
      data: {
        recommendationId: id,
        createdEntityId: result.createdEntityId,
      },
      message: 'Recommendation applied successfully',
    });
  } catch (error) {
    console.error('Error applying recommendation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ai/recommendations/:id/dismiss
 * Dismiss a recommendation
 */
aiRecommendationsRouter.post('/:id/dismiss', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const success = await dismissRecommendation(id, userId, reason);

    if (!success) {
      return res.status(404).json({ error: 'Recommendation not found or already processed' });
    }

    res.json({
      success: true,
      message: 'Recommendation dismissed',
    });
  } catch (error) {
    console.error('Error dismissing recommendation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/ai/metrics
 * Get merchant metrics used for AI analysis
 */
aiRecommendationsRouter.get('/metrics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const timeframe = (req.query.timeframe as '7d' | '30d' | '90d') || '30d';
    const metrics = await fetchMerchantMetrics(merchantId, timeframe);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
