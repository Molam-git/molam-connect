// Treasury Plan Executor Service
// Executes approved treasury plans and handles rollback

import { pool, withTransaction } from '../utils/db';

interface TreasuryPlan {
  id: string;
  plan_reference: string;
  status: string;
  total_estimated_cost: number;
  created_by: string;
  approved_by: string[];
}

interface PlanAction {
  id: string;
  plan_id: string;
  action_type: string;
  from_account_id?: string;
  to_account_id?: string;
  currency: string;
  amount: number;
  status: string;
  priority: string;
  estimated_cost: number;
  metadata?: any;
}

interface ExecutionResult {
  success: boolean;
  executed_actions: number;
  failed_actions: number;
  errors: string[];
}

/**
 * Treasury Plan Executor
 */
export class PlanExecutor {
  /**
   * Execute an approved plan
   */
  async executePlan(plan_id: string): Promise<ExecutionResult> {
    console.log(`[PlanExecutor] Executing plan ${plan_id}`);

    const result: ExecutionResult = {
      success: false,
      executed_actions: 0,
      failed_actions: 0,
      errors: []
    };

    try {
      // Fetch plan
      const { rows: plans } = await pool.query<TreasuryPlan>(
        `SELECT id, plan_reference, status, total_estimated_cost, created_by, approved_by
         FROM treasury_plans
         WHERE id = $1`,
        [plan_id]
      );

      if (plans.length === 0) {
        throw new Error(`Plan ${plan_id} not found`);
      }

      const plan = plans[0];

      // Validate plan status
      if (plan.status !== 'approved') {
        throw new Error(`Plan ${plan.plan_reference} is not approved (status: ${plan.status})`);
      }

      // Update plan status to executing
      await pool.query(
        `UPDATE treasury_plans
         SET status = 'executing',
             executed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [plan_id]
      );

      // Fetch all actions
      const { rows: actions } = await pool.query<PlanAction>(
        `SELECT id, plan_id, action_type, from_account_id, to_account_id,
                currency, amount, status, priority, estimated_cost, metadata
         FROM treasury_plan_actions
         WHERE plan_id = $1
         ORDER BY priority DESC, created_at ASC`,
        [plan_id]
      );

      console.log(`[PlanExecutor] Executing ${actions.length} actions for plan ${plan.plan_reference}`);

      // Execute actions in order
      for (const action of actions) {
        try {
          await this.executeAction(action);
          result.executed_actions++;
        } catch (error: any) {
          console.error(`[PlanExecutor] Error executing action ${action.id}:`, error);
          result.failed_actions++;
          result.errors.push(`Action ${action.id}: ${error.message}`);

          // Mark action as failed
          await pool.query(
            `UPDATE treasury_plan_actions
             SET status = 'failed',
                 error_message = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [error.message, action.id]
          );
        }
      }

      // Determine final plan status
      const finalStatus = result.failed_actions === 0 ? 'completed' : 'partially_completed';

      await pool.query(
        `UPDATE treasury_plans
         SET status = $1,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [finalStatus, plan_id]
      );

      result.success = result.failed_actions === 0;

      console.log(`[PlanExecutor] ✓ Plan ${plan.plan_reference} execution complete: ${result.executed_actions} succeeded, ${result.failed_actions} failed`);

      return result;

    } catch (error: any) {
      console.error(`[PlanExecutor] Fatal error executing plan ${plan_id}:`, error);

      // Mark plan as failed
      await pool.query(
        `UPDATE treasury_plans
         SET status = 'failed',
             error_message = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [error.message, plan_id]
      );

      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * Execute a single plan action
   */
  private async executeAction(action: PlanAction): Promise<void> {
    console.log(`[PlanExecutor] Executing ${action.action_type} action ${action.id}`);

    // Update action status to executing
    await pool.query(
      `UPDATE treasury_plan_actions
       SET status = 'executing',
           executed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [action.id]
    );

    // Execute based on action type
    switch (action.action_type) {
      case 'fx_trade':
        await this.executeFXTrade(action);
        break;

      case 'sweep':
        await this.executeSweep(action);
        break;

      case 'transfer':
        await this.executeTransfer(action);
        break;

      default:
        throw new Error(`Unknown action type: ${action.action_type}`);
    }

    // Mark action as completed
    await pool.query(
      `UPDATE treasury_plan_actions
       SET status = 'completed',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [action.id]
    );

    console.log(`[PlanExecutor] ✓ Completed ${action.action_type} action ${action.id}`);
  }

