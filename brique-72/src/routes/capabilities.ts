/**
 * Capabilities Routes
 * Brique 72 - Account Capabilities & Limits
 */

import { Router, Request, Response } from 'express';
import { hasCapability, invalidateUserCache } from '../services/enforcement';
import { pool } from '../db';
import { CapabilityCheckSchema, SetCapabilitySchema, UserIdParamSchema } from '../validation/schemas';

const router = Router();

// ========================================
// Capability Check
// ========================================

/**
 * POST /api/capabilities/check
 * Check if user has capability
 */
router.post('/check', async (req: Request, res: Response) => {
  try {
    const data = CapabilityCheckSchema.parse(req.body);
    const result = await hasCapability(data.userId, data.capabilityKey);

    res.json({
      success: true,
      hasCapability: result.has,
      reason: result.reason,
    });
  } catch (error: any) {
    console.error('Capability check error', { error });
    res.status(400).json({ error: error.message || 'Invalid request' });
  }
});

// ========================================
// Get User Capabilities
// ========================================

/**
 * GET /api/capabilities/:userId
 * Get all capabilities for user
 */
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT ac.capability_key, cd.display_name, cd.category, ac.enabled,
              ac.effective_from, ac.effective_to, ac.origin
       FROM account_capabilities ac
       JOIN capability_definitions cd ON ac.capability_key = cd.capability_key
       WHERE ac.user_id = $1
       ORDER BY cd.category, cd.display_name`,
      [userId]
    );

    res.json({
      success: true,
      capabilities: result.rows,
    });
  } catch (error: any) {
    console.error('Get capabilities error', { error });
    res.status(500).json({ error: 'Failed to retrieve capabilities' });
  }
});

// ========================================
// Set Capability
// ========================================

/**
 * POST /api/capabilities/set
 * Set capability for user (Ops)
 */
router.post('/set', async (req: Request, res: Response) => {
  try {
    const data = SetCapabilitySchema.parse(req.body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert capability
      await client.query(
        `INSERT INTO account_capabilities (user_id, capability_key, enabled, effective_from, effective_to, origin)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, capability_key)
         DO UPDATE SET
           enabled = EXCLUDED.enabled,
           effective_from = EXCLUDED.effective_from,
           effective_to = EXCLUDED.effective_to,
           origin = EXCLUDED.origin,
           updated_at = NOW()`,
        [
          data.userId,
          data.capabilityKey,
          data.enabled,
          data.effectiveFrom || null,
          data.effectiveTo || null,
          data.origin,
        ]
      );

      // Audit log (automatically created by trigger)

      await client.query('COMMIT');

      // Invalidate cache
      await invalidateUserCache(data.userId);

      res.json({ success: true, message: 'Capability updated' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Set capability error', { error });
    res.status(400).json({ error: error.message || 'Failed to set capability' });
  }
});

export default router;
