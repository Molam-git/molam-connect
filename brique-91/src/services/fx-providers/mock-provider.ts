// Mock FX Provider
// For testing and development purposes

import { FXProvider, FXQuote, FXTradeResult } from '../fx-engine';

interface MockRates {
  [key: string]: number;
}

/**
 * Mock FX Provider for testing
 */
export class MockFXProvider extends FXProvider {
  private providerName: string;
  private markup: number;
  private latency: number;
  private failureRate: number;
  private available: boolean;

  // Mock market rates
  private rates: MockRates = {
    'USD_EUR': 0.92,
    'USD_GBP': 0.79,
    'USD_XOF': 615.0,
    'EUR_USD': 1.09,
    'EUR_GBP': 0.86,
    'EUR_XOF': 655.96,
    'GBP_USD': 1.27,
    'GBP_EUR': 1.17,
    'GBP_XOF': 780.0,
    'XOF_USD': 0.00163,
    'XOF_EUR': 0.00152,
    'XOF_GBP': 0.00128
  };

  constructor(
    providerName: string,
    markup: number = 0.005,
    latency: number = 100,
    failureRate: number = 0
  ) {
    super();
    this.providerName = providerName;
    this.markup = markup;
    this.latency = latency;
    this.failureRate = failureRate;
    this.available = true;
  }

  getProviderName(): string {
    return this.providerName;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  setAvailable(available: boolean) {
    this.available = available;
  }

  async getQuote(
    from_currency: string,
    to_currency: string,
    from_amount: number
  ): Promise<FXQuote> {
    // Simulate latency
    await this.sleep(this.latency);

    // Simulate random failures
    if (Math.random() < this.failureRate) {
      throw new Error(`${this.providerName} API temporarily unavailable`);
    }

    // Get market rate
    const rateKey = `${from_currency}_${to_currency}`;
    const marketRate = this.rates[rateKey];

    if (!marketRate) {
      throw new Error(`${this.providerName} does not support ${from_currency}/${to_currency}`);
    }

    // Apply markup
    const exchange_rate = marketRate * (1 - this.markup);
    const to_amount = from_amount * exchange_rate;
    const fee_amount = from_amount * this.markup;
    const total_cost = fee_amount;

    // Quote expires in 15 minutes
    const expires_at = new Date();
    expires_at.setMinutes(expires_at.getMinutes() + 15);

    const quote: FXQuote = {
      id: `QUOTE-${this.providerName}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      provider: this.providerName,
      from_currency,
      to_currency,
      from_amount,
      to_amount,
      exchange_rate,
      fee_amount,
      total_cost,
      expires_at,
      metadata: {
        market_rate: marketRate,
        markup_percent: this.markup * 100,
        simulated: true
      }
    };

    return quote;
  }

  async executeTrade(quote: FXQuote): Promise<FXTradeResult> {
    // Simulate latency
    await this.sleep(this.latency * 2);

    // Simulate random failures
    if (Math.random() < this.failureRate) {
      throw new Error(`${this.providerName} trade execution failed`);
    }

    // Check if quote expired
    if (new Date() > quote.expires_at) {
      throw new Error('Quote has expired');
    }

    const trade_id = `TRADE-${this.providerName}-${Date.now()}`;

    return {
      trade_id,
      quote_id: quote.id,
      provider: this.providerName,
      from_amount: quote.from_amount,
      to_amount: quote.to_amount,
      exchange_rate: quote.exchange_rate,
      total_cost: quote.total_cost,
      status: 'completed'
    };
  }

  async getHealthStatus(): Promise<{ healthy: boolean; latency_ms: number }> {
    const startTime = Date.now();

    // Simulate health check
    await this.sleep(10);

    const latency_ms = Date.now() - startTime;

    return {
      healthy: this.available && this.failureRate < 0.5,
      latency_ms
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create mock providers for testing
 */
export function createMockProviders(): FXProvider[] {
  return [
    new MockFXProvider('CurrencyCloud', 0.005, 100, 0), // 0.5% markup, 100ms latency, 0% failure
    new MockFXProvider('Wise', 0.003, 150, 0),         // 0.3% markup, 150ms latency, 0% failure
    new MockFXProvider('XE', 0.007, 80, 0)             // 0.7% markup, 80ms latency, 0% failure
  ];
}

export default MockFXProvider;