  /**
   * Execute FX trade
   */
  private async executeFXTrade(action: PlanAction): Promise<void> {
    const metadata = action.metadata || {};
    const from_currency = metadata.from_currency;
    const to_currency = metadata.to_currency;

    if (!from_currency || !to_currency) {
      throw new Error('FX trade missing currency information');
    }

    return withTransaction(async (client) => {
      // Get best available quote
      const { rows: quotes } = await client.query(
        `SELECT id, exchange_rate, to_amount, provider, total_cost
         FROM fx_quotes
         WHERE from_currency = $1
           AND to_currency = $2
           AND from_amount = $3
           AND expires_at > NOW()
         ORDER BY total_cost ASC
         LIMIT 1`,
        [from_currency, to_currency, action.amount]
      );

      if (quotes.length === 0) {
        throw new Error('No valid FX quotes available');
      }

      const quote = quotes[0];

      // Execute trade with provider (in production, call actual API)
      const trade = await this.executeFXTradeWithProvider(
        quote.provider,
        from_currency,
        to_currency,
        action.amount,
        quote.exchange_rate
      );

      // Record trade
      await client.query(
        `INSERT INTO fx_trades (
          plan_action_id,
          quote_id,
          from_currency,
          to_currency,
          from_amount,
          to_amount,
          exchange_rate,
          provider,
          provider_trade_id,
          fee_amount,
          total_cost,
          status,
          executed_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
        [
          action.id,
          quote.id,
          from_currency,
          to_currency,
          action.amount,
          quote.to_amount,
          quote.exchange_rate,
          quote.provider,
          trade.trade_id,
          quote.total_cost,
          quote.total_cost,
          'completed'
        ]
      );

      console.log(`[PlanExecutor] ✓ Executed FX trade: ${from_currency} ${action.amount} → ${to_currency} ${quote.to_amount} (rate: ${quote.exchange_rate})`);
    });
  }

  /**
   * Execute FX trade with provider
   * In production, this would call actual FX provider API
   */
  private async executeFXTradeWithProvider(
    provider: string,
    from_currency: string,
    to_currency: string,
    from_amount: number,
    exchange_rate: number
  ): Promise<{ trade_id: string; status: string }> {
    // TODO: Implement actual provider API calls
    // For now, simulate successful trade

    console.log(`[PlanExecutor] Executing trade with ${provider}`);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      trade_id: `TRADE-${provider}-${Date.now()}`,
      status: 'completed'
    };
  }

  /**
   * Execute sweep
   */
  private async executeSweep(action: PlanAction): Promise<void> {
    if (!action.from_account_id || !action.to_account_id) {
      throw new Error('Sweep missing account IDs');
    }

    return withTransaction(async (client) => {
      // Verify sufficient balance
      const { rows: accounts } = await client.query(
        `SELECT id, available_balance, currency
         FROM treasury_accounts
         WHERE id = $1
         FOR UPDATE`,
        [action.from_account_id]
      );

      if (accounts.length === 0) {
        throw new Error(`Account ${action.from_account_id} not found`);
      }

      const available_balance = parseFloat(accounts[0].available_balance);
      if (available_balance < action.amount) {
        throw new Error(`Insufficient balance: ${available_balance} < ${action.amount}`);
      }

      // Debit from account
      await client.query(
        `UPDATE treasury_accounts
         SET available_balance = available_balance - $1,
             current_balance = current_balance - $1,
             updated_at = NOW()
         WHERE id = $2`,
        [action.amount, action.from_account_id]
      );

      // Credit to account
      await client.query(
        `UPDATE treasury_accounts
         SET available_balance = available_balance + $1,
             current_balance = current_balance + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [action.amount, action.to_account_id]
      );

      console.log(`[PlanExecutor] ✓ Executed sweep: ${action.currency} ${action.amount} from ${action.from_account_id} to ${action.to_account_id}`);
    });
  }

