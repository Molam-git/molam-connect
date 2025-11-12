/**
 * Brique 70quinquies - AI Campaign Generator
 * Campaign API Routes
 */

import { Router, Request, Response } from 'express';
import {
  generateCampaign,
  getCampaign,
  updateCampaignStatus,
  trackEvent,
  getCampaignReport,
  createSegment,
  listCampaigns,
  optimizeCampaign
} from '../services/campaignEngine';

const router = Router();

/**
 * POST /campaigns
 * Generate new AI campaign
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      merchantId,
      type,
      channel,
      language,
      audienceSegment,
      discountValue,
      promoCode,
      expiryDate,
      autoOptimize
    } = req.body;

    if (!merchantId || !type || !channel) {
      return res.status(400).json({
        error: 'Missing required fields: merchantId, type, channel'
      });
    }

    const campaign = await generateCampaign({
      merchantId,
      type,
      channel,
      language,
      audienceSegment,
      discountValue,
      promoCode,
      expiryDate,
      autoOptimize
    });

    res.status(201).json({
      success: true,
      campaign
    });
  } catch (error: any) {
    console.error('Error generating campaign:', error);
    res.status(500).json({
      error: 'Failed to generate campaign',
      message: error.message
    });
  }
});

/**
 * GET /campaigns
 * List campaigns for merchant
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { merchantId, status, channel, limit } = req.query;

    if (!merchantId) {
      return res.status(400).json({
        error: 'Missing required parameter: merchantId'
      });
    }

    const campaigns = await listCampaigns(merchantId as string, {
      status: status as string,
      channel: channel as string,
      limit: limit ? parseInt(limit as string) : undefined
    });

    res.json({
      success: true,
      campaigns,
      count: campaigns.length
    });
  } catch (error: any) {
    console.error('Error listing campaigns:', error);
    res.status(500).json({
      error: 'Failed to list campaigns',
      message: error.message
    });
  }
});

/**
 * GET /campaigns/:id
 * Get campaign details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const campaign = await getCampaign(id);

    res.json({
      success: true,
      campaign
    });
  } catch (error: any) {
    console.error('Error getting campaign:', error);
    res.status(404).json({
      error: 'Campaign not found',
      message: error.message
    });
  }
});

/**
 * PATCH /campaigns/:id/status
 * Update campaign status
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

    const validStatuses = ['draft', 'scheduled', 'sending', 'sent', 'paused', 'stopped'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    await updateCampaignStatus(id, status);

    res.json({
      success: true,
      message: `Campaign status updated to ${status}`
    });
  } catch (error: any) {
    console.error('Error updating campaign status:', error);
    res.status(500).json({
      error: 'Failed to update campaign status',
      message: error.message
    });
  }
});

/**
 * POST /campaigns/:id/track
 * Track campaign event (sent, opened, clicked, purchased)
 */
router.post('/:id/track', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { event, customerId, metadata } = req.body;

    if (!event) {
      return res.status(400).json({
        error: 'Missing required field: event'
      });
    }

    const validEvents = ['sent', 'opened', 'clicked', 'purchased'];
    if (!validEvents.includes(event)) {
      return res.status(400).json({
        error: `Invalid event. Must be one of: ${validEvents.join(', ')}`
      });
    }

    await trackEvent(id, event, customerId, metadata);

    res.json({
      success: true,
      message: `Event ${event} tracked successfully`
    });
  } catch (error: any) {
    console.error('Error tracking event:', error);
    res.status(500).json({
      error: 'Failed to track event',
      message: error.message
    });
  }
});

/**
 * GET /campaigns/:id/report
 * Get campaign performance report
 */
router.get('/:id/report', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const report = await getCampaignReport(id);

    res.json({
      success: true,
      report
    });
  } catch (error: any) {
    console.error('Error getting campaign report:', error);
    res.status(500).json({
      error: 'Failed to get campaign report',
      message: error.message
    });
  }
});

/**
 * POST /campaigns/:id/optimize
 * Manually trigger campaign optimization
 */
router.post('/:id/optimize', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await optimizeCampaign(id);

    res.json({
      success: true,
      message: 'Campaign optimization triggered'
    });
  } catch (error: any) {
    console.error('Error optimizing campaign:', error);
    res.status(500).json({
      error: 'Failed to optimize campaign',
      message: error.message
    });
  }
});

/**
 * POST /segments
 * Create audience segment
 */
router.post('/segments', async (req: Request, res: Response) => {
  try {
    const { merchantId, name, segmentType, criteria } = req.body;

    if (!merchantId || !name || !segmentType || !criteria) {
      return res.status(400).json({
        error: 'Missing required fields: merchantId, name, segmentType, criteria'
      });
    }

    const segment = await createSegment(merchantId, name, segmentType, criteria);

    res.status(201).json({
      success: true,
      segment
    });
  } catch (error: any) {
    console.error('Error creating segment:', error);
    res.status(500).json({
      error: 'Failed to create segment',
      message: error.message
    });
  }
});

export default router;
