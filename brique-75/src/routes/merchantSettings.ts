/**
 * Brique 75 - Merchant Settings API Routes
 *
 * REST API endpoints for merchant configuration:
 * - General settings (currency, language, timezone)
 * - Branding (logo, colors, fonts, themes)
 * - Payment methods (enable/disable, limits, fees)
 * - Sales zones (countries, regions, taxes)
 * - Refund policies
 * - Subscription configuration
 * - Commission override workflow
 * - Settings history and audit
 *
 * @module merchantSettingsRoutes
 */

import express, { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import * as merchantSettingsService from '../services/merchantSettings';

const router = express.Router();

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Authenticated request interface
 */
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

/**
 * Authentication middleware (placeholder - integrate with Molam ID)
 */
function authenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // TODO: Integrate with Molam ID JWT verification
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  // Mock user for now
  req.user = {
    id: 'user-123',
    tenant_type: 'merchant',
    tenant_id: req.params.merchantId,
    role: 'merchant_admin',
  };

  req.ip_address = req.ip;
  req.user_agent = req.headers['user-agent'];

  next();
}

/**
 * Ops admin role check
 */
function requireOpsRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'ops_admin') {
    return res.status(403).json({
      success: false,
      error: 'This action requires Ops admin role',
    });
  }
  next();
}

/**
 * Validation error handler
 */
function handleValidationErrors(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

// ============================================================================
// GENERAL SETTINGS ROUTES
// ============================================================================

/**
 * GET /connect/:merchantId/settings
 * Get complete merchant settings
 */
router.get(
  '/connect/:merchantId/settings',
  authenticateUser,
  param('merchantId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;

      const settings = await merchantSettingsService.getMerchantSettings(merchantId);

      res.json({
        success: true,
        settings,
      });
    } catch (error: any) {
      console.error('Error fetching merchant settings:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch merchant settings',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/settings
 * Update merchant settings
 */
router.post(
  '/connect/:merchantId/settings',
  authenticateUser,
  param('merchantId').isUUID(),
  body('default_currency').optional().isString().isLength({ min: 3, max: 3 }),
  body('default_language').optional().isString().isLength({ min: 2, max: 5 }),
  body('supported_currencies').optional().isArray(),
  body('supported_languages').optional().isArray(),
  body('timezone').optional().isString(),
  body('active_payment_methods').optional().isArray(),
  body('payment_method_priority').optional().isArray(),
  body('checkout_config').optional().isObject(),
  body('features').optional().isObject(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const updates = req.body;

      const updatedSettings = await merchantSettingsService.updateMerchantSettings(
        merchantId,
        updates,
        req.user!.id,
        req.ip_address,
        req.user_agent
      );

      res.json({
        success: true,
        settings: updatedSettings,
      });
    } catch (error: any) {
      console.error('Error updating merchant settings:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update merchant settings',
      });
    }
  }
);

/**
 * GET /connect/:merchantId/settings/history
 * Get settings version history
 */
router.get(
  '/connect/:merchantId/settings/history',
  authenticateUser,
  param('merchantId').isUUID(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const { history, total } = await merchantSettingsService.getMerchantSettingsHistory(
        merchantId,
        limit,
        offset
      );

      res.json({
        success: true,
        history,
        total,
        limit,
        offset,
      });
    } catch (error: any) {
      console.error('Error fetching settings history:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch settings history',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/settings/rollback
 * Rollback to previous version
 */
router.post(
  '/connect/:merchantId/settings/rollback',
  authenticateUser,
  param('merchantId').isUUID(),
  body('target_version').isInt({ min: 1 }),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const { target_version } = req.body;

      const rolledBackSettings = await merchantSettingsService.rollbackMerchantSettings(
        merchantId,
        target_version,
        req.user!.id,
        req.ip_address
      );

      res.json({
        success: true,
        settings: rolledBackSettings,
        message: `Settings rolled back to version ${target_version}`,
      });
    } catch (error: any) {
      console.error('Error rolling back settings:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to rollback settings',
      });
    }
  }
);

// ============================================================================
// BRANDING ROUTES
// ============================================================================

/**
 * GET /connect/:merchantId/branding
 * Get merchant branding (included in general settings, but available separately)
 */
router.get(
  '/connect/:merchantId/branding',
  authenticateUser,
  param('merchantId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const { branding } = await merchantSettingsService.getMerchantSettings(merchantId);

      res.json({
        success: true,
        branding,
      });
    } catch (error: any) {
      console.error('Error fetching branding:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch branding',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/branding
 * Update merchant branding
 */
router.post(
  '/connect/:merchantId/branding',
  authenticateUser,
  param('merchantId').isUUID(),
  body('business_name').optional().isString().isLength({ min: 1, max: 255 }),
  body('logo_url').optional().isURL(),
  body('logo_square_url').optional().isURL(),
  body('favicon_url').optional().isURL(),
  body('cover_image_url').optional().isURL(),
  body('primary_color').optional().matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  body('secondary_color').optional().matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  body('accent_color').optional().matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  body('background_color').optional().matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  body('text_color').optional().matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  body('font_family').optional().isString(),
  body('button_style').optional().isIn(['square', 'rounded', 'pill']),
  body('checkout_theme').optional().isIn(['light', 'dark', 'auto']),
  body('checkout_layout').optional().isIn(['embedded', 'redirect', 'popup']),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const updates = req.body;

      const branding = await merchantSettingsService.updateMerchantBranding(
        merchantId,
        updates,
        req.user!.id,
        req.ip_address
      );

      res.json({
        success: true,
        branding,
      });
    } catch (error: any) {
      console.error('Error updating branding:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update branding',
      });
    }
  }
);

/**
 * GET /connect/:merchantId/branding/preview-css
 * Generate preview CSS for branding
 */
router.get(
  '/connect/:merchantId/branding/preview-css',
  authenticateUser,
  param('merchantId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const { branding } = await merchantSettingsService.getMerchantSettings(merchantId);

      if (!branding) {
        return res.status(404).json({
          success: false,
          error: 'Branding not configured',
        });
      }

      const css = merchantSettingsService.generateBrandingCSS(branding);

      res.setHeader('Content-Type', 'text/css');
      res.send(css);
    } catch (error: any) {
      console.error('Error generating branding CSS:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate branding CSS',
      });
    }
  }
);

