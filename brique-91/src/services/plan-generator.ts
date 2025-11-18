// Treasury Plan Generator Service
// Generates treasury plans for FX, sweeps, and transfers

import { pool, withTransaction } from '../utils/db';

interface PlanRequest {
  created_by: string;
  actions: PlanAction[];
  notes?: string;
}

interface PlanAction {
  action_type: 'fx_trade' | 'sweep' | 'transfer';
  from_account_id?: string;
  to_account_id?: string;
  from_currency?: string;
  to_currency?: string;
  amount: number;
  priority?: string;
  notes?: string;
  metadata?: any;
}

interface FXQuote {
  id: string;
  from_currency: string;
  to_currency: string;
  from_amount: number;
  to_amount: number;
  exchange_rate: number;
  provider: string;
  total_cost: number;
  expires_at: Date;
}

interface GeneratedPlan {
  plan_id: string;
  plan_reference: string;
  total_estimated_cost: number;
  requires_approval: boolean;
  actions: GeneratedAction[];
}

interface GeneratedAction {
  action_id: string;
  action_type: string;
  estimated_cost: number;
  fx_quotes?: FXQuote[];
}

const HIGH_VALUE_THRESHOLD = 100000; // Plans over this require approval
const CRITICAL_VALUE_THRESHOLD = 500000; // Plans over this require multi-sig

/**
 * Treasury Plan Generator
 */
