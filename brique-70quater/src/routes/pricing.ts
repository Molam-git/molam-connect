/**
 * Pricing AI API Routes
 */

import { Router, Request, Response } from 'express';
import { generatePriceRecommendation, applyPriceRecommendation, getRecommendations } from '../services/pricingEngine';

export const pricingRouter = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    merchantId: string;
    role: string;
  };
}

/**
 * POST /api/pricing/suggest
 * Generate AI price recommendation
 */
pricingRouter.post('/suggest', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId || req.body.merchantId;
    const { productId, zone } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'productId required' });
    }

    const recommendation = await generatePriceRecommendation(merchantId, productId, zone);

    res.json({
      success: true,
      data: recommendation,
    });
  } catch (error) {
    console.error('Error generating recommendation:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/pricing/apply
 * Apply price recommendation
 */
pricingRouter.post('/apply', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { recommendationId, accepted, appliedPrice } = req.body;

    if (!recommendationId || typeof accepted !== 'boolean') {
      return res.status(400).json({ error: 'recommendationId and accepted required' });
    }

    const result = await applyPriceRecommendation(recommendationId, accepted, appliedPrice);

    res.json({
      success: true,
      data: result,
      message: accepted ? 'Price updated successfully' : 'Recommendation rejected',
    });
  } catch (error) {
    console.error('Error applying recommendation:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/pricing/recommendations
 * Get all recommendations
 */
pricingRouter.get('/recommendations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = req.query.status as string | undefined;
    const recommendations = await getRecommendations(merchantId, status);

    res.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
