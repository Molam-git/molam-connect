/**
 * Sous-Brique 75bis-1 - Geo-Policy API Routes
 *
 * REST API endpoints for:
 * - Geo-fraud policy rules with Ops approval
 * - Dynamic pricing by zone
 * - A/B experiments with safe rollouts
 * - Policy evaluation and application
 *
 * @module geoPolicyRoutes
 */

import express, { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import * as geoPolicyService from '../services/geoPolicyEngine';

const router = express.Router();

// ============================================================================
// MIDDLEWARE
// ============================================================================

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenant_type: string;
    tenant_id: string;
    role: string;
  };
  ip_address?: string;
  user_agent?: string;
}

function authenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  // TODO: Integrate with Molam ID JWT verification
  req.user = {
    id: 'user-123',
    tenant_type: 'merchant',
    tenant_id: req.params.merchantId || 'merchant-123',
    role: req.headers['x-user-role'] as string || 'merchant_admin',
  };

  req.ip_address = req.ip;
  req.user_agent = req.headers['user-agent'];

  next();
}

function requireRole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `This action requires one of these roles: ${roles.join(', ')}`,
      });
    }
    next();
  };
}

function handleValidationErrors(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

// ============================================================================
// GEO POLICY RULES ROUTES
// ============================================================================

/**
 * GET /ops/geo-policies
 * Get all policy rules (Ops view)
 */
router.get(
  '/ops/geo-policies',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  query('status').optional().isIn(['pending', 'active', 'paused', 'archived', 'rejected']),
  query('merchant_id').optional().isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const merchantId = req.query.merchant_id as string | undefined;
      const status = req.query.status as string | undefined;

      const rules = await geoPolicyService.getPolicyRules(merchantId, status);

      res.json({
        success: true,
        rules,
        count: rules.length,
      });
    } catch (error: any) {
      console.error('Error fetching policy rules:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch policy rules',
      });
    }
  }
);

/**
 * POST /ops/geo-policies
 * Create new policy rule (Ops only)
 */
router.post(
  '/ops/geo-policies',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  body('scope').isIn(['merchant', 'global']),
  body('scope_id').optional().isUUID(),
  body('rule_type').isIn(['block', 'throttle', 'suspend_payout', 'require_kyc', 'dynamic_fee', 'alert_only', 'require_3ds']),
  body('target_zone').isObject(),
  body('params').optional().isObject(),
  body('priority').optional().isInt({ min: 0, max: 1000 }),
  body('effective_from').optional().isISO8601(),
  body('effective_until').optional().isISO8601(),
  body('description').optional().isString(),
  body('tags').optional().isArray(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rule = await geoPolicyService.createGeoPolicyRule({
        ...req.body,
        created_by: req.user!.id,
      });

      res.status(201).json({
        success: true,
        rule,
        message: 'Policy rule created. Awaiting approval.',
      });
    } catch (error: any) {
      console.error('Error creating policy rule:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create policy rule',
      });
    }
  }
);

/**
 * POST /ops/geo-policies/:ruleId/approve
 * Approve pending rule (Ops admin only)
 */
router.post(
  '/ops/geo-policies/:ruleId/approve',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  param('ruleId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ruleId } = req.params;

      const rule = await geoPolicyService.approveGeoPolicyRule(ruleId, req.user!.id);

      res.json({
        success: true,
        rule,
        message: 'Policy rule approved and activated',
      });
    } catch (error: any) {
      console.error('Error approving policy rule:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to approve policy rule',
      });
    }
  }
);

/**
 * POST /ops/geo-policies/:ruleId/reject
 * Reject pending rule (Ops admin only)
 */
router.post(
  '/ops/geo-policies/:ruleId/reject',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  param('ruleId').isUUID(),
  body('reason').isString().isLength({ min: 10 }),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ruleId } = req.params;
      const { reason } = req.body;

      const rule = await geoPolicyService.rejectGeoPolicyRule(ruleId, req.user!.id, reason);

      res.json({
        success: true,
        rule,
        message: 'Policy rule rejected',
      });
    } catch (error: any) {
      console.error('Error rejecting policy rule:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to reject policy rule',
      });
    }
  }
);

/**
 * POST /ops/geo-policies/:ruleId/toggle
 * Pause/Resume active rule
 */