export class PlanGenerator {
  /**
   * Generate a treasury plan from request
   */
  async generatePlan(request: PlanRequest): Promise<GeneratedPlan> {
    console.log(`[PlanGenerator] Generating plan with ${request.actions.length} actions`);

    return withTransaction(async (client) => {
      // Validate actions
      await this.validateActions(request.actions);

      // Create plan
      const plan_reference = `PLAN-${Date.now()}`;

      const { rows: plans } = await client.query(
        `INSERT INTO treasury_plans (
          plan_reference,
          status,
          total_estimated_cost,
          requires_approval,
          created_by,
          notes,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id`,
        [
          plan_reference,
          'draft',
          0, // Will be calculated
          false, // Will be determined
          request.created_by,
          request.notes || null
        ]
      );

      const plan_id = plans[0].id;

      // Generate actions
      const generatedActions: GeneratedAction[] = [];
      let total_estimated_cost = 0;

      for (const action of request.actions) {
        const generatedAction = await this.generateAction(client, plan_id, action);
        generatedActions.push(generatedAction);
        total_estimated_cost += generatedAction.estimated_cost;
      }

      // Determine if approval is required
      const requires_approval = this.requiresApproval(total_estimated_cost, request.actions);

      // Update plan with totals
      await client.query(
        `UPDATE treasury_plans
         SET total_estimated_cost = $1,
             requires_approval = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [total_estimated_cost, requires_approval, plan_id]
      );

      console.log(`[PlanGenerator] ✓ Generated plan ${plan_reference} (cost: ${total_estimated_cost}, approval: ${requires_approval})`);

      return {
        plan_id,
        plan_reference,
        total_estimated_cost,
        requires_approval,
        actions: generatedActions
      };
    });
  }

  /**
   * Generate a single plan action
   */
  private async generateAction(client: any, plan_id: string, action: PlanAction): Promise<GeneratedAction> {
    let estimated_cost = 0;
    let fx_quotes: FXQuote[] = [];

    // Get FX quotes if action involves currency conversion
    if (action.action_type === 'fx_trade' && action.from_currency && action.to_currency) {
      fx_quotes = await this.getFXQuotes(
        action.from_currency,
        action.to_currency,
        action.amount
      );

      // Use best quote for cost estimation
      if (fx_quotes.length > 0) {
        estimated_cost = Math.min(...fx_quotes.map(q => q.total_cost));
      }
    }

    // Insert action
    const { rows: actions } = await client.query(
      `INSERT INTO treasury_plan_actions (
        plan_id,
        action_type,
        from_account_id,
        to_account_id,
        currency,
        amount,
        status,
        priority,
        estimated_cost,
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
      RETURNING id`,
      [
        plan_id,
        action.action_type,
        action.from_account_id || null,
        action.to_account_id || null,
        action.from_currency || 'USD',
        action.amount,
        'draft',
        action.priority || 'normal',
        estimated_cost,
        JSON.stringify({
          ...action.metadata,
          from_currency: action.from_currency,
          to_currency: action.to_currency,
          notes: action.notes,
          fx_quotes_count: fx_quotes.length
        })
      ]
    );

    return {
      action_id: actions[0].id,
      action_type: action.action_type,
      estimated_cost,
      fx_quotes: fx_quotes.length > 0 ? fx_quotes : undefined
    };
  }

  /**
   * Get FX quotes from multiple providers
   */
  private async getFXQuotes(
    from_currency: string,
    to_currency: string,
    from_amount: number
  ): Promise<FXQuote[]> {
    console.log(`[PlanGenerator] Fetching FX quotes for ${from_currency} → ${to_currency}, amount: ${from_amount}`);

    // Check for existing valid quotes
    const { rows: existingQuotes } = await pool.query(
      `SELECT id, from_currency, to_currency, from_amount, to_amount,
              exchange_rate, provider, total_cost, expires_at
       FROM fx_quotes
       WHERE from_currency = $1
         AND to_currency = $2
         AND from_amount = $3
         AND expires_at > NOW()
       ORDER BY total_cost ASC`,
      [from_currency, to_currency, from_amount]
    );

    if (existingQuotes.length > 0) {
      console.log(`[PlanGenerator] Found ${existingQuotes.length} existing quotes`);
      return existingQuotes;
    }

    // Fetch new quotes from providers
    const providers = ['CurrencyCloud', 'Wise', 'XE'];
    const quotes: FXQuote[] = [];

    for (const provider of providers) {
      try {
        const quote = await this.fetchFXQuoteFromProvider(provider, from_currency, to_currency, from_amount);
        quotes.push(quote);

        // Store quote in database
        await pool.query(
          `INSERT INTO fx_quotes (
            from_currency,
            to_currency,
            from_amount,
            to_amount,
            exchange_rate,
            provider,
            fee_amount,
            total_cost,
            expires_at,
            raw_quote,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())`,
          [
            quote.from_currency,
            quote.to_currency,
            quote.from_amount,
            quote.to_amount,
            quote.exchange_rate,
            quote.provider,
            quote.total_cost - (quote.from_amount / quote.exchange_rate),
            quote.total_cost,
            quote.expires_at,
            JSON.stringify(quote)
          ]
        );
      } catch (error) {
        console.error(`[PlanGenerator] Error fetching quote from ${provider}:`, error);
      }
    }

    return quotes;
  }

  /**
   * Fetch FX quote from provider
   * In production, this would call actual FX provider APIs
   */
  private async fetchFXQuoteFromProvider(
    provider: string,
    from_currency: string,
    to_currency: string,
    from_amount: number
  ): Promise<FXQuote> {
    // TODO: Implement actual provider API calls
    // For now, generate mock quotes

    // Simulate different providers with different rates and fees
    const baseRate = this.getBaseFXRate(from_currency, to_currency);

    const providerMarkup: Record<string, number> = {
      'CurrencyCloud': 0.005, // 0.5% markup
      'Wise': 0.003,          // 0.3% markup
      'XE': 0.007             // 0.7% markup
    };

    const markup = providerMarkup[provider] || 0.01;
    const exchange_rate = baseRate * (1 - markup);

    const to_amount = from_amount * exchange_rate;
    const fee_amount = from_amount * markup;
    const total_cost = fee_amount;

    const expires_at = new Date();
    expires_at.setMinutes(expires_at.getMinutes() + 15); // Quotes valid for 15 minutes

    return {
      id: `QUOTE-${Date.now()}-${provider}`,
      from_currency,
      to_currency,
      from_amount,
      to_amount,
      exchange_rate,
      provider,
      total_cost,
      expires_at
    };
  }

  /**
   * Get base FX rate (mock implementation)
   */
  private getBaseFXRate(from_currency: string, to_currency: string): number {
    // Mock rates - in production, fetch from market data provider
    const rates: Record<string, Record<string, number>> = {
      'USD': { 'EUR': 0.92, 'GBP': 0.79, 'XOF': 615.0 },
      'EUR': { 'USD': 1.09, 'GBP': 0.86, 'XOF': 655.96 },
      'GBP': { 'USD': 1.27, 'EUR': 1.17, 'XOF': 780.0 },
      'XOF': { 'USD': 0.00163, 'EUR': 0.00152, 'GBP': 0.00128 }
    };

    if (from_currency === to_currency) return 1.0;

    return rates[from_currency]?.[to_currency] || 1.0;
  }

  /**
   * Validate plan actions
   */
  private async validateActions(actions: PlanAction[]): Promise<void> {
    for (const action of actions) {
      // Validate amount
      if (action.amount <= 0) {
        throw new Error(`Invalid amount: ${action.amount}`);
      }

      // Validate action type
      if (!['fx_trade', 'sweep', 'transfer'].includes(action.action_type)) {
        throw new Error(`Invalid action type: ${action.action_type}`);
      }

      // Validate FX trade
      if (action.action_type === 'fx_trade') {
        if (!action.from_currency || !action.to_currency) {
          throw new Error('FX trade requires from_currency and to_currency');
        }

        if (action.from_currency === action.to_currency) {
          throw new Error('FX trade requires different currencies');
        }
      }

      // Validate sweep/transfer
      if (action.action_type === 'sweep' || action.action_type === 'transfer') {
        if (!action.from_account_id || !action.to_account_id) {
          throw new Error(`${action.action_type} requires from_account_id and to_account_id`);
        }

        // Check account exists and has sufficient balance
        const { rows } = await pool.query(
          `SELECT available_balance, currency
           FROM treasury_accounts
           WHERE id = $1`,
          [action.from_account_id]
        );

        if (rows.length === 0) {
          throw new Error(`Account ${action.from_account_id} not found`);
        }

        const available_balance = parseFloat(rows[0].available_balance);
        if (available_balance < action.amount) {
          throw new Error(`Insufficient balance in account ${action.from_account_id}: ${available_balance} < ${action.amount}`);
        }
      }
    }
  }

  /**
   * Determine if plan requires approval
   */
  private requiresApproval(total_cost: number, actions: PlanAction[]): boolean {
    // High value plans require approval
    if (total_cost > HIGH_VALUE_THRESHOLD) {
      return true;
    }

    // FX trades always require approval
    if (actions.some(a => a.action_type === 'fx_trade')) {
      return true;
    }

    // Critical priority actions require approval
    if (actions.some(a => a.priority === 'critical')) {
      return true;
    }

    return false;
  }

  /**
   * Approve a plan
   */
  async approvePlan(plan_id: string, approved_by: string): Promise<void> {
    await pool.query(
      `UPDATE treasury_plans
       SET status = 'approved',
           approved_by = array_append(approved_by, $1::UUID),
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
         AND status = 'draft'`,
      [approved_by, plan_id]
    );

    console.log(`[PlanGenerator] ✓ Plan ${plan_id} approved by ${approved_by}`);
  }

  /**
   * Reject a plan
   */
  async rejectPlan(plan_id: string, rejected_by: string, reason: string): Promise<void> {
    await pool.query(
      `UPDATE treasury_plans
       SET status = 'rejected',
           rejected_at = NOW(),
           rejection_reason = $1,
           updated_at = NOW()
       WHERE id = $2
         AND status = 'draft'`,
      [reason, plan_id]
    );

    console.log(`[PlanGenerator] ✗ Plan ${plan_id} rejected by ${rejected_by}: ${reason}`);
  }
}

export default PlanGenerator;