  /**
   * Execute transfer
   */
  private async executeTransfer(action: PlanAction): Promise<void> {
    // Transfer is similar to sweep but may involve external bank transfers
    // For now, treat it the same as sweep
    await this.executeSweep(action);
  }

  /**
   * Rollback a plan (reverse all completed actions)
   */
  async rollbackPlan(plan_id: string, rolled_back_by: string, reason: string): Promise<ExecutionResult> {
    console.log(`[PlanExecutor] Rolling back plan ${plan_id}`);

    const result: ExecutionResult = {
      success: false,
      executed_actions: 0,
      failed_actions: 0,
      errors: []
    };

    try {
      // Fetch completed actions in reverse order
      const { rows: actions } = await pool.query<PlanAction>(
        `SELECT id, plan_id, action_type, from_account_id, to_account_id,
                currency, amount, status, priority, estimated_cost, metadata
         FROM treasury_plan_actions
         WHERE plan_id = $1
           AND status = 'completed'
         ORDER BY completed_at DESC`,
        [plan_id]
      );

      console.log(`[PlanExecutor] Rolling back ${actions.length} actions`);

      for (const action of actions) {
        try {
          await this.rollbackAction(action);
          result.executed_actions++;
        } catch (error: any) {
          console.error(`[PlanExecutor] Error rolling back action ${action.id}:`, error);
          result.failed_actions++;
          result.errors.push(`Action ${action.id}: ${error.message}`);
        }
      }

      // Update plan status
      await pool.query(
        `UPDATE treasury_plans
         SET status = 'rolled_back',
             rolled_back_at = NOW(),
             rolled_back_by = $1,
             rollback_reason = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [rolled_back_by, reason, plan_id]
      );

      result.success = result.failed_actions === 0;

      console.log(`[PlanExecutor] ✓ Rollback complete: ${result.executed_actions} succeeded, ${result.failed_actions} failed`);

      return result;

    } catch (error: any) {
      console.error(`[PlanExecutor] Fatal error rolling back plan ${plan_id}:`, error);
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * Rollback a single action
   */
  private async rollbackAction(action: PlanAction): Promise<void> {
    console.log(`[PlanExecutor] Rolling back ${action.action_type} action ${action.id}`);

    switch (action.action_type) {
      case 'sweep':
      case 'transfer':
        // Reverse the sweep/transfer
        await this.reverseSweep(action);
        break;

      case 'fx_trade':
        // FX trades cannot be automatically rolled back
        throw new Error('FX trades cannot be automatically rolled back');

      default:
        throw new Error(`Unknown action type: ${action.action_type}`);
    }

    // Mark action as rolled back
    await pool.query(
      `UPDATE treasury_plan_actions
       SET status = 'rolled_back',
           rolled_back_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [action.id]
    );

    console.log(`[PlanExecutor] ✓ Rolled back ${action.action_type} action ${action.id}`);
  }

  /**
   * Reverse a sweep action
   */
  private async reverseSweep(action: PlanAction): Promise<void> {
    if (!action.from_account_id || !action.to_account_id) {
      throw new Error('Sweep missing account IDs');
    }

    return withTransaction(async (client) => {
      // Reverse: credit back to from_account, debit from to_account
      await client.query(
        `UPDATE treasury_accounts
         SET available_balance = available_balance + $1,
             current_balance = current_balance + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [action.amount, action.from_account_id]
      );

      await client.query(
        `UPDATE treasury_accounts
         SET available_balance = available_balance - $1,
             current_balance = current_balance - $1,
             updated_at = NOW()
         WHERE id = $2`,
        [action.amount, action.to_account_id]
      );

      console.log(`[PlanExecutor] ✓ Reversed sweep: ${action.currency} ${action.amount}`);
    });
  }
}

export default PlanExecutor;
