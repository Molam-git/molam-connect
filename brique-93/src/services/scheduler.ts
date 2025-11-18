// Scheduler Service
// Core scheduling logic for batch plan generation and execution

import { pool, withTransaction } from '../utils/db';
import { simulateRouting } from './sira-client';

interface PlanRequest {
  treasury_account_id: string;
  planned_for?: Date;
  max_items?: number;
  priority?: number;
  currency?: string;
  created_by: string;
}

interface GeneratedPlan {
  id: string;
  plan_reference: string;
  item_count: number;
  estimated_total: number;
  estimated_fees: any;
  sira_score: number;
  requires_approval: boolean;
  status: string;
}

const AUTO_APPROVE_THRESHOLD = parseFloat(process.env.AUTO_APPROVE_THRESHOLD || '10000');

/**
 * Scheduler Service
 */
export class SchedulerService {
  /**
   * Compute next settlement window for a treasury account
   */
  async computeNextWindow(treasury_account_id: string, currency: string): Promise<Date> {
    const { rows } = await pool.query(
      `SELECT * FROM payout_windows
       WHERE treasury_account_id = $1
         AND currency = $2
         AND is_active = true
       LIMIT 1`,
      [treasury_account_id, currency]
    );

    if (rows.length === 0) {
      // No window configured, default to 1 hour from now
      const defaultWindow = new Date();
      defaultWindow.setHours(defaultWindow.getHours() + 1);
      return defaultWindow;
    }

    const window = rows[0];

    // Use helper function to compute next window
    const { rows: nextWindows } = await pool.query(
      `SELECT compute_next_window($1::TIME, $2::TEXT, $3::INTEGER) as next_window`,
      [window.cutoff_time, window.timezone, window.settlement_delay_days]
    );

    return new Date(nextWindows[0].next_window);
  }