router.post(
  '/ops/geo-policies/:ruleId/toggle',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  param('ruleId').isUUID(),
  body('pause').isBoolean(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ruleId } = req.params;
      const { pause } = req.body;

      const rule = await geoPolicyService.toggleGeoPolicyRule(ruleId, pause);

      res.json({
        success: true,
        rule,
        message: pause ? 'Rule paused' : 'Rule resumed',
      });
    } catch (error: any) {
      console.error('Error toggling policy rule:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to toggle policy rule',
      });
    }
  }
);

/**
 * GET /connect/:merchantId/policies
 * Get policy rules for merchant (merchant view)
 */
router.get(
  '/connect/:merchantId/policies',
  authenticateUser,
  param('merchantId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;

      const rules = await geoPolicyService.getPolicyRules(merchantId, 'active');

      res.json({
        success: true,
        rules,
      });
    } catch (error: any) {
      console.error('Error fetching merchant policies:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch policies',
      });
    }
  }
);

// ============================================================================
// ZONE PRICING ROUTES
// ============================================================================

/**
 * GET /connect/:merchantId/zone-pricing
 * Get zone pricing overrides
 */
router.get(
  '/connect/:merchantId/zone-pricing',
  authenticateUser,
  param('merchantId').isUUID(),
  query('active').optional().isBoolean(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;

      const overrides = await geoPolicyService.getZonePricingOverrides(merchantId, active);

      res.json({
        success: true,
        overrides,
      });
    } catch (error: any) {
      console.error('Error fetching zone pricing:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch zone pricing',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/zone-pricing
 * Create zone pricing override
 */
router.post(
  '/connect/:merchantId/zone-pricing',
  authenticateUser,
  param('merchantId').isUUID(),
  body('zone').isObject(),
  body('method').isIn(['wallet', 'card', 'mobile_money', 'bank_transfer', 'ussd', 'qr_code']),
  body('provider').optional().isString(),
  body('fee_percent').isNumeric(),
  body('fee_fixed').isNumeric(),
  body('fee_cap').optional().isNumeric(),
  body('is_discount').optional().isBoolean(),
  body('discount_reason').optional().isString(),
  body('effective_from').optional().isISO8601(),
  body('effective_until').optional().isISO8601(),
  body('description').optional().isString(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;

      const override = await geoPolicyService.createZonePricingOverride({
        merchant_id: merchantId,
        ...req.body,
        created_by: req.user!.id,
      });

      res.status(201).json({
        success: true,
        override,
        message: 'Zone pricing override created',
      });
    } catch (error: any) {
      console.error('Error creating zone pricing:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create zone pricing',
      });
    }
  }
);

/**
 * GET /connect/:merchantId/pricing-calc
 * Calculate applicable pricing for a transaction
 */
router.get(
  '/connect/:merchantId/pricing-calc',
  authenticateUser,
  param('merchantId').isUUID(),
  query('country').isString().isLength({ min: 2, max: 2 }),
  query('city').optional().isString(),
  query('method').isIn(['wallet', 'card', 'mobile_money', 'bank_transfer', 'ussd', 'qr_code']),
  query('provider').optional().isString(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const { country, city, method, provider } = req.query;

      const pricing = await geoPolicyService.getApplicablePricing(
        merchantId,
        country as string,
        city as string || '',
        method as string,
        provider as string
      );

      res.json({
        success: true,
        pricing: pricing || { fee_percent: 0, fee_fixed: 0 },
        has_override: !!pricing,
      });
    } catch (error: any) {
      console.error('Error calculating pricing:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to calculate pricing',
      });
    }
  }
);

// ============================================================================
// A/B EXPERIMENTS ROUTES
// ============================================================================

/**
 * GET /ops/experiments
 * Get all experiments (Ops view)
 */
router.get(
  '/ops/experiments',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  query('merchant_id').optional().isUUID(),
  query('status').optional().isString(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const merchantId = req.query.merchant_id as string;
      const status = req.query.status as string | undefined;

      const experiments = await geoPolicyService.getExperiments(merchantId, status);

      res.json({
        success: true,
        experiments,
      });
    } catch (error: any) {
      console.error('Error fetching experiments:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch experiments',
      });
    }
  }
);

/**
 * POST /ops/experiments
 * Create new experiment (Ops)
 */
