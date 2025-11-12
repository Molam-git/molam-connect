// =====================================================
// Brique 74 - Developer Portal API Routes
// =====================================================
// Purpose: REST API endpoints for developer portal features
// Version: 1.0.0
// =====================================================

import express, { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import * as devPortalService from '../services/developerPortal';

const router = express.Router();

// =====================================================
// MIDDLEWARE
// =====================================================

/**
 * Authentication middleware - validates Molam ID JWT
 * Should be integrated with existing auth system
 */
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
    // TODO: Integrate with Molam ID JWT authentication
    // For now, check for X-User-Id header (development only)
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
      roles: ['dev_admin'], // TODO: Extract from JWT
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

/**
 * Validation error handler
 */
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
// 1. API KEY MANAGEMENT ROUTES
// =====================================================

/**
 * POST /dev/api-keys
 * Create a new API key
 */
router.post(
  '/dev/api-keys',
  authenticateUser,
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('environment').isIn(['test', 'production']).withMessage('Environment must be test or production'),
    body('scopes').isArray().notEmpty().withMessage('Scopes must be a non-empty array'),
    body('expires_in_days').optional().isInt({ min: 1 }).withMessage('Expiration must be at least 1 day'),
    body('rate_limit_per_second').optional().isInt({ min: 1 }),
    body('rate_limit_per_hour').optional().isInt({ min: 1 }),
    body('rate_limit_per_day').optional().isInt({ min: 1 }),
    body('allowed_ips').optional().isArray(),
    body('allowed_origins').optional().isArray(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const apiKey = await devPortalService.createAPIKey({
        tenant_type: req.user!.tenant_type,
        tenant_id: req.user!.tenant_id,
        user_id: req.user!.id,
        name: req.body.name,
        environment: req.body.environment,
        scopes: req.body.scopes,
        expires_in_days: req.body.expires_in_days,
        allowed_ips: req.body.allowed_ips,
        allowed_origins: req.body.allowed_origins,
        rate_limit_per_second: req.body.rate_limit_per_second,
        rate_limit_per_hour: req.body.rate_limit_per_hour,
        rate_limit_per_day: req.body.rate_limit_per_day,
        metadata: req.body.metadata,
      });

      res.status(201).json({
        success: true,
        api_key: apiKey,
        warning: 'Save the secret_key securely. It will not be shown again.',
      });
    } catch (error: any) {
      console.error('[DevPortal] API key creation failed:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'key_creation_failed',
          message: error.message || 'Failed to create API key',
        },
      });
    }
  }
);

/**
 * GET /dev/api-keys
 * List API keys for authenticated tenant
 */
router.get(
  '/dev/api-keys',
  authenticateUser,
  [query('include_revoked').optional().isBoolean()],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const includeRevoked = req.query.include_revoked === 'true';

      const apiKeys = await devPortalService.listAPIKeys(
        req.user!.tenant_type,
        req.user!.tenant_id,
        includeRevoked
      );

      res.json({
        success: true,
        count: apiKeys.length,
        api_keys: apiKeys,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to list API keys:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'list_failed',
          message: error.message || 'Failed to list API keys',
        },
      });
    }
  }
);

/**
 * GET /dev/api-keys/:keyId/stats
 * Get usage statistics for an API key
 */
router.get(
  '/dev/api-keys/:keyId/stats',
  authenticateUser,
  [
    param('keyId').isUUID(),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { keyId } = req.params;
      const startDate = req.query.start_date ? new Date(req.query.start_date as string) : undefined;
      const endDate = req.query.end_date ? new Date(req.query.end_date as string) : undefined;

      const stats = await devPortalService.getAPIKeyStats(keyId, startDate, endDate);

      res.json({
        success: true,
        key_id: keyId,
        period: {
          start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: endDate || new Date(),
        },
        stats,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to get API key stats:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'stats_failed',
          message: error.message || 'Failed to get API key stats',
        },
      });
    }
  }
);

/**
 * DELETE /dev/api-keys/:keyId
 * Revoke an API key
 */
router.delete(
  '/dev/api-keys/:keyId',
  authenticateUser,
  [
    param('keyId').isUUID(),
    body('reason').notEmpty().withMessage('Revocation reason is required'),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { keyId } = req.params;
      const { reason } = req.body;

      await devPortalService.revokeAPIKey(keyId, req.user!.id, reason);

      res.json({
        success: true,
        message: 'API key revoked successfully',
        key_id: keyId,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to revoke API key:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'revocation_failed',
          message: error.message || 'Failed to revoke API key',
        },
      });
    }
  }
);

// =====================================================
// 2. API LOGS ROUTES
// =====================================================

/**
 * GET /dev/api-logs
 * Query API request logs with filters
 */
