// =====================================================
// Brique 74bis - Banking Network Simulator Routes
// =====================================================
// Purpose: API endpoints for advanced payment simulation
// Version: 1.0.0
// =====================================================

import express, { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import * as bankingSimulator from '../services/bankingSimulator';

const router = express.Router();

// =====================================================
// MIDDLEWARE
// =====================================================

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenant_type: string;
    tenant_id: string;
    roles: string[];
  };
}

const authenticateUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.header('X-User-Id');
    const tenantType = req.header('X-Tenant-Type') || 'merchant';
    const tenantId = req.header('X-Tenant-Id');

    if (!userId || !tenantId) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          code: 'unauthorized',
          message: 'Authentication required',
        },
      });
    }

    req.user = {
      id: userId,
      tenant_type: tenantType,
      tenant_id: tenantId,
      roles: ['dev_admin'],
    };

    next();
  } catch (error) {
    res.status(401).json({
      error: {
        type: 'authentication_error',
        code: 'invalid_token',
        message: 'Invalid authentication token',
      },
    });
  }
};

const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        type: 'validation_error',
        code: 'invalid_request',
        message: 'Validation failed',
        details: errors.array(),
      },
    });
  }
  next();
};

// =====================================================
// 1. SCENARIO MANAGEMENT ROUTES
// =====================================================

/**
 * GET /dev/simulator/scenarios
 * List available simulation scenarios
 */
router.get(
  '/dev/simulator/scenarios',
  [
    query('category').optional().isString(),
    query('network').optional().isString(),
    query('is_preset').optional().isBoolean(),
    query('tags').optional().isString(), // Comma-separated
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;

      const scenarios = await bankingSimulator.listScenarios({
        category: req.query.category as string | undefined,
        network: req.query.network as string | undefined,
        is_preset: req.query.is_preset === 'true' ? true : undefined,
        tags,
      });

      res.json({
        success: true,
        count: scenarios.length,
        scenarios,
      });
    } catch (error: any) {
      console.error('[BankingSimulator] Failed to list scenarios:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'list_failed',
          message: error.message || 'Failed to list scenarios',
        },
      });
    }
  }
);

/**
 * GET /dev/simulator/scenarios/:scenarioId
 * Get scenario details
 */
router.get(
  '/dev/simulator/scenarios/:scenarioId',
  [param('scenarioId').isUUID()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { scenarioId } = req.params;
      const scenario = await bankingSimulator.getScenario(scenarioId);

      if (!scenario) {
        return res.status(404).json({
          error: {
            type: 'not_found',
            code: 'scenario_not_found',
            message: 'Scenario not found',
          },
        });
      }

      res.json({
        success: true,
        scenario,
      });
    } catch (error: any) {
      console.error('[BankingSimulator] Failed to get scenario:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'retrieval_failed',
          message: error.message || 'Failed to get scenario',
        },
      });
    }
  }
);

/**
 * POST /dev/simulator/scenarios
 * Create custom scenario
 */
router.post(
  '/dev/simulator/scenarios',
  authenticateUser,
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('category').isIn(['payment','refund','dispute','payout','authorization','3ds','webhook']),
    body('network').isIn(['visa','mastercard','amex','discover','mobile_money','bank_ach','sepa','swift']),
    body('parameters').isObject(),
    body('expected_outcome').notEmpty(),
    body('response_delay_ms').optional().isInt({ min: 0, max: 30000 }),
    body('failure_rate').optional().isFloat({ min: 0, max: 1 }),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const scenario = await bankingSimulator.createScenario({
        user_id: req.user!.id,
        name: req.body.name,
        description: req.body.description,
        category: req.body.category,
        network: req.body.network,
        provider: req.body.provider,
        parameters: req.body.parameters,
        expected_outcome: req.body.expected_outcome,
        response_delay_ms: req.body.response_delay_ms,
        failure_rate: req.body.failure_rate,
        requires_3ds: req.body.requires_3ds,
        requires_otp: req.body.requires_otp,
        tags: req.body.tags,
      });

      res.status(201).json({
        success: true,
        scenario,
      });
    } catch (error: any) {
      console.error('[BankingSimulator] Failed to create scenario:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'creation_failed',
          message: error.message || 'Failed to create scenario',
        },
      });
    }
  }
);

