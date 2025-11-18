/**
 * Brique 84 — Payouts Engine
 * Bank Connector Interface
 *
 * Abstract interface for integrating with different payment rails and banks
 */

// =====================================================================
// TYPES
// =====================================================================

export interface PayoutSubmitRequest {
  payoutId: string;
  amount: number;
  currency: string;
  beneficiaryAccountId: string;
  beneficiaryId: string;
  description: string;
  metadata?: Record<string, any>;
}

export interface PayoutSubmitResponse {
  success: boolean;
  bankReference?: string; // Bank's transaction reference
  instantSettlement?: boolean; // True if settled immediately
  error?: string;
  errorCode?: string;
  estimatedSettlementDate?: string; // ISO date
}

export interface PayoutStatusResponse {
  status: 'pending' | 'processing' | 'sent' | 'settled' | 'failed' | 'reversed';
  bankReference: string;
  settlementDate?: string;
  error?: string;
  errorCode?: string;
  bankMetadata?: Record<string, any>;
}

export interface BankAccount {
  id: string;
  accountNumber: string;
  routingNumber?: string;
  iban?: string;
  swiftCode?: string;
  accountHolderName: string;
  bankName: string;
  country: string;
  currency: string;
}

// =====================================================================
// BANK CONNECTOR INTERFACE
// =====================================================================

export abstract class BankConnector {
  constructor(
    protected connectorId: string,
    protected rail: string,
    protected config: Record<string, any>
  ) {}

  /**
   * Submit a payout to the bank
   */
  abstract submitPayout(request: PayoutSubmitRequest): Promise<PayoutSubmitResponse>;

  /**
   * Check payout status from bank
   */
  abstract getPayoutStatus(bankReference: string): Promise<PayoutStatusResponse>;

  /**
   * Cancel/reverse a payout (if supported)
   */
  abstract cancelPayout(bankReference: string, reason: string): Promise<boolean>;

  /**
   * Get beneficiary account details
   */
  abstract getBeneficiaryAccount(accountId: string): Promise<BankAccount | null>;

  /**
   * Validate beneficiary account before payout
   */
  abstract validateAccount(accountId: string): Promise<{
    valid: boolean;
    error?: string;
  }>;

  /**
   * Get connector capabilities
   */
  getCapabilities(): {
    supportsInstantSettlement: boolean;
    supportsCancellation: boolean;
    supportsStatusCheck: boolean;
    maxAmount: number;
    minAmount: number;
    supportedCurrencies: string[];
  } {
    return {
      supportsInstantSettlement: false,
      supportsCancellation: false,
      supportsStatusCheck: true,
      maxAmount: 1000000,
      minAmount: 0.01,
      supportedCurrencies: ['USD']
    };
  }

  /**
   * Health check for connector
   */
  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true };
  }
}