router.post(
  '/ops/experiments',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  body('merchant_id').isUUID(),
  body('name').isString().isLength({ min: 3, max: 255 }),
  body('description').optional().isString(),
  body('hypothesis').optional().isString(),
  body('variant_a').isObject(),
  body('variant_b').isObject(),
  body('percent_b').isInt({ min: 0, max: 100 }),
  body('target_zones').optional().isArray(),
  body('metrics_targets').optional().isObject(),
  body('auto_rollback_enabled').optional().isBoolean(),
  body('rollback_conditions').optional().isObject(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const experiment = await geoPolicyService.createExperiment({
        ...req.body,
        created_by: req.user!.id,
      });

      res.status(201).json({
        success: true,
        experiment,
        message: 'Experiment created',
      });
    } catch (error: any) {
      console.error('Error creating experiment:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create experiment',
      });
    }
  }
);

/**
 * POST /ops/experiments/:experimentId/approve
 * Approve experiment
 */
router.post(
  '/ops/experiments/:experimentId/approve',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  param('experimentId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { experimentId } = req.params;

      const experiment = await geoPolicyService.approveExperiment(experimentId, req.user!.id);

      res.json({
        success: true,
        experiment,
        message: 'Experiment approved',
      });
    } catch (error: any) {
      console.error('Error approving experiment:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to approve experiment',
      });
    }
  }
);

/**
 * POST /ops/experiments/:experimentId/start
 * Start approved experiment
 */
router.post(
  '/ops/experiments/:experimentId/start',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  param('experimentId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { experimentId } = req.params;

      const experiment = await geoPolicyService.startExperiment(experimentId);

      res.json({
        success: true,
        experiment,
        message: 'Experiment started',
      });
    } catch (error: any) {
      console.error('Error starting experiment:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to start experiment',
      });
    }
  }
);

/**
 * POST /ops/experiments/:experimentId/stop
 * Stop running experiment
 */
router.post(
  '/ops/experiments/:experimentId/stop',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  param('experimentId').isUUID(),
  body('reason').optional().isString(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { experimentId } = req.params;
      const { reason } = req.body;

      const experiment = await geoPolicyService.stopExperiment(experimentId, reason);

      res.json({
        success: true,
        experiment,
        message: 'Experiment stopped',
      });
    } catch (error: any) {
      console.error('Error stopping experiment:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to stop experiment',
      });
    }
  }
);

/**
 * GET /ops/experiments/:experimentId/metrics
 * Get experiment metrics
 */
router.get(
  '/ops/experiments/:experimentId/metrics',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin', 'merchant_admin']),
  param('experimentId').isUUID(),
  query('days').optional().isInt({ min: 1, max: 90 }),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { experimentId } = req.params;
      const days = parseInt(req.query.days as string) || 7;

      const metrics = await geoPolicyService.getExperimentMetrics(experimentId, days);

      res.json({
        success: true,
        metrics,
      });
    } catch (error: any) {
      console.error('Error fetching experiment metrics:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch experiment metrics',
      });
    }
  }
);

/**
 * POST /ops/experiments/:experimentId/check-rollback
 * Manually check rollback conditions
 */
router.post(
  '/ops/experiments/:experimentId/check-rollback',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  param('experimentId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { experimentId } = req.params;

      const shouldRollback = await geoPolicyService.checkExperimentRollback(experimentId);

      res.json({
        success: true,
        should_rollback: shouldRollback,
        message: shouldRollback ? 'Experiment rolled back due to KPI breach' : 'Experiment is healthy',
      });
    } catch (error: any) {
      console.error('Error checking rollback:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to check rollback',
      });
    }
  }
);

// ============================================================================
// POLICY EVALUATION
// ============================================================================

/**
 * POST /connect/:merchantId/evaluate
 * Evaluate policies for a transaction (used by payment processor)
 */
router.post(
  '/connect/:merchantId/evaluate',
  authenticateUser,
  param('merchantId').isUUID(),
  body('country').isString().isLength({ min: 2, max: 2 }),
  body('city').optional().isString(),
  body('amount').optional().isNumeric(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const { country, city, amount } = req.body;

      const evaluation = await geoPolicyService.evaluateTransaction(
        merchantId,
        country,
        city,
        amount
      );

      res.json({
        success: true,
        evaluation,
      });
    } catch (error: any) {
      console.error('Error evaluating transaction:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to evaluate transaction',
      });
    }
  }
);

// ============================================================================
// HEALTH CHECK
// ============================================================================

router.get('/geo-policies/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'geo-policies',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// EXPORTS
// ============================================================================

export default router;