// =====================================================
// 2. SIMULATION EXECUTION ROUTES
// =====================================================

/**
 * POST /dev/simulator/simulate
 * Execute a payment simulation
 */
router.post(
  '/dev/simulator/simulate',
  authenticateUser,
  [
    body('scenario_id').isUUID().withMessage('Valid scenario_id is required'),
    body('amount').isInt({ min: 1 }).withMessage('Amount must be positive integer'),
    body('currency').isLength({ min: 3, max: 3 }).withMessage('Currency must be 3-letter ISO code'),
    body('session_id').optional().isUUID(),
    body('card').optional().isObject(),
    body('mobile_money').optional().isObject(),
    body('bank_account').optional().isObject(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await bankingSimulator.executeSimulation({
        scenario_id: req.body.scenario_id,
        session_id: req.body.session_id,
        user_id: req.user!.id,
        tenant_type: req.user!.tenant_type,
        tenant_id: req.user!.tenant_id,
        amount: req.body.amount,
        currency: req.body.currency,
        card: req.body.card,
        mobile_money: req.body.mobile_money,
        bank_account: req.body.bank_account,
        metadata: req.body.metadata,
      });

      res.json({
        success: true,
        simulation: result,
      });
    } catch (error: any) {
      console.error('[BankingSimulator] Simulation execution failed:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'simulation_failed',
          message: error.message || 'Simulation execution failed',
        },
      });
    }
  }
);

/**
 * POST /dev/simulator/simulate/quick
 * Quick simulation with preset (no scenario_id needed)
 */
router.post(
  '/dev/simulator/simulate/quick',
  authenticateUser,
  [
    body('network').isIn(['visa','mastercard','mobile_money','bank_ach']),
    body('outcome').isIn(['success','failure','3ds_required','otp_required']),
    body('amount').isInt({ min: 1 }),
    body('currency').isLength({ min: 3, max: 3 }),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Find matching preset scenario
      const scenarios = await bankingSimulator.listScenarios({
        network: req.body.network,
        is_preset: true,
      });

      const scenario = scenarios.find((s) => {
        if (req.body.outcome === 'success' && s.expected_outcome === 'success') return true;
        if (req.body.outcome === 'failure' && s.expected_outcome !== 'success' && !s.requires_3ds && !s.requires_otp) return true;
        if (req.body.outcome === '3ds_required' && s.requires_3ds) return true;
        if (req.body.outcome === 'otp_required' && s.requires_otp) return true;
        return false;
      });

      if (!scenario) {
        return res.status(404).json({
          error: {
            type: 'not_found',
            code: 'no_matching_scenario',
            message: `No preset scenario found for ${req.body.network} with outcome ${req.body.outcome}`,
          },
        });
      }

      const result = await bankingSimulator.executeSimulation({
        scenario_id: scenario.id,
        user_id: req.user!.id,
        tenant_type: req.user!.tenant_type,
        tenant_id: req.user!.tenant_id,
        amount: req.body.amount,
        currency: req.body.currency,
        metadata: req.body.metadata,
      });

      res.json({
        success: true,
        simulation: result,
        scenario_used: {
          id: scenario.id,
          name: scenario.name,
        },
      });
    } catch (error: any) {
      console.error('[BankingSimulator] Quick simulation failed:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'simulation_failed',
          message: error.message || 'Quick simulation failed',
        },
      });
    }
  }
);

// =====================================================
// 3. 3DS AUTHENTICATION ROUTES
// =====================================================

/**
 * POST /dev/simulator/3ds/:threeDSId/complete
 * Complete 3DS authentication (simulate user completing challenge)
 */
router.post(
  '/dev/simulator/3ds/:threeDSId/complete',
  [
    param('threeDSId').isUUID(),
    body('authentication_result').isIn(['authenticated','not_authenticated','error']),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { threeDSId } = req.params;
      const { authentication_result } = req.body;

      // TODO: Update 3DS authentication status
      // This would be used to complete the 3DS flow in a real scenario

      res.json({
        success: true,
        message: '3DS authentication completed',
        three_ds_id: threeDSId,
        authentication_result,
      });
    } catch (error: any) {
      console.error('[BankingSimulator] 3DS completion failed:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: '3ds_failed',
          message: error.message || '3DS completion failed',
        },
      });
    }
  }
);

