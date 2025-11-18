/**
 * Brique 84 — Payouts Engine
 * API Routes
 *
 * Features:
 * ✅ Idempotent payout creation (Idempotency-Key header)
 * ✅ RBAC enforcement
 * ✅ Pagination
 * ✅ Filtering
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { PayoutService } from '../services/payoutService';
import { BankConnectorFactory } from '../connectors/bankConnectorFactory';

const router = Router();

// =====================================================================
// MIDDLEWARE
// =====================================================================

/**
 * Extract idempotency key from header
 */
function extractIdempotencyKey(req: Request): string | undefined {
  return req.headers['idempotency-key'] as string | undefined;
}

/**
 * Require specific roles (RBAC)
 */
function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.headers['x-user-role'] as string;

    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Required roles: ${roles.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Extract user context
 */
function getUserContext(req: Request): {
  userId: string;
  tenantId: string;
  tenantType: string;
  role: string;
} {
  return {
    userId: req.headers['x-user-id'] as string,
    tenantId: req.headers['x-tenant-id'] as string,
    tenantType: req.headers['x-tenant-type'] as string || 'merchant',
    role: req.headers['x-user-role'] as string
  };
}

// =====================================================================
// ROUTES
// =====================================================================

/**
 * POST /api/payouts
 * Create a new payout (idempotent)
 */
router.post(
  '/',
  requireRole(['merchant_admin', 'finance_ops', 'treasury_ops', 'system']),
  async (req: Request, res: Response) => {
    try {
      const pool: Pool = req.app.get('db');
      const redis: Redis = req.app.get('redis');
      const payoutService = new PayoutService(pool, redis);

      const userContext = getUserContext(req);
      const idempotencyKey = extractIdempotencyKey(req);

      // Validate required fields
      const {
        originModule,
        originEntityType,
        originEntityId,
        beneficiaryType,
        beneficiaryId,
        beneficiaryAccountId,
        amount,
        currency,
        payoutMethod,
        priority,
        requestedSettlementDate,
        scheduledAt,
        bankConnectorId,
        rail,
        metadata,
        description,
        internalNote
      } = req.body;

      if (!originModule || !originEntityType || !originEntityId) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Missing required origin fields'
        });
      }

      if (!beneficiaryType || !beneficiaryId) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Missing required beneficiary fields'
        });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Amount must be greater than zero'
        });
      }

      if (!currency) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Currency is required'
        });
      }

      if (!payoutMethod) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Payout method is required'
        });
      }

      // Create payout
      const payout = await payoutService.createPayout({
        idempotencyKey,
        originModule,
        originEntityType,
        originEntityId,
        beneficiaryType,
        beneficiaryId,
        beneficiaryAccountId,
        amount,
        currency,
        payoutMethod,
        priority,
        requestedSettlementDate,
        scheduledAt,
        bankConnectorId,
        rail,
        metadata,
        description,
        internalNote,
        tenantId: userContext.tenantId,
        tenantType: userContext.tenantType,
        createdBy: userContext.userId
      });

      res.status(201).json({
        success: true,
        payout
      });

    } catch (error: any) {
      console.error('[PayoutsAPI] Create payout error:', error);

      if (error.message.includes('Insufficient balance')) {
        return res.status(400).json({
          error: 'Insufficient Balance',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/payouts
 * List payouts with filtering and pagination
 */
router.get(
  '/',
  requireRole(['merchant_admin', 'finance_ops', 'treasury_ops', 'billing_ops']),
  async (req: Request, res: Response) => {
    try {
      const pool: Pool = req.app.get('db');
      const redis: Redis = req.app.get('redis');
      const payoutService = new PayoutService(pool, redis);

      const userContext = getUserContext(req);

      const filters = {
        tenantId: userContext.tenantId,
        tenantType: userContext.tenantType,
        status: req.query.status as string | undefined,
        beneficiaryId: req.query.beneficiary_id as string | undefined,
        fromDate: req.query.from_date as string | undefined,
        toDate: req.query.to_date as string | undefined,
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0
      };

      const result = await payoutService.list(filters);

      res.json({
        success: true,
        payouts: result.payouts,
        total: result.total,
        limit: filters.limit,
        offset: filters.offset
      });

    } catch (error: any) {
      console.error('[PayoutsAPI] List payouts error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/payouts/:id
 * Get payout by ID
 */
router.get(
  '/:id',
  requireRole(['merchant_admin', 'finance_ops', 'treasury_ops', 'billing_ops']),
  async (req: Request, res: Response) => {
    try {
      const pool: Pool = req.app.get('db');
      const redis: Redis = req.app.get('redis');
      const payoutService = new PayoutService(pool, redis);

      const { id } = req.params;

      const payout = await payoutService.getById(id);

      if (!payout) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Payout not found'
        });
      }

      // Check tenant access
      const userContext = getUserContext(req);
      if (payout.tenant_id !== userContext.tenantId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied'
        });
      }

      res.json({
        success: true,
        payout
      });

    } catch (error: any) {
      console.error('[PayoutsAPI] Get payout error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/payouts/:id/cancel
 * Cancel a payout (ops only, before processing)
 */
router.post(
  '/:id/cancel',
  requireRole(['finance_ops', 'treasury_ops']),
  async (req: Request, res: Response) => {
    try {
      const pool: Pool = req.app.get('db');
      const redis: Redis = req.app.get('redis');
      const payoutService = new PayoutService(pool, redis);

      const { id } = req.params;
      const { reason } = req.body;

      const payout = await payoutService.getById(id);

      if (!payout) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Payout not found'
        });
      }

      // Can only cancel pending or scheduled payouts
      if (!['pending', 'scheduled'].includes(payout.status)) {
        return res.status(400).json({
          error: 'Invalid Status',
          message: `Cannot cancel payout with status: ${payout.status}`
        });
      }

      // Update status to reversed
      await payoutService.updateStatus(id, 'reversed', {
        errorMessage: reason || 'Cancelled by ops'
      });

      res.json({
        success: true,
        message: 'Payout cancelled successfully'
      });

    } catch (error: any) {
      console.error('[PayoutsAPI] Cancel payout error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/payouts/:id/retry
 * Manually retry a failed payout (ops only)
 */
router.post(
  '/:id/retry',
  requireRole(['finance_ops', 'treasury_ops']),
  async (req: Request, res: Response) => {
    try {
      const pool: Pool = req.app.get('db');
      const redis: Redis = req.app.get('redis');
      const payoutService = new PayoutService(pool, redis);

      const { id } = req.params;

      const payout = await payoutService.getById(id);

      if (!payout) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Payout not found'
        });
      }

      // Can only retry failed or DLQ payouts
      if (!['failed', 'dlq'].includes(payout.status)) {
        return res.status(400).json({
          error: 'Invalid Status',
          message: `Cannot retry payout with status: ${payout.status}`
        });
      }

      // Reset to pending and clear retry count
      await pool.query(
        `UPDATE payouts
         SET status = 'pending',
             retry_count = 0,
             next_retry_at = NULL,
             last_error = NULL,
             last_error_code = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      res.json({
        success: true,
        message: 'Payout reset and will be retried'
      });

    } catch (error: any) {
      console.error('[PayoutsAPI] Retry payout error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/payouts/stats/summary
 * Get payout statistics for tenant
 */
router.get(
  '/stats/summary',
  requireRole(['merchant_admin', 'finance_ops', 'treasury_ops']),
  async (req: Request, res: Response) => {
    try {
      const pool: Pool = req.app.get('db');
      const userContext = getUserContext(req);

      const result = await pool.query(
        `SELECT
          COUNT(*) as total_payouts,
          SUM(amount) as total_amount,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
          COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
          COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
          COUNT(*) FILTER (WHERE status = 'settled') as settled_count,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
          COUNT(*) FILTER (WHERE status = 'dlq') as dlq_count,
          SUM(amount) FILTER (WHERE status = 'settled') as settled_amount,
          AVG(EXTRACT(EPOCH FROM (settled_at - created_at)) / 3600)
            FILTER (WHERE settled_at IS NOT NULL) as avg_settlement_hours
         FROM payouts
         WHERE tenant_id = $1 AND tenant_type = $2
           AND created_at >= CURRENT_DATE - INTERVAL '30 days'`,
        [userContext.tenantId, userContext.tenantType]
      );

      res.json({
        success: true,
        stats: result.rows[0]
      });

    } catch (error: any) {
      console.error('[PayoutsAPI] Get stats error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/payouts/ops/alerts
 * Get active alerts (ops only)
 */
router.get(
  '/ops/alerts',
  requireRole(['finance_ops', 'treasury_ops', 'billing_ops']),
  async (req: Request, res: Response) => {
    try {
      const pool: Pool = req.app.get('db');

      const result = await pool.query(
        `SELECT * FROM payout_alerts
         WHERE resolved = false
         ORDER BY severity DESC, created_at DESC
         LIMIT 100`
      );

      res.json({
        success: true,
        alerts: result.rows
      });

    } catch (error: any) {
      console.error('[PayoutsAPI] Get alerts error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/payouts/ops/alerts/:id/resolve
 * Resolve an alert (ops only)
 */
router.post(
  '/ops/alerts/:id/resolve',
  requireRole(['finance_ops', 'treasury_ops']),
  async (req: Request, res: Response) => {
    try {
      const pool: Pool = req.app.get('db');
      const userContext = getUserContext(req);

      const { id } = req.params;
      const { resolution_note } = req.body;

      await pool.query(
        `UPDATE payout_alerts
         SET resolved = true,
             resolved_at = NOW(),
             resolved_by = $1,
             resolution_note = $2
         WHERE id = $3`,
        [userContext.userId, resolution_note, id]
      );

      res.json({
        success: true,
        message: 'Alert resolved'
      });

    } catch (error: any) {
      console.error('[PayoutsAPI] Resolve alert error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/payouts/connectors/health
 * Health check all bank connectors (ops only)
 */
router.get(
  '/connectors/health',
  requireRole(['finance_ops', 'treasury_ops', 'system']),
  async (req: Request, res: Response) => {
    try {
      const connectorFactory = new BankConnectorFactory();
      const health = await connectorFactory.healthCheckAll();

      res.json({
        success: true,
        connectors: health
      });

    } catch (error: any) {
      console.error('[PayoutsAPI] Connector health check error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/payouts/connectors/list
 * List all registered connectors (ops only)
 */
router.get(
  '/connectors/list',
  requireRole(['finance_ops', 'treasury_ops', 'system']),
  async (req: Request, res: Response) => {
    try {
      const connectorFactory = new BankConnectorFactory();
      const connectors = connectorFactory.listConnectors();

      res.json({
        success: true,
        connectors
      });

    } catch (error: any) {
      console.error('[PayoutsAPI] List connectors error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
);

export default router;
