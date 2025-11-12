/**
 * Brique 70sexies - AI Social Ads Generator
 * API Routes for Social Advertising
 */

import { Router, Request, Response } from 'express';
import {
  generateSocialAd,
  getAd,
  listAds,
  updateAdStatus,
  trackPerformance,
  getPerformanceReport,
  generateRecommendations
} from '../services/adEngine';

const router = Router();

/**
 * POST /api/social-ads/generate
 * Generate new AI-powered social ad
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      merchantId,
      platform,
      objective,
      productName,
      productCategory,
      budget,
      currency,
      format,
      desiredConversions,
      avgOrderValue
    } = req.body;

    if (!merchantId || !platform || !objective) {
      return res.status(400).json({
        error: 'Missing required fields: merchantId, platform, objective'
      });
    }

    const ad = await generateSocialAd({
      merchantId,
      platform,
      objective,
      productName,
      productCategory,
      budget,
      currency,
      format,
      desiredConversions,
      avgOrderValue
    });

    res.status(201).json({
      success: true,
      ad
    });
  } catch (error: any) {
    console.error('Error generating social ad:', error);
    res.status(500).json({
      error: 'Failed to generate social ad',
      message: error.message
    });
  }
});

/**
 * GET /api/social-ads
 * List social ads for merchant
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { merchantId, platform, status, limit } = req.query;

    if (!merchantId) {
      return res.status(400).json({
        error: 'Missing required parameter: merchantId'
      });
    }

    const ads = await listAds(merchantId as string, {
      platform: platform as string,
      status: status as string,
      limit: limit ? parseInt(limit as string) : undefined
    });

    res.json({
      success: true,
      ads,
      count: ads.length
    });
  } catch (error: any) {
    console.error('Error listing ads:', error);
    res.status(500).json({
      error: 'Failed to list ads',
      message: error.message
    });
  }
});

/**
 * GET /api/social-ads/:id
 * Get ad details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const ad = await getAd(id);

    res.json({
      success: true,
      ad
    });
  } catch (error: any) {
    console.error('Error getting ad:', error);
    res.status(404).json({
      error: 'Ad not found',
      message: error.message
    });
  }
});

/**
 * PATCH /api/social-ads/:id/status
 * Update ad status
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Missing required field: status'
      });
    }

    const validStatuses = ['draft', 'pending_review', 'approved', 'running', 'paused', 'completed', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    await updateAdStatus(id, status);

    res.json({
      success: true,
      message: `Ad status updated to ${status}`
    });
  } catch (error: any) {
    console.error('Error updating ad status:', error);
    res.status(500).json({
      error: 'Failed to update ad status',
      message: error.message
    });
  }
});

/**
 * POST /api/social-ads/:id/track
 * Track ad performance metrics
 */
router.post('/:id/track', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      date = new Date(),
      impressions,
      clicks,
      conversions,
      spend,
      revenue,
      likes,
      shares,
      comments
    } = req.body;

    await trackPerformance(id, new Date(date), {
      impressions,
      clicks,
      conversions,
      spend,
      revenue,
      likes,
      shares,
      comments
    });

    res.json({
      success: true,
      message: 'Performance tracked successfully'
    });
  } catch (error: any) {
    console.error('Error tracking performance:', error);
    res.status(500).json({
      error: 'Failed to track performance',
      message: error.message
    });
  }
});

/**
 * GET /api/social-ads/:id/report
 * Get performance report
 */
router.get('/:id/report', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { days = 7 } = req.query;

    const report = await getPerformanceReport(id, parseInt(days as string));

    res.json({
      success: true,
      report
    });
  } catch (error: any) {
    console.error('Error getting report:', error);
    res.status(500).json({
      error: 'Failed to get report',
      message: error.message
    });
  }
});

/**
 * POST /api/social-ads/:id/recommendations
 * Generate AI recommendations
 */
router.post('/:id/recommendations', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await generateRecommendations(id);

    res.json({
      success: true,
      message: 'Recommendations generated'
    });
  } catch (error: any) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({
      error: 'Failed to generate recommendations',
      message: error.message
    });
  }
});

/**
 * POST /api/social-ads/:id/start
 * Quick action: Start/run ad
 */
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await updateAdStatus(id, 'running');

    res.json({
      success: true,
      message: 'Ad is now running'
    });
  } catch (error: any) {
    console.error('Error starting ad:', error);
    res.status(500).json({
      error: 'Failed to start ad',
      message: error.message
    });
  }
});

/**
 * POST /api/social-ads/:id/pause
 * Quick action: Pause ad
 */
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await updateAdStatus(id, 'paused');

    res.json({
      success: true,
      message: 'Ad is now paused'
    });
  } catch (error: any) {
    console.error('Error pausing ad:', error);
    res.status(500).json({
      error: 'Failed to pause ad',
      message: error.message
    });
  }
});

export default router;
