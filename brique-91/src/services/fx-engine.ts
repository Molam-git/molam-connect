// FX Engine Service
// Manages multi-provider FX quotes, routing, and execution

import { pool } from '../utils/db';

export interface FXQuote {
  id: string;
  provider: string;
  from_currency: string;
  to_currency: string;
  from_amount: number;
  to_amount: number;
  exchange_rate: number;
  fee_amount: number;
  total_cost: number;
  expires_at: Date;
  metadata?: any;
}

export interface FXTradeRequest {
  from_currency: string;
  to_currency: string;
  from_amount: number;
  preferred_provider?: string;
}

export interface FXTradeResult {
  trade_id: string;
  quote_id: string;
  provider: string;
  from_amount: number;
  to_amount: number;
  exchange_rate: number;
  total_cost: number;
  status: string;
}

/**
 * Abstract FX Provider interface
 */
export abstract class FXProvider {
  abstract getProviderName(): string;

  abstract isAvailable(): Promise<boolean>;

  abstract getQuote(
    from_currency: string,
    to_currency: string,
    from_amount: number
  ): Promise<FXQuote>;

  abstract executeTrade(quote: FXQuote): Promise<FXTradeResult>;

  abstract getHealthStatus(): Promise<{ healthy: boolean; latency_ms: number }>;
}

/**
 * FX Engine
 */
export class FXEngine {
  private providers: Map<string, FXProvider>;

  constructor() {
    this.providers = new Map();
  }

  /**
   * Register an FX provider
   */
  registerProvider(provider: FXProvider) {
    this.providers.set(provider.getProviderName(), provider);
    console.log(`[FXEngine] Registered provider: ${provider.getProviderName()}`);
  }

  /**
   * Get quotes from all available providers
   */
  async getQuotes(request: FXTradeRequest): Promise<FXQuote[]> {
    console.log(`[FXEngine] Fetching quotes for ${request.from_currency} → ${request.to_currency}, amount: ${request.from_amount}`);

    const quotes: FXQuote[] = [];
    const errors: string[] = [];

    // If preferred provider specified, try it first
    if (request.preferred_provider) {
      const provider = this.providers.get(request.preferred_provider);
      if (provider) {
        try {
          const quote = await provider.getQuote(
            request.from_currency,
            request.to_currency,
            request.from_amount
          );
          quotes.push(quote);

          // Store quote in database
          await this.storeQuote(quote);

          console.log(`[FXEngine] Got quote from ${request.preferred_provider}: rate ${quote.exchange_rate}, cost ${quote.total_cost}`);
        } catch (error: any) {
          errors.push(`${request.preferred_provider}: ${error.message}`);
        }
      }
    }

    // Get quotes from all other providers in parallel
    const providerPromises = Array.from(this.providers.values())
      .filter(p => !request.preferred_provider || p.getProviderName() !== request.preferred_provider)
      .map(async (provider) => {
        try {
          const available = await provider.isAvailable();
          if (!available) {
            return null;
          }

          const quote = await provider.getQuote(
            request.from_currency,
            request.to_currency,
            request.from_amount
          );

          // Store quote in database
          await this.storeQuote(quote);

          console.log(`[FXEngine] Got quote from ${provider.getProviderName()}: rate ${quote.exchange_rate}, cost ${quote.total_cost}`);

          return quote;
        } catch (error: any) {
          errors.push(`${provider.getProviderName()}: ${error.message}`);
          return null;
        }
      });

    const results = await Promise.all(providerPromises);
    const validQuotes = results.filter(q => q !== null) as FXQuote[];

    quotes.push(...validQuotes);

    if (quotes.length === 0) {
      throw new Error(`Failed to get quotes: ${errors.join(', ')}`);
    }

    console.log(`[FXEngine] Received ${quotes.length} valid quotes`);

    return quotes;
  }

  /**
   * Select best quote based on total cost
   */
  async selectBestQuote(quotes: FXQuote[]): Promise<FXQuote> {
    if (quotes.length === 0) {
      throw new Error('No quotes available');
    }

    // Sort by total cost (ascending)
    const sorted = [...quotes].sort((a, b) => a.total_cost - b.total_cost);

    const best = sorted[0];
    console.log(`[FXEngine] Selected best quote: ${best.provider} (cost: ${best.total_cost})`);

    return best;
  }

