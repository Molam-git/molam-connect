// Float Manager Service
// Manages treasury float snapshots and sweep rule evaluation

import { pool, withTransaction } from '../utils/db';

interface TreasuryAccount {
  id: string;
  bank_profile_id: string;
  account_name: string;
  currency: string;
  current_balance: number;
  available_balance: number;
  last_snapshot_at?: Date;
}

interface SweepRule {
  id: string;
  treasury_account_id: string;
  target_account_id: string;
  currency: string;
  min_threshold: number;
  max_threshold: number;
  target_balance?: number;
  auto_execute: boolean;
  priority: string;
  is_active: boolean;
}

interface SweepRecommendation {
  rule_id: string;
  from_account_id: string;
  to_account_id: string;
  currency: string;
  amount: number;
  reason: string;
  current_balance: number;
  target_balance?: number;
  priority: string;
  auto_execute: boolean;
}

interface BalanceSnapshot {
  treasury_account_id: string;
  balance: number;
  available_balance: number;
  currency: string;
  timestamp: Date;
}

/**
 * Float Manager Service
 */
export class FloatManager {
  /**
   * Take snapshots of all treasury accounts
   */
  async takeSnapshots(): Promise<BalanceSnapshot[]> {
    const snapshots: BalanceSnapshot[] = [];

    return withTransaction(async (client) => {
      // Get all active treasury accounts
      const { rows: accounts } = await client.query<TreasuryAccount>(
        `SELECT id, bank_profile_id, account_name, currency, current_balance, available_balance, last_snapshot_at
         FROM treasury_accounts
         WHERE is_active = true`
      );

      console.log(`[FloatManager] Taking snapshots for ${accounts.length} accounts`);

      for (const account of accounts) {
        // Fetch current balance from bank (in production, this would call bank API)
        const currentBalance = await this.fetchAccountBalance(account);

        // Insert snapshot
        await client.query(
          `INSERT INTO treasury_float_snapshots (
            treasury_account_id,
            balance,
            available_balance,
            currency,
            snapshot_at,
            metadata
          ) VALUES ($1, $2, $3, $4, NOW(), $5::jsonb)`,
          [
            account.id,
            currentBalance.balance,
            currentBalance.available_balance,
            account.currency,
            JSON.stringify({
              previous_balance: account.current_balance,
              balance_change: currentBalance.balance - account.current_balance
            })
          ]
        );

        // Update treasury account with latest balance
        await client.query(
          `UPDATE treasury_accounts
           SET current_balance = $1,
               available_balance = $2,
               last_snapshot_at = NOW(),
               updated_at = NOW()
           WHERE id = $3`,
          [currentBalance.balance, currentBalance.available_balance, account.id]
        );

        snapshots.push({
          treasury_account_id: account.id,
          balance: currentBalance.balance,
          available_balance: currentBalance.available_balance,
          currency: account.currency,
          timestamp: new Date()
        });
      }

      console.log(`[FloatManager] Completed ${snapshots.length} snapshots`);
      return snapshots;
    });
  }

  /**
   * Fetch current balance from bank
   * In production, this would call the bank API
   */
  private async fetchAccountBalance(account: TreasuryAccount): Promise<{ balance: number; available_balance: number }> {
    // TODO: Implement actual bank API calls
    // For now, return current balance (assuming it's already updated from statement ingestion)

    const { rows } = await pool.query(
      `SELECT current_balance, available_balance
       FROM treasury_accounts
       WHERE id = $1`,
      [account.id]
    );

    if (rows.length === 0) {
      return { balance: 0, available_balance: 0 };
    }

    return {
      balance: parseFloat(rows[0].current_balance),
      available_balance: parseFloat(rows[0].available_balance)
    };
  }