router.get(
  '/dev/api-logs',
  authenticateUser,
  [
    query('api_key_id').optional().isUUID(),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
    query('status_code').optional().isInt(),
    query('method').optional().isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    query('path_pattern').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const logs = await devPortalService.queryAPILogs({
        tenant_type: req.user!.tenant_type,
        tenant_id: req.user!.tenant_id,
        api_key_id: req.query.api_key_id as string | undefined,
        start_date: req.query.start_date ? new Date(req.query.start_date as string) : undefined,
        end_date: req.query.end_date ? new Date(req.query.end_date as string) : undefined,
        status_code: req.query.status_code ? parseInt(req.query.status_code as string) : undefined,
        method: req.query.method as string | undefined,
        path_pattern: req.query.path_pattern as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      });

      res.json({
        success: true,
        count: logs.length,
        logs,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to query API logs:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'query_failed',
          message: error.message || 'Failed to query API logs',
        },
      });
    }
  }
);

/**
 * GET /dev/api-logs/:requestId
 * Get detailed log entry by request ID
 */
router.get(
  '/dev/api-logs/:requestId',
  authenticateUser,
  [param('requestId').notEmpty()],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const logs = await devPortalService.queryAPILogs({
        tenant_type: req.user!.tenant_type,
        tenant_id: req.user!.tenant_id,
        limit: 1,
      });

      // TODO: Query by request_id directly
      const log = logs.find((l: any) => l.request_id === req.params.requestId);

      if (!log) {
        return res.status(404).json({
          error: {
            type: 'not_found',
            code: 'log_not_found',
            message: 'API log not found',
          },
        });
      }

      res.json({
        success: true,
        log,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to get API log:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'query_failed',
          message: error.message || 'Failed to get API log',
        },
      });
    }
  }
);

// =====================================================
// 3. PLAYGROUND ROUTES
// =====================================================

/**
 * POST /dev/playground/sessions
 * Create a new playground session
 */
router.post(
  '/dev/playground/sessions',
  authenticateUser,
  [
    body('name').optional().isString(),
    body('description').optional().isString(),
    body('environment').optional().isIn(['sandbox', 'test']),
    body('api_version').optional().isString(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const session = await devPortalService.createPlaygroundSession({
        user_id: req.user!.id,
        tenant_type: req.user!.tenant_type,
        tenant_id: req.user!.tenant_id,
        name: req.body.name,
        description: req.body.description,
        environment: req.body.environment,
        api_version: req.body.api_version,
      });

      res.status(201).json({
        success: true,
        session,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to create playground session:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'session_creation_failed',
          message: error.message || 'Failed to create playground session',
        },
      });
    }
  }
);

/**
 * POST /dev/playground/sessions/:sessionId/execute
 * Execute an API request in the playground
 */
router.post(
  '/dev/playground/sessions/:sessionId/execute',
  authenticateUser,
  [
    param('sessionId').isUUID(),
    body('method').isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    body('endpoint').notEmpty().withMessage('Endpoint is required'),
    body('headers').optional().isObject(),
    body('body').optional(),
    body('query_params').optional().isObject(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;

      const result = await devPortalService.executePlaygroundRequest({
        session_id: sessionId,
        method: req.body.method,
        endpoint: req.body.endpoint,
        headers: req.body.headers,
        body: req.body.body,
        query_params: req.body.query_params,
      });

      res.json({
        success: true,
        request: result,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to execute playground request:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'execution_failed',
          message: error.message || 'Failed to execute playground request',
        },
      });
    }
  }
);

/**
 * GET /dev/playground/sessions/:sessionId/history
 * Get request history for a playground session
 */
router.get(
  '/dev/playground/sessions/:sessionId/history',
  authenticateUser,
  [
    param('sessionId').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 500 }),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const history = await devPortalService.getPlaygroundRequestHistory(sessionId, limit);

      res.json({
        success: true,
        count: history.length,
        history,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to get playground history:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'history_failed',
          message: error.message || 'Failed to get playground history',
        },
      });
    }
  }
);

// =====================================================
// 4. SDK ROUTES
// =====================================================

/**
 * GET /dev/sdks
 * List available SDK versions
 */
router.get(
  '/dev/sdks',
  [query('language').optional().isString()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const language = req.query.language as string | undefined;
      const sdks = await devPortalService.listSDKVersions(language);

      res.json({
        success: true,
        count: sdks.length,
        sdks,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to list SDKs:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'list_failed',
          message: error.message || 'Failed to list SDKs',
        },
      });
    }
  }
);

/**
 * POST /dev/sdks/:sdkId/download
 * Track SDK download and return download URL
 */
