/**
 * A/B Testing API Routes
 *
 * Endpoints for managing A/B tests and experiments
 */

import { Router, Request, Response } from 'express';
import {
  createABTest,
  startABTest,
  stopABTest,
  getABTest,
  getABTests,
  analyzeABTest,
  recordImpression,
  recordClick,
  recordConversion,
  deployWinner,
} from '../services/abTesting';

export const abTestsRouter = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    merchantId: string;
    role: string;
  };
}

/**
 * GET /api/ab-tests
 * Get all A/B tests for merchant
 */
abTestsRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = req.query.status as string | undefined;
    const tests = await getABTests(merchantId, status);

    res.json({
      success: true,
      data: tests,
    });
  } catch (error) {
    console.error('Error fetching A/B tests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/ab-tests/:id
 * Get a specific A/B test
 */
abTestsRouter.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const test = await getABTest(id);

    if (!test) {
      return res.status(404).json({ error: 'A/B test not found' });
    }

    // Check authorization
    if (test.merchantId !== req.user?.merchantId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({
      success: true,
      data: test,
    });
  } catch (error) {
    console.error('Error fetching A/B test:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ab-tests
 * Create a new A/B test
 */
abTestsRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    const userId = req.user?.id;

    if (!merchantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      campaignId,
      name,
      description,
      variantA,
      variantB,
      variantC,
      trafficSplit,
      startDate,
      endDate,
      autoDeployWinner,
    } = req.body;

    // Validate required fields
    if (!name || !variantA || !variantB) {
      return res.status(400).json({ error: 'Missing required fields: name, variantA, variantB' });
    }

    const test = await createABTest({
      merchantId,
      campaignId,
      name,
      description,
      variantA,
      variantB,
      variantC,
      trafficSplit,
      startDate: new Date(startDate || Date.now()),
      endDate: endDate ? new Date(endDate) : undefined,
      autoDeployWinner,
      createdBy: userId,
    });

    res.status(201).json({
      success: true,
      data: test,
      message: 'A/B test created successfully',
    });
  } catch (error) {
    console.error('Error creating A/B test:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ab-tests/:id/start
 * Start an A/B test
 */
abTestsRouter.post('/:id/start', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const test = await getABTest(id);
    if (!test || test.merchantId !== req.user?.merchantId) {
      return res.status(404).json({ error: 'A/B test not found' });
    }

    const startedTest = await startABTest(id);

    res.json({
      success: true,
      data: startedTest,
      message: 'A/B test started',
    });
  } catch (error) {
    console.error('Error starting A/B test:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ab-tests/:id/stop
 * Stop an A/B test
 */
abTestsRouter.post('/:id/stop', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const test = await getABTest(id);
    if (!test || test.merchantId !== req.user?.merchantId) {
      return res.status(404).json({ error: 'A/B test not found' });
    }

    const stoppedTest = await stopABTest(id, 'completed');

    res.json({
      success: true,
      data: stoppedTest,
      message: 'A/B test stopped',
    });
  } catch (error) {
    console.error('Error stopping A/B test:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ab-tests/:id/analyze
 * Analyze an A/B test and get results
 */
abTestsRouter.post('/:id/analyze', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const test = await getABTest(id);
    if (!test || test.merchantId !== req.user?.merchantId) {
      return res.status(404).json({ error: 'A/B test not found' });
    }

    const result = await analyzeABTest(id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error analyzing A/B test:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ab-tests/:id/deploy-winner
 * Deploy the winning variant
 */
abTestsRouter.post('/:id/deploy-winner', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { winner } = req.body;

    if (!winner || !['variant_a', 'variant_b', 'variant_c'].includes(winner)) {
      return res.status(400).json({ error: 'Invalid winner specified' });
    }

    // Verify ownership
    const test = await getABTest(id);
    if (!test || test.merchantId !== req.user?.merchantId) {
      return res.status(404).json({ error: 'A/B test not found' });
    }

    await deployWinner(id, winner);

    res.json({
      success: true,
      message: `Deployed ${winner} as permanent campaign`,
    });
  } catch (error) {
    console.error('Error deploying winner:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ab-tests/:id/track/impression
 * Track an impression for a variant (public endpoint for tracking)
 */
abTestsRouter.post('/:id/track/impression', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { variant } = req.body;

    if (!variant || !['a', 'b', 'c'].includes(variant)) {
      return res.status(400).json({ error: 'Invalid variant' });
    }

    await recordImpression(id, variant);

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking impression:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ab-tests/:id/track/click
 * Track a click for a variant
 */
abTestsRouter.post('/:id/track/click', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { variant } = req.body;

    if (!variant || !['a', 'b', 'c'].includes(variant)) {
      return res.status(400).json({ error: 'Invalid variant' });
    }

    await recordClick(id, variant);

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/ab-tests/:id/track/conversion
 * Track a conversion for a variant
 */
abTestsRouter.post('/:id/track/conversion', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { variant, orderValue } = req.body;

    if (!variant || !['a', 'b', 'c'].includes(variant)) {
      return res.status(400).json({ error: 'Invalid variant' });
    }

    if (typeof orderValue !== 'number' || orderValue < 0) {
      return res.status(400).json({ error: 'Invalid order value' });
    }

    await recordConversion(id, variant, orderValue);

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking conversion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
