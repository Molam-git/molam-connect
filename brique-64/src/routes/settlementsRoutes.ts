// ============================================================================
// Settlements API Routes
// ============================================================================

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import * as settlementsService from '../services/settlementsService';
import * as paymentSplitsService from '../services/paymentSplitsService';
import { CreateSettlementInput } from '../types';

const router = Router();

/**
 * POST /api/settlements
 * Create a new settlement batch
 */
router.post(
  '/',
  requireAuth,
  requireRole(['finance_ops', 'platform_admin']),
  async (req: any, res: any) => {
    try {
      const input: CreateSettlementInput = req.body;

      const settlement = await settlementsService.createSettlement(input);

      res.status(201).json({
        success: true,
        data: settlement,
      });
    } catch (error: any) {
      console.error('Error creating settlement:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to create settlement',
      });
    }
  }
);

/**
 * POST /api/settlements/auto-create
 * Auto-create settlement for recipient's pending splits
 */
router.post(
  '/auto-create',
  requireAuth,
  requireRole(['finance_ops', 'platform_admin']),
  async (req: any, res: any) => {
    try {
      const { platform_id, recipient_id, currency = 'USD' } = req.body;

      // Get pending splits for recipient
      const pendingSplits = await paymentSplitsService.getPendingSplitsForSettlement(
        platform_id,
        recipient_id,
        currency
      );

      if (pendingSplits.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No pending splits found for recipient',
        });
        return;
      }

      // Create settlement
      const now = new Date();
      const periodStart = new Date(pendingSplits[pendingSplits.length - 1].created_at);
      const periodEnd = new Date(pendingSplits[0].created_at);
      const scheduledAt = new Date(now.getTime() + 24 * 3600 * 1000); // Tomorrow

      const settlement = await settlementsService.createSettlement({
        platform_id,
        recipient_id,
        recipient_type: pendingSplits[0].recipient_type,
        settlement_period_start: periodStart,
        settlement_period_end: periodEnd,
        scheduled_at: scheduledAt,
        currency,
        metadata: {
          auto_created: true,
          pending_splits_count: pendingSplits.length,
        },
      });

      // Assign splits to settlement
      const split_ids = pendingSplits.map((s) => s.id);
      await paymentSplitsService.assignSplitsToSettlement(split_ids, settlement.id);

      // Update settlement totals
      const updatedSettlement = await settlementsService.updateSettlementTotals(settlement.id);

      res.status(201).json({
        success: true,
        data: updatedSettlement,
      });
    } catch (error: any) {
      console.error('Error auto-creating settlement:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to auto-create settlement',
      });
    }
  }
);

/**
 * GET /api/settlements/:id
 * Get settlement by ID
 */
router.get(
  '/:id',
  requireAuth,
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const settlement = await settlementsService.getSettlementById(id);

      if (!settlement) {
        res.status(404).json({
          success: false,
          error: 'Settlement not found',
        });
        return;
      }

      res.json({
        success: true,
        data: settlement,
      });
    } catch (error: any) {
      console.error('Error fetching settlement:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch settlement',
      });
    }
  }
);

/**
 * GET /api/settlements/batch/:batch_id
 * Get settlement by batch ID
 */
router.get(
  '/batch/:batch_id',
  requireAuth,
  async (req: any, res: any) => {
    try {
      const { batch_id } = req.params;
      const settlement = await settlementsService.getSettlementByBatchId(batch_id);

      if (!settlement) {
        res.status(404).json({
          success: false,
          error: 'Settlement not found',
        });
        return;
      }

      res.json({
        success: true,
        data: settlement,
      });
    } catch (error: any) {
      console.error('Error fetching settlement:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch settlement',
      });
    }
  }
);

/**
 * GET /api/settlements
 * List settlements for a platform
 */
router.get(
  '/',
  requireAuth,
  async (req: any, res: any) => {
    try {
      const platform_id = req.query.platform_id || req.user!.platform_id;
      const filters = {
        recipient_id: req.query.recipient_id,
        status: req.query.status,
        from_date: req.query.from_date ? new Date(req.query.from_date) : undefined,
        to_date: req.query.to_date ? new Date(req.query.to_date) : undefined,
        limit: parseInt(req.query.limit || '100'),
        offset: parseInt(req.query.offset || '0'),
      };

      const settlements = await settlementsService.listSettlements(platform_id, filters);

      res.json({
        success: true,
        data: settlements,
        meta: {
          limit: filters.limit,
          offset: filters.offset,
        },
      });
    } catch (error: any) {
      console.error('Error listing settlements:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to list settlements',
      });
    }
  }
);

/**
 * PATCH /api/settlements/:id/status
 * Update settlement status
 */
router.patch(
  '/:id/status',
  requireAuth,
  requireRole(['finance_ops', 'platform_admin']),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { status, payout_id, payout_method, payout_reference } = req.body;

      if (
        !['scheduled', 'processing', 'completed', 'partial', 'failed', 'cancelled'].includes(
          status
        )
      ) {
        res.status(400).json({
          success: false,
          error: 'Invalid status value',
        });
        return;
      }

      const settlement = await settlementsService.updateSettlementStatus(id, status, {
        payout_id,
        payout_method,
        payout_reference,
      });

      res.json({
        success: true,
        data: settlement,
      });
    } catch (error: any) {
      console.error('Error updating settlement status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update settlement status',
      });
    }
  }
);

/**
 * POST /api/settlements/:id/review
 * Approve settlement after manual review
 */
router.post(
  '/:id/review',
  requireAuth,
  requireRole(['finance_ops', 'compliance', 'platform_admin']),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { approved } = req.body;

      if (approved) {
        const settlement = await settlementsService.approveSettlement(id, req.user!.id);

        res.json({
          success: true,
          data: settlement,
          message: 'Settlement approved for execution',
        });
      } else {
        // Cancel settlement
        const settlement = await settlementsService.updateSettlementStatus(id, 'cancelled');

        res.json({
          success: true,
          data: settlement,
          message: 'Settlement cancelled',
        });
      }
    } catch (error: any) {
      console.error('Error reviewing settlement:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to review settlement',
      });
    }
  }
);

/**
 * GET /api/settlements/platform/:platform_id/statistics
 * Get settlement statistics for a platform
 */
router.get(
  '/platform/:platform_id/statistics',
  requireAuth,
  requireRole(['platform_admin', 'finance_ops']),
  async (req: any, res: any) => {
    try {
      const { platform_id } = req.params;
      const from_date = req.query.from_date
        ? new Date(req.query.from_date)
        : new Date(Date.now() - 30 * 24 * 3600 * 1000); // Default: last 30 days
      const to_date = req.query.to_date ? new Date(req.query.to_date) : new Date();

      const stats = await settlementsService.getSettlementStatistics(
        platform_id,
        from_date,
        to_date
      );

      res.json({
        success: true,
        data: stats,
        meta: {
          from_date,
          to_date,
        },
      });
    } catch (error: any) {
      console.error('Error fetching settlement statistics:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch settlement statistics',
      });
    }
  }
);

export default router;
