/**
 * Sous-Brique 75bis - Dynamic Sales Zones API Routes
 *
 * REST API endpoints for:
 * - Zone configuration (countries, regions, cities)
 * - Sira AI recommendations
 * - Zone performance analytics
 * - Recommendation application/ignoring
 * - Restriction logs
 *
 * @module dynamicZonesRoutes
 */

import express, { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import * as siraZoneService from '../services/siraZoneAnalysis';

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
    tenant_id: req.params.merchantId,
    role: 'merchant_admin',
  };

  req.ip_address = req.ip;
  req.user_agent = req.headers['user-agent'];

  next();
}

function handleValidationErrors(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

// ============================================================================
// ZONE CONFIGURATION ROUTES
// ============================================================================

/**
 * GET /connect/:merchantId/zones
 * Get merchant sales zones configuration
 */
router.get(
  '/connect/:merchantId/zones',
  authenticateUser,
  param('merchantId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;

      const zones = await siraZoneService.getMerchantZones(merchantId);

      if (!zones) {
        return res.json({
          success: true,
          zones: {
            allowed_countries: [],
            excluded_countries: [],
            allowed_regions: [],
            excluded_regions: [],
            allowed_cities: [],
            excluded_cities: [],
            auto_recommend: true,
          },
        });
      }

      res.json({
        success: true,
        zones,
      });
    } catch (error: any) {
      console.error('Error fetching merchant zones:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch merchant zones',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/zones
 * Update merchant sales zones configuration
 */
router.post(
  '/connect/:merchantId/zones',
  authenticateUser,
  param('merchantId').isUUID(),
  body('allowed_countries').optional().isArray(),
  body('excluded_countries').optional().isArray(),
  body('allowed_regions').optional().isArray(),
  body('excluded_regions').optional().isArray(),
  body('allowed_cities').optional().isArray(),
  body('excluded_cities').optional().isArray(),
  body('auto_recommend').optional().isBoolean(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const updates = req.body;

      const zones = await siraZoneService.updateMerchantZones(
        merchantId,
        updates,
        req.user!.id
      );

      res.json({
        success: true,
        zones,
        message: 'Sales zones updated successfully',
      });
    } catch (error: any) {
      console.error('Error updating merchant zones:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update merchant zones',
      });
    }
  }
);

// ============================================================================
// ZONE PERFORMANCE ROUTES
// ============================================================================

/**
 * GET /connect/:merchantId/zones/performance
 * Get zone performance analytics
 */
router.get(
  '/connect/:merchantId/zones/performance',
  authenticateUser,
  param('merchantId').isUUID(),
  query('zone_identifier').optional().isString(),
  query('days').optional().isInt({ min: 1, max: 365 }),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const zoneIdentifier = req.query.zone_identifier as string | undefined;
      const days = parseInt(req.query.days as string) || 30;

      const performance = await siraZoneService.getZonePerformance(
        merchantId,
        zoneIdentifier,
        days
      );

      res.json({
        success: true,
        performance,
        period_days: days,
      });
    } catch (error: any) {
      console.error('Error fetching zone performance:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch zone performance',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/zones/performance
 * Record zone performance data (usually called by internal services)
 */
router.post(
  '/connect/:merchantId/zones/performance',
  authenticateUser,
  param('merchantId').isUUID(),
  body('zone_type').isIn(['country', 'region', 'city']),
  body('zone_identifier').isString(),
  body('metrics').isObject(),
  body('period_start').isISO8601(),
  body('period_end').isISO8601(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const { zone_type, zone_identifier, metrics, period_start, period_end } = req.body;

      const performance = await siraZoneService.recordZonePerformance(
        merchantId,
        zone_type,
        zone_identifier,
        metrics,
        new Date(period_start),
        new Date(period_end)
      );

      res.json({
        success: true,
        performance,
      });
    } catch (error: any) {
      console.error('Error recording zone performance:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to record zone performance',
      });
    }
  }
);

// ============================================================================
// SIRA RECOMMENDATIONS ROUTES
// ============================================================================

/**
 * GET /connect/:merchantId/zones/recommendations
 * Get Sira recommendations for merchant zones
 */
router.get(
  '/connect/:merchantId/zones/recommendations',
  authenticateUser,
  param('merchantId').isUUID(),
  query('status').optional().isIn(['pending', 'applied', 'ignored', 'expired']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const status = req.query.status as 'pending' | 'applied' | 'ignored' | 'expired' | undefined;
      const limit = parseInt(req.query.limit as string) || 20;

      const recommendations = await siraZoneService.getMerchantRecommendations(
        merchantId,
        status,
        limit
      );

      res.json({
        success: true,
        recommendations,
        count: recommendations.length,
      });
    } catch (error: any) {
      console.error('Error fetching recommendations:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch recommendations',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/zones/analyze
 * Trigger Sira analysis for merchant zones
 */
router.post(
  '/connect/:merchantId/zones/analyze',
  authenticateUser,
  param('merchantId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;

      const result = await siraZoneService.analyzeMerchantZones(merchantId);

      res.json({
        success: true,
        analysis: result,
        message: `Analyzed ${result.analyzed} zones, generated ${result.recommendations_generated} recommendations`,
      });
    } catch (error: any) {
      console.error('Error analyzing zones:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to analyze zones',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/zones/recommendations/:recommendationId/apply
 * Apply a Sira recommendation
 */
router.post(
  '/connect/:merchantId/zones/recommendations/:recommendationId/apply',
  authenticateUser,
  param('merchantId').isUUID(),
  param('recommendationId').isUUID(),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { recommendationId } = req.params;

      const result = await siraZoneService.applyRecommendation(
        recommendationId,
        req.user!.id
      );

      res.json({
        success: true,
        recommendation: result.recommendation,
        changes_applied: result.changes_applied,
        message: 'Recommendation applied successfully',
      });
    } catch (error: any) {
      console.error('Error applying recommendation:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to apply recommendation',
      });
    }
  }
);

/**
 * POST /connect/:merchantId/zones/recommendations/:recommendationId/ignore
 * Ignore a Sira recommendation
 */
router.post(
  '/connect/:merchantId/zones/recommendations/:recommendationId/ignore',
  authenticateUser,
  param('merchantId').isUUID(),
  param('recommendationId').isUUID(),
  body('reason').isString().isLength({ min: 10, max: 500 }),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { recommendationId } = req.params;
      const { reason } = req.body;

      const recommendation = await siraZoneService.ignoreRecommendation(
        recommendationId,
        req.user!.id,
        reason
      );

      res.json({
        success: true,
        recommendation,
        message: 'Recommendation ignored',
      });
    } catch (error: any) {
      console.error('Error ignoring recommendation:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to ignore recommendation',
      });
    }
  }
);

// ============================================================================
// RESTRICTION LOGS ROUTES
// ============================================================================

/**
 * GET /connect/:merchantId/zones/logs
 * Get zone restriction logs
 */
router.get(
  '/connect/:merchantId/zones/logs',
  authenticateUser,
  param('merchantId').isUUID(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const logs = await siraZoneService.getZoneRestrictionLogs(merchantId, limit);

      res.json({
        success: true,
        logs,
        count: logs.length,
      });
    } catch (error: any) {
      console.error('Error fetching zone logs:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch zone logs',
      });
    }
  }
);

// ============================================================================
// ADMIN / SYSTEM ROUTES
// ============================================================================

/**
 * POST /admin/zones/analyze-all
 * Run Sira analysis for all merchants (cron job endpoint)
 */
router.post(
  '/admin/zones/analyze-all',
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Check if user is admin
      if (req.user?.role !== 'ops_admin' && req.user?.role !== 'system') {
        return res.status(403).json({
          success: false,
          error: 'Admin role required',
        });
      }

      const result = await siraZoneService.runScheduledZoneAnalysis();

      res.json({
        success: true,
        result,
        message: `Analyzed ${result.merchants_analyzed} merchants, generated ${result.total_recommendations} recommendations`,
      });
    } catch (error: any) {
      console.error('Error running scheduled analysis:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to run scheduled analysis',
      });
    }
  }
);

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /zones/health
 * Health check endpoint
 */
router.get('/zones/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'dynamic-zones',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// EXPORTS
// ============================================================================

export default router;
