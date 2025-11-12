/**
 * Brique 79 - API Keys Management Routes
 *
 * REST API for API key management:
 * - Create keys (test/live)
 * - List keys
 * - Get key details
 * - Rotate keys
 * - Revoke keys
 * - Usage statistics
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import express, { Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import * as apiKeysService from '../services/apiKeysService';

const router = express.Router();

// =======================================================================
// MIDDLEWARE
// =======================================================================

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    type: string;
    roles?: string[];
  };
}

async function authenticateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Missing authorization header' });
      return;
    }

    // TODO: Verify JWT with Molam ID
    // For now, mock user
    req.user = {
      id: 'test-user-id',
      type: 'merchant_admin',
      roles: ['merchant_admin', 'dev_owner'],
    };

    next();
  } catch (error: any) {
    res.status(401).json({ success: false, error: 'Authentication failed' });
  }
}

function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const hasRole = allowedRoles.some((role) => req.user!.roles?.includes(role));

    if (!hasRole) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

function handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  next();
}

// =======================================================================
// KEY MANAGEMENT ENDPOINTS
// =======================================================================

/**
 * POST /api/keys
 * Create new API key
 */
router.post(
  '/',
  authenticateUser,
  requireRole(['merchant_admin', 'dev_owner', 'pay_admin']),
  [
    body('tenant_type').isIn(['merchant', 'agent', 'internal_app', 'partner']),
    body('tenant_id').isUUID(),
    body('mode').isIn(['test', 'live']),
    body('name').optional().isString(),
    body('description').optional().isString(),
    body('scopes').optional().isArray(),
    body('restrictions').optional().isObject(),
    body('idempotency_key').optional().isString(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        tenant_type,
        tenant_id,
        mode,
        name,
        description,
        scopes,
        restrictions,
        idempotency_key,
      } = req.body;

      const result = await apiKeysService.createAPIKey({
        tenant_type,
        tenant_id,
        mode,
        name,
        description,
        scopes,
        restrictions,
        created_by: req.user!.id,
        idempotency_key,
      });

      // Check if requires approval
      if (result.requires_approval) {
        res.status(202).json({
          success: true,
          status: 'pending_approval',
          ops_action_id: result.ops_action_id,
          message: 'Live key creation requires approval',
        });
        return;
      }

      // Return key and secret (copy-once)
      res.status(201).json({
        success: true,
        key: {
          key_id: result.key.key_id,
          mode: result.key.mode,
          name: result.key.name,
          scopes: result.key.scopes,
          restrictions: result.key.restrictions,
          created_at: result.key.created_at,
        },
        secret: result.secret,
        message: 'COPY-ONCE: Store this secret securely. It will not be shown again.',
      });
    } catch (error: any) {
      console.error('[APIKeysAPI] Create key failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/keys
 * List API keys for tenant
 */
router.get(
  '/',
  authenticateUser,
  [
    query('tenant_type').isIn(['merchant', 'agent', 'internal_app', 'partner']),
    query('tenant_id').isUUID(),
    query('mode').optional().isIn(['test', 'live']),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { tenant_type, tenant_id, mode } = req.query;

      const keys = await apiKeysService.listAPIKeys(
        tenant_type as string,
        tenant_id as string,
        mode as any
      );

      // Mask secrets (never return them)
      const maskedKeys = keys.map((k) => ({
        key_id: k.key_id,
        mode: k.mode,
        name: k.name,
        description: k.description,
        scopes: k.scopes,
        restrictions: k.restrictions,
        status: k.status,
        created_at: k.created_at,
        last_used_at: k.last_used_at,
        expires_at: k.expires_at,
      }));

      res.json({
        success: true,
        keys: maskedKeys,
        count: maskedKeys.length,
      });
    } catch (error: any) {
      console.error('[APIKeysAPI] List keys failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/keys/:keyId
 * Get API key details
 */
router.get(
  '/:keyId',
  authenticateUser,
  [param('keyId').isString()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;

      const key = await apiKeysService.getAPIKey(keyId);

      if (!key) {
        res.status(404).json({ success: false, error: 'Key not found' });
        return;
      }

      res.json({
        success: true,
        key: {
          key_id: key.key_id,
          mode: key.mode,
          name: key.name,
          description: key.description,
          scopes: key.scopes,
          restrictions: key.restrictions,
          status: key.status,
          created_at: key.created_at,
          last_used_at: key.last_used_at,
          expires_at: key.expires_at,
        },
      });
    } catch (error: any) {
      console.error('[APIKeysAPI] Get key failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/keys/:keyId/rotate
 * Rotate API key (create new secret)
 */
router.post(
  '/:keyId/rotate',
  authenticateUser,
  requireRole(['merchant_admin', 'pay_admin']),
  [
    param('keyId').isString(),
    body('grace_period_seconds').optional().isInt({ min: 60, max: 86400 }),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { keyId } = req.params;
      const { grace_period_seconds } = req.body;

      const result = await apiKeysService.rotateAPIKey(
        keyId,
        req.user!.id,
        grace_period_seconds || 600
      );

      res.json({
        success: true,
        key_id: result.key.key_id,
        new_version: result.new_version,
        secret: result.secret,
        message: 'COPY-ONCE: Store this secret securely. Old secret will be valid for grace period.',
      });
    } catch (error: any) {
      console.error('[APIKeysAPI] Rotate key failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/keys/:keyId/revoke
 * Revoke API key
 */
router.post(
  '/:keyId/revoke',
  authenticateUser,
  requireRole(['merchant_admin', 'pay_admin']),
  [
    param('keyId').isString(),
    body('reason').optional().isString(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { keyId } = req.params;
      const { reason } = req.body;

      await apiKeysService.revokeAPIKey(keyId, req.user!.id, reason);

      res.json({
        success: true,
        message: 'API key revoked successfully',
      });
    } catch (error: any) {
      console.error('[APIKeysAPI] Revoke key failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/keys/:keyId/usage
 * Get usage statistics for API key
 */
router.get(
  '/:keyId/usage',
  authenticateUser,
  [
    param('keyId').isString(),
    query('days').optional().isInt({ min: 1, max: 365 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;
      const { days } = req.query;

      const stats = await apiKeysService.getUsageStats(
        keyId,
        days ? parseInt(days as string) : 30
      );

      res.json({
        success: true,
        stats,
        count: stats.length,
      });
    } catch (error: any) {
      console.error('[APIKeysAPI] Get usage failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/keys/:keyId/quota
 * Get current quota status
 */
router.get(
  '/:keyId/quota',
  authenticateUser,
  [param('keyId').isString()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;

      const quotaCheck = await apiKeysService.checkQuota(keyId);

      res.json({
        success: true,
        quota: {
          allowed: quotaCheck.allowed,
          daily_remaining: quotaCheck.daily_remaining,
          monthly_remaining: quotaCheck.monthly_remaining,
        },
      });
    } catch (error: any) {
      console.error('[APIKeysAPI] Get quota failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// UTILITY ENDPOINTS
// =======================================================================

/**
 * POST /api/keys/validate
 * Validate API key (for testing)
 */
router.post(
  '/validate',
  [
    body('key_id').isString(),
    body('secret').isString(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { key_id, secret } = req.body;

      const validation = await apiKeysService.validateAPIKey(key_id, secret);

      if (validation.valid) {
        res.json({
          success: true,
          valid: true,
          key: {
            key_id: validation.key!.key.key_id,
            scopes: validation.key!.scopes,
            tenant_id: validation.key!.tenant_id,
            tenant_type: validation.key!.tenant_type,
          },
        });
      } else {
        res.status(401).json({
          success: false,
          valid: false,
          error: validation.error,
        });
      }
    } catch (error: any) {
      console.error('[APIKeysAPI] Validate failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// HEALTH CHECK
// =======================================================================

router.get('/health', async (req: Request, res: Response) => {
  try {
    await apiKeysService.pool.query('SELECT 1');

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
    });
  }
});

export default router;
