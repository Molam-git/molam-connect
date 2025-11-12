// ============================================================================
// Payment Splits API Routes
// ============================================================================

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import * as paymentSplitsService from '../services/paymentSplitsService';
import * as splitCalculationService from '../services/splitCalculationService';
import { CalculateSplitsInput } from '../types';

const router = Router();

/**
 * POST /api/splits/calculate
 * Calculate splits for a payment (preview, not saved)
 */
router.post(
  '/calculate',
  requireAuth,
  async (req: any, res: any) => {
    try {
      const input: CalculateSplitsInput = req.body;

      const result = await splitCalculationService.calculateSplits(input);
      splitCalculationService.validateSplitCalculation(result);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('Error calculating splits:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to calculate splits',
      });
    }
  }
);

/**
 * POST /api/splits/execute
 * Calculate and execute splits for a payment
 */
router.post(
  '/execute',
  requireAuth,
  requireRole(['payment_processor', 'platform_admin']),
  async (req: any, res: any) => {
    try {
      const input: CalculateSplitsInput = req.body;

      // 1. Calculate splits
      const calculation = await splitCalculationService.calculateSplits(input);
      splitCalculationService.validateSplitCalculation(calculation);

      // 2. Create payment split records
      const splitInputs = calculation.recipients.map((recipient) => ({
        payment_id: calculation.payment_id,
        split_rule_id: calculation.split_rule_id,
        platform_id: calculation.platform_id,
        merchant_id: calculation.merchant_id,
        customer_id: input.recipient_mapping.seller, // Optional
        recipient_id: recipient.recipient_id,
        recipient_type: recipient.recipient_type,
        recipient_account_id: recipient.recipient_account_id,
        total_payment_amount: calculation.total_amount,
        split_amount: recipient.amount,
        currency: calculation.currency,
        calculation_basis: recipient.calculation_basis,
        metadata: {},
      }));

      const splits = await paymentSplitsService.createPaymentSplits(splitInputs);

      res.status(201).json({
        success: true,
        data: {
          splits,
          summary: {
            total_recipients: splits.length,
            total_amount: calculation.total_amount,
            currency: calculation.currency,
          },
        },
      });
    } catch (error: any) {
      console.error('Error executing splits:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to execute splits',
      });
    }
  }
);

/**
 * GET /api/splits/payment/:payment_id
 * Get splits for a specific payment
 */
router.get(
  '/payment/:payment_id',
  requireAuth,
  async (req: any, res: any) => {
    try {
      const { payment_id } = req.params;
      const splits = await paymentSplitsService.getSplitsByPaymentId(payment_id);

      res.json({
        success: true,
        data: splits,
      });
    } catch (error: any) {
      console.error('Error fetching payment splits:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch payment splits',
      });
    }
  }
);

/**
 * GET /api/splits/:id
 * Get split by ID
 */
router.get(
  '/:id',
  requireAuth,
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const split = await paymentSplitsService.getSplitById(id);

      if (!split) {
        res.status(404).json({
          success: false,
          error: 'Split not found',
        });
        return;
      }

      res.json({
        success: true,
        data: split,
      });
    } catch (error: any) {
      console.error('Error fetching split:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch split',
      });
    }
  }
);

/**
 * GET /api/splits/recipient/:recipient_id
 * Get splits for a recipient
 */
router.get(
  '/recipient/:recipient_id',
  requireAuth,
  async (req: any, res: any) => {
    try {
      const { recipient_id } = req.params;
      const filters = {
        status: req.query.status,
        from_date: req.query.from_date ? new Date(req.query.from_date) : undefined,
        to_date: req.query.to_date ? new Date(req.query.to_date) : undefined,
        limit: parseInt(req.query.limit || '100'),
        offset: parseInt(req.query.offset || '0'),
      };

      const splits = await paymentSplitsService.getSplitsByRecipient(recipient_id, filters);

      res.json({
        success: true,
        data: splits,
        meta: {
          limit: filters.limit,
          offset: filters.offset,
        },
      });
    } catch (error: any) {
      console.error('Error fetching recipient splits:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch recipient splits',
      });
    }
  }
);

/**
 * PATCH /api/splits/:id/status
 * Update split status (admin only)
 */
router.patch(
  '/:id/status',
  requireAuth,
  requireRole(['finance_ops', 'platform_admin']),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { status, settlement_id, failure_reason, payout_reference } = req.body;

      if (!['pending', 'processing', 'settled', 'failed', 'reversed'].includes(status)) {
        res.status(400).json({
          success: false,
          error: 'Invalid status value',
        });
        return;
      }

      const split = await paymentSplitsService.updateSplitStatus(id, status, {
        settlement_id,
        failure_reason,
        payout_reference,
      });

      res.json({
        success: true,
        data: split,
      });
    } catch (error: any) {
      console.error('Error updating split status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update split status',
      });
    }
  }
);

/**
 * GET /api/splits/platform/:platform_id/statistics
 * Get split statistics for a platform
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

      const stats = await paymentSplitsService.getSplitStatistics(
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
      console.error('Error fetching split statistics:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch split statistics',
      });
    }
  }
);

export default router;