  /**
   * Generate a batch plan
   */
  async generatePlan(request: PlanRequest): Promise<GeneratedPlan> {
    console.log(`[Scheduler] Generating plan for treasury ${request.treasury_account_id}`);

    // 1. Determine planned execution time
    const planned_for = request.planned_for || await this.computeNextWindow(
      request.treasury_account_id,
      request.currency || 'USD'
    );

    // 2. Fetch pending payouts matching criteria
    const pendingPayouts = await this.fetchPendingPayouts({
      treasury_account_id: request.treasury_account_id,
      currency: request.currency,
      priority: request.priority || 100,
      max_items: request.max_items || 500,
      scheduled_before: planned_for
    });

    if (pendingPayouts.length === 0) {
      throw new Error('No pending payouts found for scheduling');
    }

    console.log(`[Scheduler] Found ${pendingPayouts.length} pending payouts`);

    // 3. Check quotas
    await this.checkQuotas(request.treasury_account_id, pendingPayouts);

    // 4. Simulate routing with SIRA
    const simulation = await simulateRouting(
      pendingPayouts.map(p => ({
        payout_id: p.id,
        amount: parseFloat(p.amount),
        currency: p.currency,
        origin_module: p.origin_module,
        priority: p.priority
      })),
      request.treasury_account_id
    );

    // 5. Determine if approval is required
    const requires_approval = simulation.total > AUTO_APPROVE_THRESHOLD ||
                               simulation.sira_score < 0.7 ||
                               simulation.risk_flags.length > 0;

    // 6. Create plan record
    const plan = await withTransaction(async (client) => {
      const { rows: plans } = await client.query(
        `INSERT INTO payout_batch_plans (
          created_by,
          planned_for,
          treasury_account_id,
          bank_profile_id,
          currency,
          items,
          item_count,
          estimated_total,
          estimated_fees,
          sira_score,
          sira_recommendation,
          requires_approval,
          approval_threshold,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          request.created_by,
          planned_for,
          request.treasury_account_id,
          simulation.bank_profile_id,
          simulation.currency,
          JSON.stringify(simulation.items),
          simulation.items.length,
          simulation.total,
          JSON.stringify(simulation.estimated_fees),
          simulation.sira_score,
          JSON.stringify({ recommendations: simulation.recommendations, risk_flags: simulation.risk_flags }),
          requires_approval,
          AUTO_APPROVE_THRESHOLD,
          requires_approval ? 'pending_approval' : 'draft'
        ]
      );

      const plan = plans[0];

      // Create schedules for each payout
      for (const item of simulation.items) {
        await client.query(
          `INSERT INTO payout_schedules (payout_id, plan_id, scheduled_at, priority, status)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (payout_id, status) WHERE status = 'scheduled' DO NOTHING`,
          [item.payout_id, plan.id, planned_for, request.priority || 10, 'scheduled']
        );

        // Record scheduling history
        await client.query(
          `INSERT INTO scheduling_history (payout_id, plan_id, action, actor_type, actor_id, new_scheduled_at, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            item.payout_id,
            plan.id,
            'allocated',
            'user',
            request.created_by,
            planned_for,
            JSON.stringify({ sira_score: simulation.sira_score })
          ]
        );
      }

      // Create approval if required
      if (requires_approval) {
        await client.query(
          `INSERT INTO approvals (entity_type, entity_id, required_count, required_roles, status)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'batch_plan',
            plan.id,
            2, // Default: require 2 approvals
            JSON.stringify(['finance_ops', 'treasury_manager']),
            'pending'
          ]
        );
      }

      return plan;
    });

    console.log(`[Scheduler] ✓ Created plan ${plan.plan_reference} with ${simulation.items.length} items`);

    return {
      id: plan.id,
      plan_reference: plan.plan_reference,
      item_count: plan.item_count,
      estimated_total: parseFloat(plan.estimated_total),
      estimated_fees: plan.estimated_fees,
      sira_score: parseFloat(plan.sira_score),
      requires_approval: plan.requires_approval,
      status: plan.status
    };
  }

  /**
   * Fetch pending payouts matching criteria
   */
  private async fetchPendingPayouts(criteria: {
    treasury_account_id: string;
    currency?: string;
    priority: number;
    max_items: number;
    scheduled_before: Date;
  }): Promise<any[]> {
    let query = `
      SELECT p.*
      FROM payouts p
      LEFT JOIN payout_schedules ps ON ps.payout_id = p.id AND ps.status = 'scheduled'
      WHERE p.status = 'reserved'
        AND p.treasury_account_id = $1
        AND p.priority <= $2
        AND p.scheduled_for <= $3
        AND ps.id IS NULL
    `;

    const params: any[] = [
      criteria.treasury_account_id,
      criteria.priority,
      criteria.scheduled_before
    ];

    if (criteria.currency) {
      query += ` AND p.currency = $${params.length + 1}`;
      params.push(criteria.currency);
    }

    query += ` ORDER BY p.priority ASC, p.scheduled_for ASC LIMIT $${params.length + 1}`;
    params.push(criteria.max_items);

    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Check quotas and rate limits
   */
  private async checkQuotas(treasury_account_id: string, payouts: any[]): Promise<void> {
    const total_amount = payouts.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const total_count = payouts.length;

    // Check treasury account quota
    const { rows: quotas } = await pool.query(
      `SELECT * FROM payout_quotas
       WHERE scope_type = 'treasury_account'
         AND scope_id = $1
         AND period = 'daily'
         AND is_active = true`,
      [treasury_account_id]
    );

    for (const quota of quotas) {
      if (quota.max_amount && (parseFloat(quota.current_amount) + total_amount) > parseFloat(quota.max_amount)) {
        throw new Error(`Daily amount quota exceeded for treasury account`);
      }

      if (quota.max_count && (quota.current_count + total_count) > quota.max_count) {
        throw new Error(`Daily count quota exceeded for treasury account`);
      }
    }
  }

  /**
   * Execute a plan
   */
  async executePlan(plan_id: string, executed_by: string): Promise<{
    success: boolean;
    batch_id?: string;
    error?: string;
  }> {
    console.log(`[Scheduler] Executing plan ${plan_id}`);

    return withTransaction(async (client) => {
      // 1. Fetch plan
      const { rows: plans } = await client.query(
        `SELECT * FROM payout_batch_plans WHERE id = $1 FOR UPDATE`,
        [plan_id]
      );

      if (plans.length === 0) {
        throw new Error('Plan not found');
      }

      const plan = plans[0];

      // 2. Check status
      if (plan.status !== 'approved' && plan.status !== 'draft') {
        throw new Error(`Cannot execute plan with status: ${plan.status}`);
      }

      // 3. Check approvals if required
      if (plan.requires_approval) {
        const approved = await this.checkApprovals(plan_id);
        if (!approved) {
          throw new Error('Plan requires approvals');
        }
      }

      // 4. Create payout_batch (from B92)
      const batch_ref = `BATCH-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

      const { rows: batches } = await client.query(
        `INSERT INTO payout_batches (
          batch_ref,
          created_by,
          scheduled_for,
          status,
          stats,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          batch_ref,
          executed_by,
          plan.planned_for,
          'queued',
          JSON.stringify({
            count: plan.item_count,
            amount: plan.estimated_total
          }),
          JSON.stringify({
            plan_id: plan.id,
            plan_reference: plan.plan_reference
          })
        ]
      );

      const batch = batches[0];

      // 5. Enqueue payouts
      const items = plan.items; // JSONB array

      for (const item of items) {
        // Insert into payout_queue with scheduled time
        await client.query(
          `INSERT INTO payout_queue (payout_id, next_attempt_at, priority, status)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (payout_id) DO UPDATE
           SET next_attempt_at = EXCLUDED.next_attempt_at,
               status = 'ready'`,
          [item.payout_id, plan.planned_for, 10, 'ready']
        );

        // Update payout status
        await client.query(
          `UPDATE payouts
           SET status = 'processing',
               updated_at = now()
           WHERE id = $1`,
          [item.payout_id]
        );

        // Update schedule status
        await client.query(
          `UPDATE payout_schedules
           SET status = 'executed',
               executed_at = now()
           WHERE payout_id = $1 AND plan_id = $2`,
          [item.payout_id, plan.id]
        );
      }

      // 6. Update plan status
      await client.query(
        `UPDATE payout_batch_plans
         SET status = 'executed',
             batch_id = $2,
             executed_at = now(),
             executed_by = $3,
             updated_at = now()
         WHERE id = $1`,
        [plan.id, batch.id, executed_by]
      );

      // 7. Update quotas
      await this.updateQuotas(client, plan.treasury_account_id, plan.item_count, parseFloat(plan.estimated_total));

      console.log(`[Scheduler] ✓ Plan ${plan.plan_reference} executed as batch ${batch_ref}`);

      return {
        success: true,
        batch_id: batch.id
      };
    });
  }

  /**
   * Check if plan has sufficient approvals
   */
  private async checkApprovals(plan_id: string): Promise<boolean> {
    const { rows } = await pool.query(
      `SELECT is_approval_complete(id) as complete
       FROM approvals
       WHERE entity_type = 'batch_plan'
         AND entity_id = $1
         AND status = 'pending'
       LIMIT 1`,
      [plan_id]
    );

    return rows.length > 0 && rows[0].complete;
  }

  /**
   * Update quotas after execution
   */
  private async updateQuotas(client: any, treasury_account_id: string, count: number, amount: number): Promise<void> {
    await client.query(
      `UPDATE payout_quotas
       SET current_count = current_count + $2,
           current_amount = current_amount + $3,
           updated_at = now()
       WHERE scope_type = 'treasury_account'
         AND scope_id = $1
         AND period = 'daily'`,
      [treasury_account_id, count, amount]
    );
  }

  /**
   * Cancel a plan
   */
  async cancelPlan(plan_id: string, cancelled_by: string, reason: string): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE payout_batch_plans
         SET status = 'cancelled',
             cancelled_at = now(),
             notes = COALESCE(notes, '') || ' | Cancelled: ' || $2
         WHERE id = $1`,
        [plan_id, reason]
      );

      await client.query(
        `UPDATE payout_schedules
         SET status = 'cancelled'
         WHERE plan_id = $1 AND status = 'scheduled'`,
        [plan_id]
      );
    });

    console.log(`[Scheduler] ✗ Plan ${plan_id} cancelled by ${cancelled_by}: ${reason}`);
  }
}

export default new SchedulerService();
