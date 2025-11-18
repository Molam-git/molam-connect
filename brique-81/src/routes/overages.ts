// =====================================================================
// Overage Billing API Routes
// =====================================================================
// Ops and Merchant endpoints for viewing/managing overage charges
// Date: 2025-11-12
// =====================================================================

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { ComputeAmountService, formatAmount, formatTierBreakdown } from '../overages/computeAmount';
import { OveragePricingService } from '../overages/pricing';

// =====================================================================
// Types
// =====================================================================

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: 'ops' | 'merchant' | 'tenant';
    tenant_id?: string;
  };
}

// =====================================================================
// Create Router
// =====================================================================

export function createOveragesRouter(pool: Pool): Router {
  const router = Router();
  const computeService = new ComputeAmountService(pool);
  const pricingService = new OveragePricingService(pool);

  // ===================================================================
  // MERCHANT ENDPOINTS (Tenant-scoped)
  // ===================================================================

  /**
   * GET /api/overages/merchant/summary
   * Get overage summary for the authenticated tenant
   */
  router.get('/merchant/summary', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user?.tenant_id;
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { start_date, end_date, currency } = req.query;

      const result = await pool.query(
        `
        SELECT
          COUNT(*) as total_overages,
          SUM(amount) as total_amount,
          currency,
          billing_status,
          COUNT(DISTINCT api_key_id) as unique_keys,
          COUNT(DISTINCT metric) as unique_metrics
        FROM billing_overages
        WHERE tenant_id = $1
          AND ($2::timestamp IS NULL OR overage_timestamp >= $2)
          AND ($3::timestamp IS NULL OR overage_timestamp <= $3)
          AND ($4::text IS NULL OR currency = $4)
        GROUP BY currency, billing_status
        ORDER BY currency, billing_status
        `,
        [tenantId, start_date || null, end_date || null, currency || null]
      );

      res.json({
        summary: result.rows,
        tenant_id: tenantId,
      });
    } catch (error: any) {
      console.error('Error fetching merchant summary:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/overages/merchant/list
   * List overage charges for the authenticated tenant
   */
  router.get('/merchant/list', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user?.tenant_id;
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const {
        start_date,
        end_date,
        metric,
        billing_status,
        limit = '100',
        offset = '0',
      } = req.query;

      const result = await pool.query(
        `
        SELECT
          id::text,
          event_id,
          api_key_id,
          plan_id,
          country,
          metric,
          units,
          unit_price,
          amount,
          currency,
          billing_model,
          billing_status,
          billed_at,
          overage_timestamp,
          tier_breakdown
        FROM billing_overages
        WHERE tenant_id = $1
          AND ($2::timestamp IS NULL OR overage_timestamp >= $2)
          AND ($3::timestamp IS NULL OR overage_timestamp <= $3)
          AND ($4::text IS NULL OR metric = $4)
          AND ($5::text IS NULL OR billing_status = $5)
        ORDER BY overage_timestamp DESC
        LIMIT $6 OFFSET $7
        `,
        [
          tenantId,
          start_date || null,
          end_date || null,
          metric || null,
          billing_status || null,
          parseInt(limit as string),
          parseInt(offset as string),
        ]
      );

      // Get total count
      const countResult = await pool.query(
        `
        SELECT COUNT(*) as total
        FROM billing_overages
        WHERE tenant_id = $1
          AND ($2::timestamp IS NULL OR overage_timestamp >= $2)
          AND ($3::timestamp IS NULL OR overage_timestamp <= $3)
          AND ($4::text IS NULL OR metric = $4)
          AND ($5::text IS NULL OR billing_status = $5)
        `,
        [tenantId, start_date || null, end_date || null, metric || null, billing_status || null]
      );

      res.json({
        overages: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
    } catch (error: any) {
      console.error('Error fetching merchant overages:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/overages/merchant/trends
   * Get overage trends for SIRA integration
   */
  router.get('/merchant/trends', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user?.tenant_id;
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await pool.query(
        `
        SELECT
          metric,
          trend_direction,
          growth_rate_percent,
          avg_monthly_amount,
          currency,
          recommendation,
          analyzed_at
        FROM overage_trends
        WHERE tenant_id = $1
        ORDER BY analyzed_at DESC, avg_monthly_amount DESC
        LIMIT 10
        `,
        [tenantId]
      );

      res.json({
        trends: result.rows,
        tenant_id: tenantId,
      });
    } catch (error: any) {
      console.error('Error fetching merchant trends:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===================================================================
  // OPS ENDPOINTS (Global access)
  // ===================================================================

  /**
   * GET /api/overages/ops/summary
   * Get global overage summary (all tenants)
   */
  router.get('/ops/summary', requireOps, async (req: Request, res: Response) => {
    try {
      const { start_date, end_date, tenant_id } = req.query;

      const result = await pool.query(
        `
        SELECT
          COUNT(*) as total_overages,
          SUM(amount) as total_amount,
          currency,
          billing_status,
          COUNT(DISTINCT tenant_id) as unique_tenants,
          COUNT(DISTINCT metric) as unique_metrics
        FROM billing_overages
        WHERE ($1::timestamp IS NULL OR overage_timestamp >= $1)
          AND ($2::timestamp IS NULL OR overage_timestamp <= $2)
          AND ($3::uuid IS NULL OR tenant_id = $3)
        GROUP BY currency, billing_status
        ORDER BY currency, billing_status
        `,
        [start_date || null, end_date || null, tenant_id || null]
      );

      res.json({
        summary: result.rows,
      });
    } catch (error: any) {
      console.error('Error fetching ops summary:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/overages/ops/list
   * List all overage charges (with filters)
   */
  router.get('/ops/list', requireOps, async (req: Request, res: Response) => {
    try {
      const {
        start_date,
        end_date,
        tenant_id,
        metric,
        billing_status,
        limit = '100',
        offset = '0',
      } = req.query;

      const result = await pool.query(
        `
        SELECT
          id::text,
          event_id,
          tenant_id::text,
          api_key_id,
          plan_id,
          country,
          metric,
          units,
          unit_price,
          amount,
          currency,
          billing_model,
          billing_status,
          billed_at,
          overage_timestamp,
          tier_breakdown,
          override_by,
          override_reason
        FROM billing_overages
        WHERE ($1::timestamp IS NULL OR overage_timestamp >= $1)
          AND ($2::timestamp IS NULL OR overage_timestamp <= $2)
          AND ($3::uuid IS NULL OR tenant_id = $3)
          AND ($4::text IS NULL OR metric = $4)
          AND ($5::text IS NULL OR billing_status = $5)
        ORDER BY overage_timestamp DESC
        LIMIT $6 OFFSET $7
        `,
        [
          start_date || null,
          end_date || null,
          tenant_id || null,
          metric || null,
          billing_status || null,
          parseInt(limit as string),
          parseInt(offset as string),
        ]
      );

      const countResult = await pool.query(
        `
        SELECT COUNT(*) as total
        FROM billing_overages
        WHERE ($1::timestamp IS NULL OR overage_timestamp >= $1)
          AND ($2::timestamp IS NULL OR overage_timestamp <= $2)
          AND ($3::uuid IS NULL OR tenant_id = $3)
          AND ($4::text IS NULL OR metric = $4)
          AND ($5::text IS NULL OR billing_status = $5)
        `,
        [start_date || null, end_date || null, tenant_id || null, metric || null, billing_status || null]
      );

      res.json({
        overages: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
    } catch (error: any) {
      console.error('Error fetching ops overages:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/overages/ops/override/void
   * Void an overage charge (Ops only)
   */
  router.post('/ops/override/void', requireOps, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { overage_id, reason } = req.body;
      const opsUserId = req.user?.id;

      if (!overage_id || !reason) {
        return res.status(400).json({ error: 'overage_id and reason are required' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Update overage
        const updateResult = await client.query(
          `
          UPDATE billing_overages
          SET
            billing_status = 'voided',
            override_by = $2,
            override_reason = $3,
            override_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [overage_id, opsUserId, reason]
        );

        if (updateResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Overage not found' });
        }

        // Log override action
        await client.query(
          `
          INSERT INTO overage_overrides (
            overage_id,
            override_type,
            ops_user_id,
            reason,
            original_amount,
            original_currency,
            original_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            overage_id,
            'void',
            opsUserId,
            reason,
            updateResult.rows[0].amount,
            updateResult.rows[0].currency,
            updateResult.rows[0].billing_status,
          ]
        );

        await client.query('COMMIT');

        res.json({
          message: 'Overage voided successfully',
          overage: updateResult.rows[0],
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('Error voiding overage:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/overages/ops/override/credit
   * Issue credit for an overage (Ops only)
   */
  router.post('/ops/override/credit', requireOps, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { overage_id, credit_amount, reason } = req.body;
      const opsUserId = req.user?.id;

      if (!overage_id || !credit_amount || !reason) {
        return res.status(400).json({ error: 'overage_id, credit_amount, and reason are required' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Get original overage
        const overageResult = await client.query(
          'SELECT * FROM billing_overages WHERE id = $1',
          [overage_id]
        );

        if (overageResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Overage not found' });
        }

        const overage = overageResult.rows[0];

        // Create credit entry
        await client.query(
          `
          INSERT INTO billing_overages (
            event_id,
            tenant_id,
            api_key_id,
            plan_id,
            country,
            metric,
            units,
            unit_price,
            amount,
            currency,
            billing_model,
            billing_status,
            overage_timestamp,
            override_by,
            override_reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          `,
          [
            `${overage.event_id}_credit_${Date.now()}`,
            overage.tenant_id,
            overage.api_key_id,
            overage.plan_id,
            overage.country,
            overage.metric,
            0, // No units for credit
            0, // No unit price for credit
            -Math.abs(credit_amount), // Negative amount (credit)
            overage.currency,
            'fixed',
            'pending',
            new Date(),
            opsUserId,
            reason,
          ]
        );

        // Log override action
        await client.query(
          `
          INSERT INTO overage_overrides (
            overage_id,
            override_type,
            ops_user_id,
            reason,
            original_amount,
            new_amount,
            original_currency,
            original_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            overage_id,
            'credit',
            opsUserId,
            reason,
            overage.amount,
            -Math.abs(credit_amount),
            overage.currency,
            overage.billing_status,
          ]
        );

        await client.query('COMMIT');

        res.json({
          message: 'Credit issued successfully',
          credit_amount: -Math.abs(credit_amount),
          currency: overage.currency,
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('Error issuing credit:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/overages/ops/override/adjust
   * Adjust overage amount/units (Ops only)
   */
  router.post('/ops/override/adjust', requireOps, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { overage_id, new_amount, new_units, reason } = req.body;
      const opsUserId = req.user?.id;

      if (!overage_id || !reason) {
        return res.status(400).json({ error: 'overage_id and reason are required' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Get original overage
        const overageResult = await client.query(
          'SELECT * FROM billing_overages WHERE id = $1',
          [overage_id]
        );

        if (overageResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Overage not found' });
        }

        const overage = overageResult.rows[0];

        // Update overage
        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (new_amount !== undefined) {
          updates.push(`amount = $${paramIndex++}`);
          params.push(new_amount);
        }

        if (new_units !== undefined) {
          updates.push(`units = $${paramIndex++}`);
          params.push(new_units);

          // Recalculate unit price
          if (new_units > 0) {
            const newUnitPrice = (new_amount || overage.amount) / new_units;
            updates.push(`unit_price = $${paramIndex++}`);
            params.push(newUnitPrice);
          }
        }

        updates.push(`override_by = $${paramIndex++}`);
        params.push(opsUserId);

        updates.push(`override_reason = $${paramIndex++}`);
        params.push(reason);

        updates.push(`override_at = NOW()`);

        params.push(overage_id);

        const updateResult = await client.query(
          `
          UPDATE billing_overages
          SET ${updates.join(', ')}
          WHERE id = $${paramIndex}
          RETURNING *
          `,
          params
        );

        // Log override action
        await client.query(
          `
          INSERT INTO overage_overrides (
            overage_id,
            override_type,
            ops_user_id,
            reason,
            original_amount,
            new_amount,
            original_units,
            new_units,
            original_currency,
            original_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [
            overage_id,
            'adjust',
            opsUserId,
            reason,
            overage.amount,
            new_amount || overage.amount,
            overage.units,
            new_units || overage.units,
            overage.currency,
            overage.billing_status,
          ]
        );

        await client.query('COMMIT');

        res.json({
          message: 'Overage adjusted successfully',
          overage: updateResult.rows[0],
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('Error adjusting overage:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/overages/ops/pricing
   * Get all pricing rules
   */
  router.get('/ops/pricing', requireOps, async (req: Request, res: Response) => {
    try {
      const { plan_id, country, metric } = req.query;

      const pricing = await pricingService.getAllPricing({
        planId: plan_id as string | undefined,
        country: country as string | undefined,
        metric: metric as string | undefined,
      });

      res.json({ pricing });
    } catch (error: any) {
      console.error('Error fetching pricing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/overages/ops/pricing
   * Create or update pricing rule
   */
  router.post('/ops/pricing', requireOps, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        metric,
        billing_model,
        currency,
        unit_price,
        fixed_amount,
        plan_id,
        country,
        tiers,
      } = req.body;

      const opsUserId = req.user?.id;

      if (!metric || !billing_model || !currency) {
        return res.status(400).json({
          error: 'metric, billing_model, and currency are required',
        });
      }

      const pricing = await pricingService.upsertPricing({
        metric,
        billingModel: billing_model,
        currency,
        unitPrice: unit_price,
        fixedAmount: fixed_amount,
        planId: plan_id,
        country,
        tiers,
        createdBy: opsUserId || 'system',
      });

      res.json({
        message: 'Pricing rule created/updated successfully',
        pricing,
      });
    } catch (error: any) {
      console.error('Error creating/updating pricing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * DELETE /api/overages/ops/pricing
   * Delete pricing rule
   */
  router.delete('/ops/pricing', requireOps, async (req: Request, res: Response) => {
    try {
      const { metric, plan_id, country } = req.query;

      if (!metric) {
        return res.status(400).json({ error: 'metric is required' });
      }

      await pricingService.deletePricing({
        metric: metric as string,
        planId: plan_id as string | undefined,
        country: country as string | undefined,
      });

      res.json({ message: 'Pricing rule deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting pricing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/overages/ops/pricing/preview
   * Preview amount computation for testing pricing rules
   */
  router.post('/ops/pricing/preview', requireOps, async (req: Request, res: Response) => {
    try {
      const { plan_id, country, metric, units_exceeded } = req.body;

      if (!plan_id || !country || !metric || !units_exceeded) {
        return res.status(400).json({
          error: 'plan_id, country, metric, and units_exceeded are required',
        });
      }

      const preview = await computeService.previewAmount({
        planId: plan_id,
        country,
        metric,
        unitsExceeded: units_exceeded,
      });

      res.json({
        preview: {
          ...preview,
          formatted_amount: formatAmount(preview.amount, preview.currency),
          tier_breakdown_formatted: preview.tierBreakdown
            ? formatTierBreakdown(preview.tierBreakdown)
            : null,
        },
      });
    } catch (error: any) {
      console.error('Error previewing pricing:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  /**
   * GET /api/overages/health
   * Health check endpoint
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    } catch (error) {
      res.status(503).json({ status: 'unhealthy', error: 'Database connection failed' });
    }
  });

  return router;
}

// =====================================================================
// Middleware
// =====================================================================

/**
 * Require Ops role
 */
function requireOps(req: AuthenticatedRequest, res: Response, next: Function) {
  if (req.user?.role !== 'ops') {
    return res.status(403).json({ error: 'Forbidden: Ops role required' });
  }
  next();
}