  /**
   * Execute FX trade with selected quote
   */
  async executeTrade(quote_id: string): Promise<FXTradeResult> {
    console.log(`[FXEngine] Executing trade for quote ${quote_id}`);

    // Fetch quote from database
    const { rows } = await pool.query(
      `SELECT id, provider, from_currency, to_currency, from_amount, to_amount,
              exchange_rate, fee_amount, total_cost, expires_at, raw_quote
       FROM fx_quotes
       WHERE id = $1`,
      [quote_id]
    );

    if (rows.length === 0) {
      throw new Error(`Quote ${quote_id} not found`);
    }

    const quoteData = rows[0];

    // Check if quote expired
    if (new Date(quoteData.expires_at) < new Date()) {
      throw new Error(`Quote ${quote_id} has expired`);
    }

    const quote: FXQuote = {
      id: quoteData.id,
      provider: quoteData.provider,
      from_currency: quoteData.from_currency,
      to_currency: quoteData.to_currency,
      from_amount: parseFloat(quoteData.from_amount),
      to_amount: parseFloat(quoteData.to_amount),
      exchange_rate: parseFloat(quoteData.exchange_rate),
      fee_amount: parseFloat(quoteData.fee_amount),
      total_cost: parseFloat(quoteData.total_cost),
      expires_at: new Date(quoteData.expires_at),
      metadata: quoteData.raw_quote
    };

    // Get provider
    const provider = this.providers.get(quote.provider);
    if (!provider) {
      throw new Error(`Provider ${quote.provider} not available`);
    }

    // Execute trade
    const result = await provider.executeTrade(quote);

    console.log(`[FXEngine] ✓ Trade executed: ${result.trade_id}`);

    // Record health status
    await this.recordProviderHealth(quote.provider, true);

    return result;
  }

  /**
   * Store quote in database
   */
  private async storeQuote(quote: FXQuote): Promise<void> {
    await pool.query(
      `INSERT INTO fx_quotes (
        id,
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW())
      ON CONFLICT (id) DO NOTHING`,
      [
        quote.id,
        quote.from_currency,
        quote.to_currency,
        quote.from_amount,
        quote.to_amount,
        quote.exchange_rate,
        quote.provider,
        quote.fee_amount,
        quote.total_cost,
        quote.expires_at,
        JSON.stringify(quote.metadata || {})
      ]
    );
  }

  /**
   * Record provider health status
   */
  private async recordProviderHealth(provider_name: string, healthy: boolean): Promise<void> {
    await pool.query(
      `INSERT INTO bank_health_status (
        bank_profile_id,
        status,
        last_check_at,
        consecutive_failures,
        metadata
      ) VALUES (
        (SELECT id FROM bank_profiles WHERE name = $1 LIMIT 1),
        $2,
        NOW(),
        0,
        '{}'::jsonb
      )
      ON CONFLICT (bank_profile_id)
      DO UPDATE SET
        status = $2,
        last_check_at = NOW(),
        consecutive_failures = CASE WHEN $2 = 'healthy' THEN 0 ELSE bank_health_status.consecutive_failures + 1 END`,
      [provider_name, healthy ? 'healthy' : 'degraded']
    );
  }

  /**
   * Get provider health status
   */
  async getProviderHealth(): Promise<Record<string, any>> {
    const health: Record<string, any> = {};

    for (const [name, provider] of this.providers.entries()) {
      try {
        const status = await provider.getHealthStatus();
        health[name] = status;
      } catch (error) {
        health[name] = { healthy: false, error: 'Health check failed' };
      }
    }

    return health;
  }

  /**
   * Get FX rate for a currency pair (best available)
   */
  async getRate(from_currency: string, to_currency: string): Promise<number> {
    if (from_currency === to_currency) {
      return 1.0;
    }

    // Try to get recent quote from database
    const { rows } = await pool.query(
      `SELECT exchange_rate
       FROM fx_quotes
       WHERE from_currency = $1
         AND to_currency = $2
         AND expires_at > NOW()
       ORDER BY total_cost ASC
       LIMIT 1`,
      [from_currency, to_currency]
    );

    if (rows.length > 0) {
      return parseFloat(rows[0].exchange_rate);
    }

    // Fetch new quotes
    const quotes = await this.getQuotes({
      from_currency,
      to_currency,
      from_amount: 1000 // Use 1000 as reference amount
    });

    if (quotes.length === 0) {
      throw new Error(`Unable to get FX rate for ${from_currency}/${to_currency}`);
    }

    const best = await this.selectBestQuote(quotes);
    return best.exchange_rate;
  }
}

export default FXEngine;
