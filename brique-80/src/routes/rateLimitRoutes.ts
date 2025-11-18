// =====================================================================
// Rate Limit API Routes (Ops Management)
// =====================================================================
// Express routes for managing rate limits, overrides, and blocks
// Date: 2025-11-12
// =====================================================================

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { RateLimitService } from '../services/rateLimitService';
import { rateLimitRedis } from '../utils/redisClient';

// =====================================================================
// Types
// =====================================================================

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    roles: string[];
    tenant_id?: string;
  };
}

// =====================================================================
// Router Factory
// =====================================================================

export function createRateLimitRoutes(pool: Pool): Router {
  const router = Router();
  const rateLimitService = new RateLimitService(pool);

  // ===================================================================
  // Plans Management
  // ===================================================================

  /**
   * GET /plans
   * List all rate limit plans
   */
  router.get('/plans', async (req: Request, res: Response) => {
    try {
      const { active, public: isPublic } = req.query;

      const plans = await rateLimitService.getPlans({
        activeOnly: active === 'true',
        publicOnly: isPublic === 'true',
      });

      res.json({
        plans,
        total: plans.length,
      });
    } catch (error: any) {
      console.error('[RateLimitRoutes] GET /plans error:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch plans',
      });
    }
  });

  /**
   * GET /plans/:id
   * Get specific plan
   */
  router.get('/plans/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const plan = await rateLimitService.getPlan(id);

      if (!plan) {
        return res.status(404).json({
          error: 'not_found',
          message: 'Plan not found',
        });
      }

      res.json(plan);
    } catch (error: any) {
      console.error('[RateLimitRoutes] GET /plans/:id error:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch plan',
      });
    }
  });

  /**
   * POST /plans
   * Create new rate limit plan
   */
  router.post('/plans', async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Require Ops role
      if (!req.user || !req.user.roles.includes('ops')) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Ops role required',
        });
      }

      const {
        name,
        display_name,
        description,
        config,
        price_monthly,
        price_currency,
        is_public,
        sort_order,
      } = req.body;

      // Validate required fields
      if (!name || !display_name || !config) {
        return res.status(400).json({
          error: 'validation_error',
          message: 'Missing required fields: name, display_name, config',
        });
      }

      // Validate config structure
      if (
        !config.rate_per_second ||
        !config.burst_capacity ||
        !config.daily_quota ||
        !config.monthly_quota
      ) {
        return res.status(400).json({
          error: 'validation_error',
          message: 'Invalid config structure',
        });
      }

      const plan = await rateLimitService.createPlan({
        name,
        display_name,
        description,
        config,
        price_monthly,
        price_currency,
        is_public,
        sort_order,
        created_by: req.user.id,
      });

      res.status(201).json(plan);
    } catch (error: any) {
      console.error('[RateLimitRoutes] POST /plans error:', error);

      if (error.message?.includes('duplicate key')) {
        return res.status(409).json({
          error: 'conflict',
          message: 'Plan with this name already exists',
        });
      }

      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to create plan',
      });
    }
  });

  /**
   * PATCH /plans/:id
   * Update rate limit plan
   */
  router.patch('/plans/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Require Ops role
      if (!req.user || !req.user.roles.includes('ops')) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Ops role required',
        });
      }

      const { id } = req.params;
      const updates = req.body;

      const plan = await rateLimitService.updatePlan(id, updates, req.user.id);

      res.json(plan);
    } catch (error: any) {
      console.error('[RateLimitRoutes] PATCH /plans/:id error:', error);

      if (error.message === 'Plan not found') {
        return res.status(404).json({
          error: 'not_found',
          message: 'Plan not found',
        });
      }

      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to update plan',
      });
    }
  });

  // ===================================================================
  // Overrides Management
  // ===================================================================

  /**
   * GET /overrides
   * List rate limit overrides
   */
  router.get('/overrides', async (req: Request, res: Response) => {
    try {
      const { target_type, target_id, active } = req.query;

      let query = 'SELECT * FROM rl_overrides WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (target_type) {
        query += ` AND target_type = $${paramIndex}`;
        params.push(target_type);
        paramIndex++;
      }

      if (target_id) {
        query += ` AND target_id = $${paramIndex}`;
        params.push(target_id);
        paramIndex++;
      }

      if (active === 'true') {
        query += ' AND is_active = true';
        query += ' AND (expires_at IS NULL OR expires_at > now())';
      }

      query += ' ORDER BY created_at DESC LIMIT 100';

      const result = await pool.query(query, params);

      res.json({
        overrides: result.rows,
        total: result.rows.length,
      });
    } catch (error: any) {
      console.error('[RateLimitRoutes] GET /overrides error:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch overrides',
      });
    }
  });

  /**
   * POST /overrides
   * Create rate limit override
   */
  router.post('/overrides', async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Require Ops role
      if (!req.user || !req.user.roles.includes('ops')) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Ops role required',
        });
      }

      const { target_type, target_id, config, reason, starts_at, expires_at } = req.body;

      // Validate required fields
      if (!target_type || !target_id || !config || !reason) {
        return res.status(400).json({
          error: 'validation_error',
          message: 'Missing required fields: target_type, target_id, config, reason',
        });
      }

      const override = await rateLimitService.createOverride({
        target_type,
        target_id,
        config,
        reason,
        starts_at: starts_at ? new Date(starts_at) : undefined,
        expires_at: expires_at ? new Date(expires_at) : undefined,
        created_by: req.user.id,
      });

      res.status(201).json(override);
    } catch (error: any) {
      console.error('[RateLimitRoutes] POST /overrides error:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to create override',
      });
    }
  });

  /**
   * DELETE /overrides/:id
   * Remove rate limit override
   */
  router.delete('/overrides/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Require Ops role
      if (!req.user || !req.user.roles.includes('ops')) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Ops role required',
        });
      }

      const { id } = req.params;

      await rateLimitService.removeOverride(id, req.user.id);

      res.status(204).send();
    } catch (error: any) {
      console.error('[RateLimitRoutes] DELETE /overrides/:id error:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to remove override',
      });
    }
  });

  // ===================================================================
  // Blocks Management
  // ===================================================================

  /**
   * GET /blocks
   * List rate limit blocks
   */
  router.get('/blocks', async (req: Request, res: Response) => {
    try {
      const { target_type, target_id, active } = req.query;

      let query = active === 'true'
        ? 'SELECT * FROM v_rl_blocks_active'
        : 'SELECT * FROM rl_blocks';

      const params: any[] = [];
      let paramIndex = 1;
      const conditions: string[] = [];

      if (target_type) {
        conditions.push(`target_type = $${paramIndex}`);
        params.push(target_type);
        paramIndex++;
      }

      if (target_id) {
        conditions.push(`target_id = $${paramIndex}`);
        params.push(target_id);
        paramIndex++;
      }

      if (conditions.length > 0) {
        query += active === 'true' ? ' WHERE ' : ' WHERE 1=1 AND ';
        query += conditions.join(' AND ');
      }

      query += ' ORDER BY created_at DESC LIMIT 100';

      const result = await pool.query(query, params);

      res.json({
        blocks: result.rows,
        total: result.rows.length,
      });
    } catch (error: any) {
      console.error('[RateLimitRoutes] GET /blocks error:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch blocks',
      });
    }
  });

  /**
   * POST /blocks
   * Create rate limit block
   */
  router.post('/blocks', async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Require Ops role
      if (!req.user || !req.user.roles.includes('ops')) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Ops role required',
        });
      }

      const {
        target_type,
        target_id,
        reason,
        reason_detail,
        starts_at,
        expires_at,
        auto_remove,
        metadata,
      } = req.body;

      // Validate required fields
      if (!target_type || !target_id || !reason) {
        return res.status(400).json({
          error: 'validation_error',
          message: 'Missing required fields: target_type, target_id, reason',
        });
      }

      const block = await rateLimitService.createBlock({
        target_type,
        target_id,
        reason,
        reason_detail,
        starts_at: starts_at ? new Date(starts_at) : undefined,
        expires_at: expires_at ? new Date(expires_at) : undefined,
        auto_remove,
        created_by: req.user.id,
        metadata,
      });

      res.status(201).json(block);
    } catch (error: any) {
      console.error('[RateLimitRoutes] POST /blocks error:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to create block',
      });
    }
  });

  /**
   * DELETE /blocks/:id
   * Remove rate limit block
   */
  router.delete('/blocks/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Require Ops role
      if (!req.user || !req.user.roles.includes('ops')) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Ops role required',
        });
      }

      const { id } = req.params;
      const { reason } = req.body;

      await rateLimitService.removeBlock(id, req.user.id, reason);

      res.status(204).send();
    } catch (error: any) {
      console.error('[RateLimitRoutes] DELETE /blocks/:id error:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to remove block',
      });
    }
  });

  // ===================================================================
  // Status & Metrics
  // ===================================================================

  /**
   * GET /status/:keyId
   * Get rate limit status for API key
   */
  router.get('/status/:keyId', async (req: Request, res: Response) => {
    try {
      const { keyId } = req.params;

      // Get current status from Redis
      const status = await rateLimitRedis.getRateLimitStatus(keyId);

      // Get configuration
      const result = await pool.query(
        'SELECT tenant_id FROM api_keys WHERE key_id = $1 LIMIT 1',
        [keyId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'not_found',
          message: 'API key not found',
        });
      }

      const { tenant_id } = result.rows[0];

      const config = await rateLimitService.getEffectiveConfig({
        apiKeyId: keyId,
        tenantId: tenant_id,
      });

      // Check if blocked
      const block = await rateLimitService.checkBlocks({
        apiKeyId: keyId,
        tenantId: tenant_id,
      });

      res.json({
        key_id: keyId,
        tenant_id,
        config,
        status: {
          tokens_available: status.tokensAvailable,
          daily_usage: status.dailyUsage,
          monthly_usage: status.monthlyUsage,
          daily_quota_remaining: config.daily_quota - status.dailyUsage,
          monthly_quota_remaining: config.monthly_quota - status.monthlyUsage,
          daily_usage_percent: (status.dailyUsage / config.daily_quota) * 100,
          monthly_usage_percent: (status.monthlyUsage / config.monthly_quota) * 100,
          last_update: new Date(status.lastUpdate),
        },
        blocked: block !== null,
        block_info: block || undefined,
      });
    } catch (error: any) {
      console.error('[RateLimitRoutes] GET /status/:keyId error:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch status',
      });
    }
  });

  /**
   * POST /reset/:keyId
   * Reset rate limit for API key (admin operation)
   */
  router.post('/reset/:keyId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Require Ops role
      if (!req.user || !req.user.roles.includes('ops')) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Ops role required',
        });
      }

      const { keyId } = req.params;

      // Reset Redis counters
      await rateLimitRedis.resetRateLimit(keyId);

      // Clear cache
      rateLimitService.clearCache();

      // Log event
      await pool.query(
        `INSERT INTO rl_audit_logs (event_type, actor_type, actor_id, target_type, target_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'config_updated',
          'ops',
          req.user.id,
          'api_key',
          keyId,
          JSON.stringify({ action: 'reset' }),
        ]
      );

      res.json({
        message: 'Rate limit reset successfully',
        key_id: keyId,
      });
    } catch (error: any) {
      console.error('[RateLimitRoutes] POST /reset/:keyId error:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to reset rate limit',
      });
    }
  });

  /**
   * GET /metrics
   * Get aggregated rate limiting metrics
   */
  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      const { start_date, end_date, tenant_id, api_key_id, limit = 100 } = req.query;

      let query = `
        SELECT
          bucket_ts,
          tenant_id,
          api_key_id,
          endpoint,
          region,
          requests_total,
          requests_throttled,
          requests_blocked,
          quota_exceeded_count,
          avg_tokens_remaining,
          max_requests_per_second
        FROM rl_metrics_hourly
        WHERE 1=1
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (start_date) {
        query += ` AND bucket_ts >= $${paramIndex}`;
        params.push(start_date);
        paramIndex++;
      }

      if (end_date) {
        query += ` AND bucket_ts <= $${paramIndex}`;
        params.push(end_date);
        paramIndex++;
      }

      if (tenant_id) {
        query += ` AND tenant_id = $${paramIndex}`;
        params.push(tenant_id);
        paramIndex++;
      }

      if (api_key_id) {
        query += ` AND api_key_id = $${paramIndex}`;
        params.push(api_key_id);
        paramIndex++;
      }

      query += ` ORDER BY bucket_ts DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await pool.query(query, params);

      res.json({
        metrics: result.rows,
        total: result.rows.length,
      });
    } catch (error: any) {
      console.error('[RateLimitRoutes] GET /metrics error:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch metrics',
      });
    }
  });

  /**
   * GET /audit-logs
   * Get rate limiting audit logs
   */
  router.get('/audit-logs', async (req: Request, res: Response) => {
    try {
      const {
        event_type,
        target_type,
        target_id,
        start_date,
        end_date,
        limit = 100,
      } = req.query;

      let query = 'SELECT * FROM rl_audit_logs WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (event_type) {
        query += ` AND event_type = $${paramIndex}`;
        params.push(event_type);
        paramIndex++;
      }

      if (target_type) {
        query += ` AND target_type = $${paramIndex}`;
        params.push(target_type);
        paramIndex++;
      }

      if (target_id) {
        query += ` AND target_id = $${paramIndex}`;
        params.push(target_id);
        paramIndex++;
      }

      if (start_date) {
        query += ` AND created_at >= $${paramIndex}`;
        params.push(start_date);
        paramIndex++;
      }

      if (end_date) {
        query += ` AND created_at <= $${paramIndex}`;
        params.push(end_date);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await pool.query(query, params);

      res.json({
        logs: result.rows,
        total: result.rows.length,
      });
    } catch (error: any) {
      console.error('[RateLimitRoutes] GET /audit-logs error:', error);
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch audit logs',
      });
    }
  });

  /**
   * GET /health
   * Health check for rate limiting service
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      // Check Redis
      const redisHealth = await rateLimitRedis.healthCheck();

      // Check PostgreSQL
      const pgStart = Date.now();
      await pool.query('SELECT 1');
      const pgLatency = Date.now() - pgStart;

      const healthy = redisHealth.healthy && pgLatency < 1000;

      res.status(healthy ? 200 : 503).json({
        healthy,
        services: {
          redis: {
            healthy: redisHealth.healthy,
            latency: redisHealth.latency,
            error: redisHealth.error,
          },
          postgresql: {
            healthy: pgLatency < 1000,
            latency: pgLatency,
          },
        },
      });
    } catch (error: any) {
      res.status(503).json({
        healthy: false,
        error: error.message,
      });
    }
  });

  return router;
}

// =====================================================================
// Export
// =====================================================================

export default createRateLimitRoutes;
