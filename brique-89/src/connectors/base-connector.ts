// Base Bank Connector Interface
// Defines contract for all bank/payment provider connectors

export interface PayoutRequest {
  payout_id: string;
  external_id: string;
  amount: number;
  currency: string;
  beneficiary: BeneficiaryDetails;
  reference?: string;
  urgency?: 'normal' | 'priority' | 'instant';
  metadata?: any;
}

export interface BeneficiaryDetails {
  account_number: string;
  account_name: string;
  bank_code?: string;
  iban?: string;
  swift_bic?: string;
  routing_number?: string;
  branch_code?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country: string;
  };
  phone?: string;
  email?: string;
}

export interface PayoutResponse {
  success: boolean;
  provider_ref: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  estimated_settlement_date?: string;
  fee_charged?: number;
  error_code?: string;
  error_message?: string;
  metadata?: any;
}

export interface BatchPayoutRequest {
  batch_id: string;
  batch_ref: string;
  payouts: PayoutRequest[];
  currency: string;
  total_amount: number;
  metadata?: any;
}

export interface BatchPayoutResponse {
  success: boolean;
  provider_batch_ref: string;
  status: 'submitted' | 'acknowledged' | 'processing' | 'failed';
  file_hash?: string;
  accepted_count: number;
  rejected_count: number;
  rejected_items?: Array<{
    payout_id: string;
    error_code: string;
    error_message: string;
  }>;
  metadata?: any;
}

export interface PayoutStatusQuery {
  provider_ref: string;
  payout_id?: string;
}

export interface PayoutStatusResponse {
  provider_ref: string;
  status: 'pending' | 'processing' | 'sent' | 'settled' | 'failed' | 'returned';
  settled_at?: string;
  settled_amount?: number;
  failure_reason?: string;
  return_reason?: string;
  metadata?: any;
}

export interface ConnectorHealth {
  healthy: boolean;
  latency_ms?: number;
  last_check?: Date;
  error?: string;
}

/**
 * Base connector interface that all bank connectors must implement
 */
export abstract class BaseBankConnector {
  protected connectorName: string;
  protected config: any;

  constructor(connectorName: string, config: any) {
    this.connectorName = connectorName;
    this.config = config;
  }

  /**
   * Send single instant payout
   */
  abstract sendPayment(request: PayoutRequest): Promise<PayoutResponse>;

  /**
   * Submit batch of payouts
   */
  abstract sendBatch(request: BatchPayoutRequest): Promise<BatchPayoutResponse>;

  /**
   * Query status of a payout
   */
  abstract getPayoutStatus(query: PayoutStatusQuery): Promise<PayoutStatusResponse>;

  /**
   * Check connector health
   */
  abstract healthCheck(): Promise<ConnectorHealth>;

  /**
   * Cancel pending payout (if supported)
   */
  async cancelPayout(provider_ref: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    // Default implementation - override if bank supports cancellation
    return {
      success: false,
      error: 'Cancellation not supported by this connector',
    };
  }

  /**
   * Get supported currencies
   */
  getSupportedCurrencies(): string[] {
    return this.config.supported_currencies || [];
  }

  /**
   * Get connector capabilities
   */
  getCapabilities(): {
    instant_payments: boolean;
    batch_payments: boolean;
    cancellation: boolean;
    status_webhooks: boolean;
  } {
    return {
      instant_payments: false,
      batch_payments: false,
      cancellation: false,
      status_webhooks: false,
    };
  }

  /**
   * Validate beneficiary details
   */
  validateBeneficiary(beneficiary: BeneficiaryDetails): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!beneficiary.account_number && !beneficiary.iban) {
      errors.push('account_number or iban required');
    }

    if (!beneficiary.account_name) {
      errors.push('account_name required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get connector name
   */
  getName(): string {
    return this.connectorName;
  }
}
