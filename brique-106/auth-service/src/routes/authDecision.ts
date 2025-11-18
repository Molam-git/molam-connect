/**
 * Auth Decision Routes
 *
 * API endpoints for authentication method decisions
 */

import { Router } from 'express';
import { z } from 'zod';
import { authDecisionService, AuthMethod } from '../services/authDecision';
import { logger } from '../utils/logger';

const router = Router();

// Request validation schema
const decisionRequestSchema = z.object({
  payment_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  device: z.object({
    ip: z.string().optional(),
    ua: z.string().optional(),
    imei: z.string().nullable().optional(),
    fingerprint: z.string().optional(),
  }),
  bin: z.string().min(6).max(8),
  country: z.string().length(2),
  merchant_id: z.string().uuid().optional(),
});

const outcomeSchema = z.object({
  decision_id: z.string().uuid(),
  successful: z.boolean(),
  duration_ms: z.number(),
  abandonment: z.boolean().optional(),
});

const fallbackSchema = z.object({
  decision_id: z.string().uuid(),
  final_method: z.enum(['3ds2', '3ds1', 'otp_sms', 'otp_voice', 'biometric', 'none'] as const),
  fallback_reason: z.string().optional(),
});

/**
 * POST /v1/auth/decide
 *
 * Make authentication method decision
 */
router.post('/decide', async (req, res) => {
  try {
    // Validate request
    const validated = decisionRequestSchema.parse(req.body);

    // Make decision
    const decision = await authDecisionService.decide(validated);

    res.status(200).json(decision);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    logger.error({ error: error.message }, 'Auth decision error');
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * POST /v1/auth/outcome
 *
 * Record authentication outcome
 */
router.post('/outcome', async (req, res) => {
  try {
    const validated = outcomeSchema.parse(req.body);

    await authDecisionService.recordOutcome(
      validated.decision_id,
      validated.successful,
      validated.duration_ms,
      validated.abandonment || false
    );

    res.status(200).json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    logger.error({ error: error.message }, 'Record outcome error');
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * POST /v1/auth/fallback
 *
 * Update decision with fallback method
 */
router.post('/fallback', async (req, res) => {
  try {
    const validated = fallbackSchema.parse(req.body);

    await authDecisionService.updateFinalMethod(
      validated.decision_id,
      validated.final_method,
      validated.fallback_reason
    );

    res.status(200).json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    logger.error({ error: error.message }, 'Update fallback error');
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

export default router;