  /**
   * Evaluate sweep rules for all accounts
   */
  async evaluateSweepRules(): Promise<SweepRecommendation[]> {
    const recommendations: SweepRecommendation[] = [];

    // Get all active sweep rules
    const { rows: rules } = await pool.query<SweepRule>(
      `SELECT sr.id, sr.treasury_account_id, sr.target_account_id, sr.currency,
              sr.min_threshold, sr.max_threshold, sr.target_balance,
              sr.auto_execute, sr.priority, sr.is_active
       FROM sweep_rules sr
       JOIN treasury_accounts ta ON ta.id = sr.treasury_account_id
       WHERE sr.is_active = true
         AND ta.is_active = true`
    );

    console.log(`[FloatManager] Evaluating ${rules.length} sweep rules`);

    for (const rule of rules) {
      const recommendation = await this.evaluateSweepRule(rule);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    console.log(`[FloatManager] Generated ${recommendations.length} sweep recommendations`);
    return recommendations;
  }

  /**
   * Evaluate a single sweep rule
   */
  private async evaluateSweepRule(rule: SweepRule): Promise<SweepRecommendation | null> {
    // Get current account balance
    const { rows: accounts } = await pool.query(
      `SELECT id, current_balance, available_balance, currency
       FROM treasury_accounts
       WHERE id = $1`,
      [rule.treasury_account_id]
    );

    if (accounts.length === 0) {
      console.warn(`[FloatManager] Account ${rule.treasury_account_id} not found`);
      return null;
    }

    const account = accounts[0];
    const current_balance = parseFloat(account.available_balance);

    // Check if balance is below min threshold (need to sweep IN)
    if (current_balance < rule.min_threshold) {
      const target = rule.target_balance || rule.min_threshold;
      const amount = target - current_balance;

      return {
        rule_id: rule.id,
        from_account_id: rule.target_account_id,
        to_account_id: rule.treasury_account_id,
        currency: rule.currency,
        amount: Math.abs(amount),
        reason: 'below_min_threshold',
        current_balance,
        target_balance: target,
        priority: rule.priority,
        auto_execute: rule.auto_execute
      };
    }

    // Check if balance is above max threshold (need to sweep OUT)
    if (current_balance > rule.max_threshold) {
      const target = rule.target_balance || rule.max_threshold;
      const amount = current_balance - target;

      return {
        rule_id: rule.id,
        from_account_id: rule.treasury_account_id,
        to_account_id: rule.target_account_id,
        currency: rule.currency,
        amount: Math.abs(amount),
        reason: 'above_max_threshold',
        current_balance,
        target_balance: target,
        priority: rule.priority,
        auto_execute: rule.auto_execute
      };
    }

    // Balance is within range
    return null;
  }

  /**
   * Execute auto-sweep recommendations
   */
  async executeAutoSweeps(recommendations: SweepRecommendation[]): Promise<number> {
    let executedCount = 0;

    const autoRecommendations = recommendations.filter(r => r.auto_execute);

    console.log(`[FloatManager] Executing ${autoRecommendations.length} auto-sweeps`);

    for (const recommendation of autoRecommendations) {
      try {
        await this.executeSweep(recommendation);
        executedCount++;
      } catch (error) {
        console.error(`[FloatManager] Error executing sweep:`, error);
      }
    }

    return executedCount;
  }

  /**
   * Execute a single sweep
   */
  private async executeSweep(recommendation: SweepRecommendation): Promise<void> {
    return withTransaction(async (client) => {
      // Create treasury plan for the sweep
      const plan_reference = `SWEEP-${Date.now()}-${recommendation.rule_id.substring(0, 8)}`;

      const { rows: plans } = await client.query(
        `INSERT INTO treasury_plans (
          plan_reference,
          status,
          total_estimated_cost,
          requires_approval,
          created_by,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id`,
        [
          plan_reference,
          'auto_approved',
          0, // No cost for internal sweeps
          false,
          'system'
        ]
      );

      const plan_id = plans[0].id;

      // Create plan action
      await client.query(
        `INSERT INTO treasury_plan_actions (
          plan_id,
          action_type,
          from_account_id,
          to_account_id,
          currency,
          amount,
          status,
          priority,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())`,
        [
          plan_id,
          'sweep',
          recommendation.from_account_id,
          recommendation.to_account_id,
          recommendation.currency,
          recommendation.amount,
          'pending',
          recommendation.priority,
          JSON.stringify({
            rule_id: recommendation.rule_id,
            reason: recommendation.reason,
            current_balance: recommendation.current_balance,
            target_balance: recommendation.target_balance
          })
        ]
      );

      // Update treasury account balances (optimistic update)
      await client.query(
        `UPDATE treasury_accounts
         SET available_balance = available_balance - $1,
             updated_at = NOW()
         WHERE id = $2`,
        [recommendation.amount, recommendation.from_account_id]
      );

      await client.query(
        `UPDATE treasury_accounts
         SET available_balance = available_balance + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [recommendation.amount, recommendation.to_account_id]
      );

      // Update plan status to executing
      await client.query(
        `UPDATE treasury_plans
         SET status = 'executing',
             executed_at = NOW()
         WHERE id = $1`,
        [plan_id]
      );

      console.log(`[FloatManager] ✓ Executed auto-sweep: ${recommendation.currency} ${recommendation.amount} (${recommendation.reason})`);
    });
  }

  /**
   * Create manual sweep recommendations (for ops team review)
   */
  async createManualSweepRecommendations(recommendations: SweepRecommendation[]): Promise<number> {
    let createdCount = 0;

    const manualRecommendations = recommendations.filter(r => !r.auto_execute);

    console.log(`[FloatManager] Creating ${manualRecommendations.length} manual sweep recommendations`);

    for (const recommendation of manualRecommendations) {
      try {
        await this.createSweepRecommendation(recommendation);
        createdCount++;
      } catch (error) {
        console.error(`[FloatManager] Error creating recommendation:`, error);
      }
    }

    return createdCount;
  }

  /**
   * Create a sweep recommendation for manual review
   */
  private async createSweepRecommendation(recommendation: SweepRecommendation): Promise<void> {
    const plan_reference = `SWEEP-DRAFT-${Date.now()}-${recommendation.rule_id.substring(0, 8)}`;

    return withTransaction(async (client) => {
      // Create draft treasury plan
      const { rows: plans } = await client.query(
        `INSERT INTO treasury_plans (
          plan_reference,
          status,
          total_estimated_cost,
          requires_approval,
          created_by,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id`,
        [
          plan_reference,
          'draft',
          0,
          true,
          'system'
        ]
      );

      const plan_id = plans[0].id;

      // Create plan action
      await client.query(
        `INSERT INTO treasury_plan_actions (
          plan_id,
          action_type,
          from_account_id,
          to_account_id,
          currency,
          amount,
          status,
          priority,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())`,
        [
          plan_id,
          'sweep',
          recommendation.from_account_id,
          recommendation.to_account_id,
          recommendation.currency,
          recommendation.amount,
          'draft',
          recommendation.priority,
          JSON.stringify({
            rule_id: recommendation.rule_id,
            reason: recommendation.reason,
            current_balance: recommendation.current_balance,
            target_balance: recommendation.target_balance,
            requires_manual_approval: true
          })
        ]
      );

      console.log(`[FloatManager] ✓ Created manual sweep recommendation: ${plan_reference}`);
    });
  }

  /**
   * Get float metrics for monitoring
   */
  async getFloatMetrics(): Promise<any> {
    const { rows } = await pool.query(
      `SELECT
         ta.currency,
         COUNT(DISTINCT ta.id) as account_count,
         SUM(ta.current_balance) as total_balance,
         SUM(ta.available_balance) as total_available,
         AVG(ta.current_balance) as avg_balance,
         MIN(ta.current_balance) as min_balance,
         MAX(ta.current_balance) as max_balance
       FROM treasury_accounts ta
       WHERE ta.is_active = true
       GROUP BY ta.currency`
    );

    return rows.map(row => ({
      currency: row.currency,
      account_count: parseInt(row.account_count),
      total_balance: parseFloat(row.total_balance),
      total_available: parseFloat(row.total_available),
      avg_balance: parseFloat(row.avg_balance),
      min_balance: parseFloat(row.min_balance),
      max_balance: parseFloat(row.max_balance)
    }));
  }
}

export default FloatManager;