router.post(
  '/dev/sdks/:sdkId/download',
  [param('sdkId').isUUID()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { sdkId } = req.params;

      // Get SDK details
      const sdks = await devPortalService.listSDKVersions();
      const sdk = sdks.find((s) => s.id === sdkId);

      if (!sdk) {
        return res.status(404).json({
          error: {
            type: 'not_found',
            code: 'sdk_not_found',
            message: 'SDK version not found',
          },
        });
      }

      // Track download
      await devPortalService.trackSDKDownload({
        sdk_version_id: sdkId,
        ip_address: req.ip || req.socket.remoteAddress || '0.0.0.0',
        user_agent: req.header('User-Agent'),
        referrer: req.header('Referer'),
      });

      res.json({
        success: true,
        sdk: {
          id: sdk.id,
          language: sdk.language,
          version: sdk.version,
          download_url: sdk.download_url,
          checksum_sha256: sdk.checksum_sha256,
          size_bytes: sdk.size_bytes,
        },
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to track SDK download:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'download_failed',
          message: error.message || 'Failed to process SDK download',
        },
      });
    }
  }
);

// =====================================================
// 5. DOCUMENTATION ROUTES
// =====================================================

/**
 * GET /dev/docs
 * Search documentation pages
 */
router.get(
  '/dev/docs',
  [
    query('q').optional().isString(),
    query('category').optional().isString(),
    query('api_version').optional().isString(),
    query('tags').optional().isString(), // Comma-separated
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;

      const docs = await devPortalService.searchDocumentation({
        query: req.query.q as string | undefined,
        category: req.query.category as string | undefined,
        api_version: req.query.api_version as string | undefined,
        tags,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      });

      res.json({
        success: true,
        count: docs.length,
        docs,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to search documentation:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'search_failed',
          message: error.message || 'Failed to search documentation',
        },
      });
    }
  }
);

/**
 * GET /dev/docs/:slug
 * Get documentation page by slug
 */
router.get(
  '/dev/docs/:slug',
  [param('slug').notEmpty()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const doc = await devPortalService.getDocumentationBySlug(slug);

      if (!doc) {
        return res.status(404).json({
          error: {
            type: 'not_found',
            code: 'doc_not_found',
            message: 'Documentation page not found',
          },
        });
      }

      res.json({
        success: true,
        doc,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to get documentation:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'retrieval_failed',
          message: error.message || 'Failed to get documentation',
        },
      });
    }
  }
);

// =====================================================
// 6. COMPLIANCE GUIDES ROUTES
// =====================================================

/**
 * GET /dev/compliance
 * List compliance guides
 */
router.get(
  '/dev/compliance',
  [
    query('regulation_type').optional().isString(),
    query('region').optional().isString(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const guides = await devPortalService.listComplianceGuides(
        req.query.regulation_type as string | undefined,
        req.query.region as string | undefined
      );

      res.json({
        success: true,
        count: guides.length,
        guides,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to list compliance guides:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'list_failed',
          message: error.message || 'Failed to list compliance guides',
        },
      });
    }
  }
);

/**
 * GET /dev/compliance/:slug
 * Get compliance guide by slug
 */
router.get(
  '/dev/compliance/:slug',
  [param('slug').notEmpty()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const guide = await devPortalService.getComplianceGuide(slug);

      if (!guide) {
        return res.status(404).json({
          error: {
            type: 'not_found',
            code: 'guide_not_found',
            message: 'Compliance guide not found',
          },
        });
      }

      res.json({
        success: true,
        guide,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to get compliance guide:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'retrieval_failed',
          message: error.message || 'Failed to get compliance guide',
        },
      });
    }
  }
);

// =====================================================
// 7. FEEDBACK ROUTES
// =====================================================

/**
 * POST /dev/feedback
 * Submit developer feedback
 */
router.post(
  '/dev/feedback',
  [
    body('type').isIn(['bug', 'feature_request', 'documentation', 'sdk', 'api_design', 'other']),
    body('title').notEmpty().withMessage('Title is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
    body('email').optional().isEmail(),
    body('page_url').optional().isString(),
    body('api_endpoint').optional().isString(),
    body('sdk_language').optional().isString(),
    body('api_version').optional().isString(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const feedback = await devPortalService.submitFeedback({
        type: req.body.type,
        title: req.body.title,
        description: req.body.description,
        severity: req.body.severity,
        email: req.body.email,
        page_url: req.body.page_url,
        api_endpoint: req.body.api_endpoint,
        sdk_language: req.body.sdk_language,
        api_version: req.body.api_version,
      });

      res.status(201).json({
        success: true,
        message: 'Feedback submitted successfully',
        feedback,
      });
    } catch (error: any) {
      console.error('[DevPortal] Failed to submit feedback:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          code: 'submission_failed',
          message: error.message || 'Failed to submit feedback',
        },
      });
    }
  }
);

// =====================================================
// 8. HEALTH CHECK
// =====================================================

/**
 * GET /dev/health
 * Health check endpoint
 */
router.get('/dev/health', async (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'developer-portal',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// =====================================================
// ERROR HANDLER
// =====================================================

router.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[DevPortal] Unhandled error:', err);
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
