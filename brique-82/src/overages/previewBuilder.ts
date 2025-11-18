// =====================================================================
// Overage Preview Builder
// =====================================================================
// Builds preview aggregations for overage charges before billing
// Date: 2025-11-12
// =====================================================================

import { pool } from '../db';
import { publishEvent } from '../webhooks/publisher';
import { addDays, format } from 'date-fns';

// =====================================================================
// Types
// =====================================================================

export interface PreviewBuildParams {
  tenantType: string;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  currency?: string;
}

export interface PreviewResult {
  previewId: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  currency: string;
  lineCount: number;
  notifyAt: string;
}

export interface OverageLine {
  id: string;
  metric: string;
  unit_count: number;
  unit_price: number;
  amount: number;
  currency: string;
  billing_model: string;
}

// =====================================================================
// Preview Builder Service
// =====================================================================

export class PreviewBuilderService {
  /**
   * Build or refresh overage preview for a tenant and billing period
   *
   * Process:
   * 1. Create/update preview header
   * 2. Clear old preview lines
   * 3. Aggregate open overages from billing_overages table
   * 4. Create preview lines
   * 5. Update total amount
   * 6. Schedule notification
   */
  async buildOveragePreview(params: PreviewBuildParams): Promise<PreviewResult> {
    const { tenantType, tenantId, periodStart, periodEnd, currency = 'USD' } = params;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      console.log(
        `Building preview for tenant ${tenantId} (${tenantType}) for period ${format(
          periodStart,
          'yyyy-MM-dd'
        )} to ${format(periodEnd, 'yyyy-MM-dd')}`
      );

      // Step 1: Create or update preview header
      const { rows: [preview] } = await client.query(
        `
        INSERT INTO overage_previews (
          tenant_type,
          tenant_id,
          period_start,
          period_end,
          currency,
          total_amount,
          status,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, 0, 'pending', '{}'::jsonb)
        ON CONFLICT (tenant_type, tenant_id, period_start, period_end)
        DO UPDATE SET
          updated_at = NOW(),
          status = CASE
            WHEN overage_previews.status IN ('billed', 'forwarded_to_billing') THEN overage_previews.status
            ELSE 'pending'
          END
        RETURNING *
        `,
        [
          tenantType,
          tenantId,
          format(periodStart, 'yyyy-MM-dd'),
          format(periodEnd, 'yyyy-MM-dd'),
          currency,
        ]
      );

      // Skip if already billed
      if (preview.status === 'billed' || preview.status === 'forwarded_to_billing') {
        await client.query('ROLLBACK');
        console.log(`Preview ${preview.id} already ${preview.status}, skipping`);
        return this.formatResult(preview, 0);
      }

      // Step 2: Clear old preview lines
      await client.query(
        `DELETE FROM overage_preview_lines WHERE preview_id = $1`,
        [preview.id]
      );

      console.log(`Cleared old preview lines for preview ${preview.id}`);

      // Step 3: Aggregate open overages for tenant in period
      const { rows: overages } = await client.query<OverageLine>(
        `
        SELECT
          id::text,
          metric,
          units as unit_count,
          unit_price,
          amount,
          currency,
          billing_model
        FROM billing_overages
        WHERE tenant_id = $1
          AND overage_timestamp::date BETWEEN $2 AND $3
          AND billing_status IN ('pending', 'ready_for_billing')
          AND ($4::text IS NULL OR currency = $4)
        ORDER BY overage_timestamp ASC
        `,
        [tenantId, format(periodStart, 'yyyy-MM-dd'), format(periodEnd, 'yyyy-MM-dd'), currency]
      );

      console.log(`Found ${overages.length} open overages for preview`);

      // Step 4: Create preview lines
      let totalAmount = 0;
      for (const overage of overages) {
        await client.query(
          `
          INSERT INTO overage_preview_lines (
            preview_id,
            overage_id,
            metric,
            unit_count,
            unit_price,
            amount,
            billing_model,
            line_status,
            note
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'included', NULL)
          `,
          [
            preview.id,
            overage.id,
            overage.metric,
            overage.unit_count,
            overage.unit_price,
            overage.amount,
            overage.billing_model,
          ]
        );

        totalAmount += parseFloat(overage.amount.toString());
      }

      console.log(`Created ${overages.length} preview lines, total: ${totalAmount} ${currency}`);

      // Step 5: Update total amount (trigger will also update it, but we do it explicitly)
      await client.query(
        `
        UPDATE overage_previews
        SET
          total_amount = $2,
          updated_at = NOW()
        WHERE id = $1
        `,
        [preview.id, totalAmount]
      );

      // Step 6: Schedule notification
      // Notify 3 days before period end (configurable)
      const notificationLeadDays = parseInt(process.env.PREVIEW_NOTIFICATION_LEAD_DAYS || '3');
      const notifyAt = addDays(periodEnd, -notificationLeadDays);

      console.log(`Scheduling notification for ${format(notifyAt, 'yyyy-MM-dd HH:mm:ss')}`);

      // Publish event for notification scheduler
      await publishEvent(tenantType, tenantId, 'overage.preview_created', {
        preview_id: preview.id,
        notify_at: notifyAt.toISOString(),
        total_amount: totalAmount,
        currency,
        line_count: overages.length,
      });

      // Log audit trail
      await client.query(
        `
        INSERT INTO preview_audit_log (
          preview_id,
          action,
          actor_type,
          actor_id,
          new_status,
          new_amount,
          metadata
        ) VALUES ($1, 'created', 'system', NULL, 'pending', $2, $3::jsonb)
        `,
        [
          preview.id,
          totalAmount,
          JSON.stringify({
            line_count: overages.length,
            period_start: format(periodStart, 'yyyy-MM-dd'),
            period_end: format(periodEnd, 'yyyy-MM-dd'),
          }),
        ]
      );

      await client.query('COMMIT');

      console.log(`Preview ${preview.id} built successfully`);

      return this.formatResult(preview, overages.length, notifyAt);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to build preview:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Build previews for all active tenants
   * (Run as cron job)
   */
  async buildAllPreviews(periodStart: Date, periodEnd: Date): Promise<PreviewResult[]> {
    console.log(
      `Building previews for all tenants for period ${format(
        periodStart,
        'yyyy-MM-dd'
      )} to ${format(periodEnd, 'yyyy-MM-dd')}`
    );

    // Get all tenants with open overages
    const { rows: tenants } = await pool.query<{ tenant_id: string; tenant_type: string }>(
      `
      SELECT DISTINCT tenant_id::text, 'merchant' as tenant_type
      FROM billing_overages
      WHERE overage_timestamp::date BETWEEN $1 AND $2
        AND billing_status IN ('pending', 'ready_for_billing')
      `,
      [format(periodStart, 'yyyy-MM-dd'), format(periodEnd, 'yyyy-MM-dd')]
    );

    console.log(`Found ${tenants.length} tenants with open overages`);

    const results: PreviewResult[] = [];

    for (const tenant of tenants) {
      try {
        const result = await this.buildOveragePreview({
          tenantType: tenant.tenant_type,
          tenantId: tenant.tenant_id,
          periodStart,
          periodEnd,
        });
        results.push(result);
      } catch (error) {
        console.error(`Failed to build preview for tenant ${tenant.tenant_id}:`, error);
        // Continue with next tenant
      }
    }

    console.log(`Built ${results.length} previews successfully`);

    return results;
  }

  /**
   * Refresh existing preview (e.g., after ops adjustment)
   */
  async refreshPreview(previewId: string): Promise<void> {
    console.log(`Refreshing preview ${previewId}`);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get preview details
      const { rows: [preview] } = await pool.query(
        `SELECT * FROM overage_previews WHERE id = $1`,
        [previewId]
      );

      if (!preview) {
        throw new Error(`Preview ${previewId} not found`);
      }

      // Rebuild preview
      await this.buildOveragePreview({
        tenantType: preview.tenant_type,
        tenantId: preview.tenant_id,
        periodStart: new Date(preview.period_start),
        periodEnd: new Date(preview.period_end),
        currency: preview.currency,
      });

      await client.query('COMMIT');

      console.log(`Preview ${previewId} refreshed successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Format result for API response
   */
  private formatResult(
    preview: any,
    lineCount: number,
    notifyAt?: Date
  ): PreviewResult {
    return {
      previewId: preview.id,
      tenantId: preview.tenant_id,
      periodStart: format(new Date(preview.period_start), 'yyyy-MM-dd'),
      periodEnd: format(new Date(preview.period_end), 'yyyy-MM-dd'),
      totalAmount: parseFloat(preview.total_amount),
      currency: preview.currency,
      lineCount,
      notifyAt: notifyAt ? notifyAt.toISOString() : '',
    };
  }
}

// =====================================================================
// Exported Instance
// =====================================================================

export const previewBuilder = new PreviewBuilderService();

// =====================================================================
// CLI Entry Point (for cron jobs)
// =====================================================================

if (require.main === module) {
  const command = process.argv[2];

  if (command === 'build-all') {
    // Build previews for current month
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    previewBuilder
      .buildAllPreviews(periodStart, periodEnd)
      .then((results) => {
        console.log(`Built ${results.length} previews`);
        process.exit(0);
      })
      .catch((error) => {
        console.error('Failed to build previews:', error);
        process.exit(1);
      });
  } else if (command === 'build-one') {
    const tenantId = process.argv[3];
    if (!tenantId) {
      console.error('Usage: node previewBuilder.js build-one <tenant_id>');
      process.exit(1);
    }

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    previewBuilder
      .buildOveragePreview({
        tenantType: 'merchant',
        tenantId,
        periodStart,
        periodEnd,
      })
      .then((result) => {
        console.log('Preview built:', result);
        process.exit(0);
      })
      .catch((error) => {
        console.error('Failed to build preview:', error);
        process.exit(1);
      });
  } else {
    console.error('Usage: node previewBuilder.js [build-all|build-one <tenant_id>]');
    process.exit(1);
  }
}
