// ============================================================================
// Split Rules API Routes
// ============================================================================

import { Router } from 'express';
import { requireAuth, requireRole, requirePlatformAccess } from '../middleware/auth';
import * as splitRulesService from '../services/splitRulesService';
import { CreateSplitRuleInput } from '../types';

const router = Router();

/**
 * POST /api/splits/rules
 * Create a new split rule
 */
router.post(
  '/rules',
  requireAuth,
  requireRole(['platform_admin', 'finance_ops']),
  async (req: any, res: any) => {
    try {
      const input: CreateSplitRuleInput = {
        ...req.body,
        created_by: req.user!.id,
      };

      const rule = await splitRulesService.createSplitRule(input);

      res.status(201).json({
        success: true,
        data: rule,
      });
    } catch (error: any) {
      console.error('Error creating split rule:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to create split rule',
      });
    }
  }
);

/**
 * GET /api/splits/rules/:id
 * Get split rule by ID
 */
router.get(
  '/rules/:id',
  requireAuth,
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const rule = await splitRulesService.getSplitRuleById(id);

      if (!rule) {
        res.status(404).json({
          success: false,
          error: 'Split rule not found',
        });
        return;
      }

      res.json({
        success: true,
        data: rule,
      });
    } catch (error: any) {
      console.error('Error fetching split rule:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch split rule',
      });
    }
  }
);

/**
 * GET /api/splits/rules
 * List split rules for a platform
 */
router.get(
  '/rules',
  requireAuth,
  async (req: any, res: any) => {
    try {
      const platform_id = req.query.platform_id || req.user!.platform_id;
      const filters = {
        merchant_id: req.query.merchant_id,
        status: req.query.status,
        limit: parseInt(req.query.limit || '100'),
        offset: parseInt(req.query.offset || '0'),
      };

      const rules = await splitRulesService.listSplitRules(platform_id, filters);

      res.json({
        success: true,
        data: rules,
        meta: {
          limit: filters.limit,
          offset: filters.offset,
        },
      });
    } catch (error: any) {
      console.error('Error listing split rules:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to list split rules',
      });
    }
  }
);

/**
 * PATCH /api/splits/rules/:id/status
 * Update split rule status
 */
router.patch(
  '/rules/:id/status',
  requireAuth,
  requireRole(['platform_admin', 'finance_ops']),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'inactive', 'archived'].includes(status)) {
        res.status(400).json({
          success: false,
          error: 'Invalid status value',
        });
        return;
      }

      const rule = await splitRulesService.updateSplitRuleStatus(
        id,
        status,
        req.user!.id
      );

      res.json({
        success: true,
        data: rule,
      });
    } catch (error: any) {
      console.error('Error updating split rule status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update split rule status',
      });
    }
  }
);

/**
 * PATCH /api/splits/rules/:id
 * Update split rule configuration
 */
router.patch(
  '/rules/:id',
  requireAuth,
  requireRole(['platform_admin', 'finance_ops']),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const rule = await splitRulesService.updateSplitRuleConfig(
        id,
        updates,
        req.user!.id
      );

      res.json({
        success: true,
        data: rule,
      });
    } catch (error: any) {
      console.error('Error updating split rule:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update split rule',
      });
    }
  }
);

/**
 * DELETE /api/splits/rules/:id
 * Delete (archive) split rule
 */
router.delete(
  '/rules/:id',
  requireAuth,
  requireRole(['platform_admin']),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      await splitRulesService.deleteSplitRule(id, req.user!.id);

      res.json({
        success: true,
        message: 'Split rule archived successfully',
      });
    } catch (error: any) {
      console.error('Error deleting split rule:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete split rule',
      });
    }
  }
);

export default router;
