// Bank Connector Interface Types

export interface PayoutRequest {
  payoutId: string;
  amount: number;
  currency: string;
  beneficiary: {
    name: string;
    account: {
      iban?: string;
      account_number?: string;
      bank_code?: string;
      routing_number?: string;
    };
    email?: string;
    phone?: string;
  };
  reference: string;
  metadata?: Record<string, any>;
}

export interface ConnectorResult {
  status: 'sent' | 'settled' | 'failed' | 'partial' | 'timeout';
  provider_ref?: string;
  bank_fee?: number;
  http_code?: number;
  details?: any;
  latency_ms?: number;
  error?: string;
}

export interface BankConnector {
  name: string;

  /**
   * Send a payout
   */
  sendPayment(request: PayoutRequest): Promise<ConnectorResult>;

  /**
   * Get payout status from provider
   */
  getPaymentStatus(provider_ref: string): Promise<ConnectorResult>;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get connector capabilities
   */
  getCapabilities(): {
    supportedCurrencies: string[];
    maxAmount: Record<string, number>;
    settlementTimes: Record<string, string>;
  };
}

export default BankConnector;