// ============================================================================
// PAYMENT METHODS ROUTES
// ============================================================================

/**
 * GET /connect/:merchantId/payment-methods
 * Get all payment methods
 */
router.get(
  '/connect/:merchantId/payment-methods',
  authenticateUser,
  param('merchantId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const paymentMethods = await merchantSettingsService.getPaymentMethods(merchantId);

      res.json({
        success: true,
        payment_methods: paymentMethods,
      });
    } catch (error: any) {
      console.error('Error fetching payment methods:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch payment methods',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/payment-methods/:methodType
 * Update payment method configuration
 */
router.post(
  '/connect/:merchantId/payment-methods/:methodType',
  authenticateUser,
  param('merchantId').isUUID(),
  param('methodType').isString(),
  body('provider').optional().isString(),
  body('is_enabled').optional().isBoolean(),
  body('display_name').optional().isString(),
  body('display_order').optional().isInt({ min: 0 }),
  body('min_amount').optional().isNumeric(),
  body('max_amount').optional().isNumeric(),
  body('daily_limit').optional().isNumeric(),
  body('monthly_limit').optional().isNumeric(),
  body('fee_type').optional().isIn(['percentage', 'fixed', 'hybrid']),
  body('fee_percentage').optional().isNumeric(),
  body('fee_fixed').optional().isNumeric(),
  body('supported_currencies').optional().isArray(),
  body('allowed_countries').optional().isArray(),
  body('metadata').optional().isObject(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId, methodType } = req.params;
      const { provider, ...updates } = req.body;

      const paymentMethod = await merchantSettingsService.updatePaymentMethod(
        merchantId,
        methodType,
        provider || null,
        updates,
        req.user!.id,
        req.ip_address
      );

      res.json({
        success: true,
        payment_method: paymentMethod,
      });
    } catch (error: any) {
      console.error('Error updating payment method:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update payment method',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/payment-methods/:methodType/toggle
 * Toggle payment method on/off
 */
router.post(
  '/connect/:merchantId/payment-methods/:methodType/toggle',
  authenticateUser,
  param('merchantId').isUUID(),
  param('methodType').isString(),
  body('provider').optional().isString(),
  body('enabled').isBoolean(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId, methodType } = req.params;
      const { provider, enabled } = req.body;

      const paymentMethod = await merchantSettingsService.togglePaymentMethod(
        merchantId,
        methodType,
        provider || null,
        enabled,
        req.user!.id,
        req.ip_address
      );

      res.json({
        success: true,
        payment_method: paymentMethod,
        message: `Payment method ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error: any) {
      console.error('Error toggling payment method:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to toggle payment method',
      });
    }
  }
);

// ============================================================================
// COMMISSION OVERRIDE ROUTES
// ============================================================================

/**
 * GET /connect/:merchantId/commission
 * Get active commission rate
 */
router.get(
  '/connect/:merchantId/commission',
  authenticateUser,
  param('merchantId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const rate = await merchantSettingsService.getActiveCommissionRate(merchantId);

      res.json({
        success: true,
        commission_rate: rate,
      });
    } catch (error: any) {
      console.error('Error fetching commission rate:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch commission rate',
      });
    }
  }
);

/**
 * GET /connect/:merchantId/commission/history
 * Get commission override history
 */
router.get(
  '/connect/:merchantId/commission/history',
  authenticateUser,
  param('merchantId').isUUID(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;

      const history = await merchantSettingsService.getCommissionOverrideHistory(merchantId, limit);

      res.json({
        success: true,
        overrides: history,
      });
    } catch (error: any) {
      console.error('Error fetching commission history:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch commission history',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/commission/request-override
 * Request commission override
 */
router.post(
  '/connect/:merchantId/commission/request-override',
  authenticateUser,
  param('merchantId').isUUID(),
  body('commission_rate').isFloat({ min: 0, max: 100 }),
  body('reason').isString().isLength({ min: 10, max: 500 }),
  body('justification').isString().isLength({ min: 20 }),
  body('effective_from').optional().isISO8601(),
  body('effective_until').optional().isISO8601(),
  body('conditions').optional().isObject(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const {
        commission_rate,
        reason,
        justification,
        effective_from,
        effective_until,
        conditions,
      } = req.body;

      const override = await merchantSettingsService.requestCommissionOverride(
        merchantId,
        commission_rate,
        reason,
        justification,
        req.user!.id,
        effective_from ? new Date(effective_from) : undefined,
        effective_until ? new Date(effective_until) : undefined,
        conditions,
        req.ip_address
      );

      res.status(201).json({
        success: true,
        override,
        message: 'Commission override request submitted for approval',
      });
    } catch (error: any) {
      console.error('Error requesting commission override:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to request commission override',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/commission/override/:overrideId/approve
 * Approve commission override (Ops admin only)
 */
router.post(
  '/connect/:merchantId/commission/override/:overrideId/approve',
  authenticateUser,
  requireOpsRole,
  param('merchantId').isUUID(),
  param('overrideId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { overrideId } = req.params;

      const override = await merchantSettingsService.approveCommissionOverride(
        overrideId,
        req.user!.id,
        req.ip_address
      );

      res.json({
        success: true,
        override,
        message: 'Commission override approved',
      });
    } catch (error: any) {
      console.error('Error approving commission override:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to approve commission override',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/commission/override/:overrideId/reject
 * Reject commission override (Ops admin only)
 */
router.post(
  '/connect/:merchantId/commission/override/:overrideId/reject',
  authenticateUser,
  requireOpsRole,
  param('merchantId').isUUID(),
  param('overrideId').isUUID(),
  body('rejection_reason').isString().isLength({ min: 10 }),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { overrideId } = req.params;
      const { rejection_reason } = req.body;

      const override = await merchantSettingsService.rejectCommissionOverride(
        overrideId,
        req.user!.id,
        rejection_reason,
        req.ip_address
      );

      res.json({
        success: true,
        override,
        message: 'Commission override rejected',
      });
    } catch (error: any) {
      console.error('Error rejecting commission override:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to reject commission override',
      });
    }
  }
);

// ============================================================================
// AUDIT ROUTES
// ============================================================================

/**
 * GET /connect/:merchantId/audit
 * Get audit log
 */
router.get(
  '/connect/:merchantId/audit',
  authenticateUser,
  param('merchantId').isUUID(),
  query('action').optional().isString(),
  query('actor_id').optional().isUUID(),
  query('from_date').optional().isISO8601(),
  query('to_date').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;

      const filters = {
        action: req.query.action as string | undefined,
        actor_id: req.query.actor_id as string | undefined,
        from_date: req.query.from_date ? new Date(req.query.from_date as string) : undefined,
        to_date: req.query.to_date ? new Date(req.query.to_date as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };

      const { entries, total } = await merchantSettingsService.getAuditLog(merchantId, filters);

      res.json({
        success: true,
        audit_entries: entries,
        total,
        limit: filters.limit,
        offset: filters.offset,
      });
    } catch (error: any) {
      console.error('Error fetching audit log:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch audit log',
      });
    }
  }
);

/**
 * GET /connect/:merchantId/audit/verify
 * Verify audit trail integrity
 */
router.get(
  '/connect/:merchantId/audit/verify',
  authenticateUser,
  param('merchantId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;

      const verification = await merchantSettingsService.verifyAuditIntegrity(merchantId);

      res.json({
        success: true,
        verification,
      });
    } catch (error: any) {
      console.error('Error verifying audit integrity:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to verify audit integrity',
      });
    }
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default router;