// =====================================================
// 4. OTP VERIFICATION ROUTES
// =====================================================

/**
 * POST /dev/simulator/otp/:otpId/verify
 * Verify OTP code
 */
router.post(
  '/dev/simulator/otp/:otpId/verify',
  [
    param('otpId').isUUID(),
    body('otp_code').isLength({ min: 6, max: 6 }).withMessage('OTP code must be 6 digits'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { otpId } = req.params;
      const { otp_code } = req.body;

      const result = await bankingSimulator.verifyOTP(otpId, otp_code);

      if (result.verified) {
        res.json({
          success: true,
          verified: true,
          message: result.message,
        });
      } else {
        res.status(400).json({
          success: false,
          verified: false,
          error: {
            type: 'verification_error',
            code: 'otp_verification_failed',
            message: result.message,
          },
        });
      }
    } catch (error: any) {
      console.error('[BankingSimulator] OTP verification failed:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'verification_failed',
          message: error.message || 'OTP verification failed',
        },
      });
    }
  }
);

/**
 * POST /dev/simulator/otp/:otpId/resend
 * Resend OTP code
 */
router.post(
  '/dev/simulator/otp/:otpId/resend',
  [param('otpId').isUUID()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { otpId } = req.params;

      // TODO: Implement OTP resend logic
      // For now, return success

      res.json({
        success: true,
        message: 'OTP resent successfully',
        otp_id: otpId,
      });
    } catch (error: any) {
      console.error('[BankingSimulator] OTP resend failed:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'resend_failed',
          message: error.message || 'OTP resend failed',
        },
      });
    }
  }
);

// =====================================================
// 5. WEBHOOK SIMULATION ROUTES
// =====================================================

/**
 * POST /dev/simulator/webhooks/:eventId/replay
 * Replay a webhook event
 */
router.post(
  '/dev/simulator/webhooks/:eventId/replay',
  authenticateUser,
  [
    param('eventId').isUUID(),
    body('target_url').isURL().withMessage('Valid target URL is required'),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { eventId } = req.params;
      const { target_url } = req.body;

      await bankingSimulator.replayWebhook(eventId, target_url);

      res.json({
        success: true,
        message: 'Webhook replayed successfully',
        event_id: eventId,
        target_url,
      });
    } catch (error: any) {
      console.error('[BankingSimulator] Webhook replay failed:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'replay_failed',
          message: error.message || 'Webhook replay failed',
        },
      });
    }
  }
);

// =====================================================
// 6. ANALYTICS & REPORTING ROUTES
// =====================================================

/**
 * GET /dev/simulator/stats
 * Get simulation statistics
 */
router.get(
  '/dev/simulator/stats',
  authenticateUser,
  [
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // TODO: Implement comprehensive stats query
      // For now, return basic stats

      res.json({
        success: true,
        stats: {
          total_simulations: 0,
          success_rate: 0,
          avg_response_time_ms: 0,
          by_network: {},
          by_outcome: {},
        },
      });
    } catch (error: any) {
      console.error('[BankingSimulator] Failed to get stats:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'stats_failed',
          message: error.message || 'Failed to get stats',
        },
      });
    }
  }
);

// =====================================================
// 7. PRELOAD UTILITIES
// =====================================================

/**
 * POST /dev/simulator/preload
 * Preload preset scenarios (admin only)
 */
router.post(
  '/dev/simulator/preload',
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Scenarios are already preloaded in SQL migration
      // This endpoint can be used to reload/refresh if needed

      res.json({
        success: true,
        message: 'Preset scenarios are preloaded via database migration',
      });
    } catch (error: any) {
      console.error('[BankingSimulator] Preload failed:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'preload_failed',
          message: error.message || 'Failed to preload scenarios',
        },
      });
    }
  }
);

// =====================================================
// ERROR HANDLER
// =====================================================

router.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[BankingSimulator] Unhandled error:', err);
  res.status(500).json({
    error: {
      type: 'internal_error',
      code: 'unexpected_error',
      message: 'An unexpected error occurred',
    },
  });
});

// =====================================================
// EXPORTS
// =====================================================

export default router;
