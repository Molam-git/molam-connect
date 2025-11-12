/**
 * Limits Routes (Enforcement & Management)
 * Brique 72 - Account Capabilities & Limits
 */

import { Router, Request, Response } from 'express';
import {
  enforceLimit,
  recordUsage,
  invalidateUserCache,
  enforceMultipleLimits,
  warmUserCache,
} from '../services/enforcement';
import {
  applyLimitAdjustment,
} from '../services/siraLimits';
import { pool } from '../db';
import {
  EnforceRequestSchema,
  RecordUsageSchema,
  SetLimitSchema,
} from '../validation/schemas';

const router = Router();

// ========================================
// Enforcement Endpoints
// ========================================

/**
 * POST /api/limits/enforce
 * Fast enforcement check (cached <5ms)
 */
router.post('/enforce', async (req: Request, res: Response) => {
  try {
    const data = EnforceRequestSchema.parse(req.body);
    const result = await enforceLimit(data);

    res.json({
      success: true,
      decision: result.decision,
      allowed: result.allowed,
      reason: result.reason,
      appliedLimit: result.appliedLimit,
      currentUsage: result.currentUsage,
      requiresReview: result.requiresReview,
    });
  } catch (error: any) {
    console.error('Enforcement error', { error });
    res.status(400).json({ error: error.message || 'Invalid request' });
  }
});

/**
 * POST /api/limits/enforce-multiple
 * Enforce multiple limits at once
 */
router.post('/enforce-multiple', async (req: Request, res: Response) => {
  try {
    const { userId, checks } = req.body;

    if (!userId || !Array.isArray(checks)) {
      return res.status(400).json({ error: 'Invalid request: userId and checks array required' });
    }

    const result = await enforceMultipleLimits(userId, checks);

    res.json({
      success: true,
      allowed: result.allowed,
      results: result.results,
    });
  } catch (error: any) {
    console.error('Multiple enforcement error', { error });
    res.status(500).json({ error: error.message || 'Enforcement failed' });
  }
});

/**
 * POST /api/limits/record-usage
 * Record usage after successful transaction
 */
router.post('/record-usage', async (req: Request, res: Response) => {
  try {
    const data = RecordUsageSchema.parse(req.body);
    await recordUsage(
      data.userId,
      data.limitKey,
      data.amount,
      data.currency,
      data.idempotencyKey
    );

    res.json({ success: true, message: 'Usage recorded' });
  } catch (error: any) {
    console.error('Record usage error', { error });
    res.status(400).json({ error: error.message || 'Failed to record usage' });
  }
});

// ========================================
// Limit Management Endpoints
// ========================================

/**
 * GET /api/limits/:userId
 * Get all limits for user
 */
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { currency } = req.query;

    const result = await pool.query(
      `SELECT al.limit_key, ld.display_name, al.limit_value, al.currency,
              al.origin, al.effective_from, al.effective_to
       FROM account_limits al
       JOIN limit_definitions ld ON al.limit_key = ld.limit_key
       WHERE al.user_id = $1
         AND ($2::text IS NULL OR al.currency = $2)
       ORDER BY ld.display_name`,
      [userId, currency || null]
    );

    res.json({
      success: true,
      limits: result.rows,
    });
  } catch (error: any) {
    console.error('Get limits error', { error });
    res.status(500).json({ error: 'Failed to retrieve limits' });
  }
});

/**
 * POST /api/limits/set
 * Set limit for user (Ops)
 */
router.post('/set', async (req: Request, res: Response) => {
  try {
    const data = SetLimitSchema.parse(req.body);

    await applyLimitAdjustment({
      userId: data.userId,
      limitKey: data.limitKey,
      newValue: data.limitValue,
      currency: data.currency,
      reason: data.reason,
      origin: data.origin,
      actorId: data.actorId,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });

    res.json({ success: true, message: 'Limit updated' });
  } catch (error: any) {
    console.error('Set limit error', { error });
    res.status(400).json({ error: error.message || 'Failed to set limit' });
  }
});

/**
 * GET /api/limits/:userId/usage
 * Get usage statistics for user
 */
router.get('/:userId/usage', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { currency, limitKey } = req.query;

    const result = await pool.query(
      `SELECT lu.limit_key, ld.display_name, lu.currency, lu.time_window,
              lu.usage_amount, lu.usage_count
       FROM limit_usage lu
       JOIN limit_definitions ld ON lu.limit_key = ld.limit_key
       WHERE lu.user_id = $1
         AND ($2::text IS NULL OR lu.currency = $2)
         AND ($3::text IS NULL OR lu.limit_key = $3)
       ORDER BY lu.time_window DESC, ld.display_name`,
      [userId, currency || null, limitKey || null]
    );

    res.json({
      success: true,
      usage: result.rows,
    });
  } catch (error: any) {
    console.error('Get usage error', { error });
    res.status(500).json({ error: 'Failed to retrieve usage' });
  }
});

// ========================================
// Audit & Cache Endpoints
// ========================================

/**
 * GET /api/limits/audit/:userId
 * Get audit trail for user
 */
router.get('/audit/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT la.id, la.action, la.entity_type, la.payload, la.actor_id, la.created_at
       FROM limit_audit la
       WHERE la.user_id = $1
       ORDER BY la.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({
      success: true,
      audit: result.rows,
    });
  } catch (error: any) {
    console.error('Get audit error', { error });
    res.status(500).json({ error: 'Failed to retrieve audit trail' });
  }
});

/**
 * POST /api/limits/cache/invalidate/:userId
 * Invalidate cache for user (admin)
 */
router.post('/cache/invalidate/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    await invalidateUserCache(userId);

    res.json({ success: true, message: 'Cache invalidated' });
  } catch (error: any) {
    console.error('Cache invalidation error', { error });
    res.status(500).json({ error: 'Failed to invalidate cache' });
  }
});

/**
 * POST /api/limits/cache/warm/:userId
 * Warm cache for user (after login/KYC upgrade)
 */
router.post('/cache/warm/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    await warmUserCache(userId);

    res.json({ success: true, message: 'Cache warmed' });
  } catch (error: any) {
    console.error('Cache warming error', { error });
    res.status(500).json({ error: 'Failed to warm cache' });
  }
});

export default router;
