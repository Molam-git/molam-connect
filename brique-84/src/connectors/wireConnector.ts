/**
 * Brique 84 — Payouts Engine
 * Wire Transfer Connector (US Fedwire / International SWIFT)
 *
 * Features:
 * - Fedwire (domestic US)
 * - SWIFT (international)
 * - Same-day settlement (if before cutoff)
 */

import {
  BankConnector,
  PayoutSubmitRequest,
  PayoutSubmitResponse,
  PayoutStatusResponse,
  BankAccount
} from './bankConnector';
import axios from 'axios';

export class WireConnector extends BankConnector {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly cutoffTimeET: number = 17; // 5 PM ET

  constructor(connectorId: string, config: Record<string, any>) {
    super(connectorId, 'wire', config);
    this.baseURL = config.baseURL || 'https://api.wirebank.example.com';
    this.apiKey = config.apiKey;
  }

  async submitPayout(request: PayoutSubmitRequest): Promise<PayoutSubmitResponse> {
    try {
      const account = await this.getBeneficiaryAccount(request.beneficiaryAccountId);

      if (!account) {
        return {
          success: false,
          error: 'Beneficiary account not found',
          errorCode: 'ACCOUNT_NOT_FOUND'
        };
      }

      // Determine wire type (domestic or international)
      const wireType = account.country === 'US' ? 'fedwire' : 'swift';

      // Check if before cutoff for same-day processing
      const isBeforeCutoff = this.isBeforeCutoff();

      const response = await axios.post(
        `${this.baseURL}/v1/wires`,
        {
          amount: (request.amount * 100).toString(),
          currency: request.currency,
          wire_type: wireType,
          destination: {
            account_number: account.accountNumber,
            routing_number: account.routingNumber,
            iban: account.iban,
            swift_code: account.swiftCode,
            account_holder_name: account.accountHolderName,
            bank_name: account.bankName,
            country: account.country
          },
          priority: isBeforeCutoff ? 'same_day' : 'next_day',
          description: request.description,
          idempotency_key: request.payoutId,
          metadata: request.metadata
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = response.data;

      return {
        success: true,
        bankReference: data.wire_id,
        instantSettlement: wireType === 'fedwire' && isBeforeCutoff,
        estimatedSettlementDate: this.calculateSettlementDate(wireType, isBeforeCutoff)
      };

    } catch (error: any) {
      console.error('[WireConnector] Submit failed:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.error || error.message,
        errorCode: error.response?.data?.code || 'WIRE_SUBMIT_ERROR'
      };
    }
  }

  async getPayoutStatus(bankReference: string): Promise<PayoutStatusResponse> {
    try {
      const response = await axios.get(
        `${this.baseURL}/v1/wires/${bankReference}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      const data = response.data;

      return {
        status: this.mapBankStatus(data.status),
        bankReference: data.wire_id,
        settlementDate: data.settlement_date,
        bankMetadata: data
      };

    } catch (error: any) {
      throw new Error(`Failed to get wire status: ${error.message}`);
    }
  }

  async cancelPayout(bankReference: string, reason: string): Promise<boolean> {
    try {
      await axios.post(
        `${this.baseURL}/v1/wires/${bankReference}/cancel`,
        { reason },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return true;

    } catch (error: any) {
      console.error('[WireConnector] Cancel failed:', error);
      return false;
    }
  }

  async getBeneficiaryAccount(accountId: string): Promise<BankAccount | null> {
    // Mock implementation
    return {
      id: accountId,
      accountNumber: '9876543210',
      routingNumber: '026009593',
      iban: null,
      swiftCode: 'CHASUS33',
      accountHolderName: 'Acme Corp',
      bankName: 'Bank of America',
      country: 'US',
      currency: 'USD'
    };
  }

  async validateAccount(accountId: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const account = await this.getBeneficiaryAccount(accountId);

      if (!account) {
        return { valid: false, error: 'Account not found' };
      }

      // For international wires, require IBAN or SWIFT
      if (account.country !== 'US') {
        if (!account.iban && !account.swiftCode) {
          return { valid: false, error: 'IBAN or SWIFT code required for international wires' };
        }
      }

      return { valid: true };

    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  getCapabilities() {
    return {
      supportsInstantSettlement: true, // For Fedwire before cutoff
      supportsCancellation: true, // Before submission
      supportsStatusCheck: true,
      maxAmount: 10000000, // $10M
      minAmount: 1.00,
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY', 'CAD']
    };
  }

  /**
   * Check if current time is before cutoff
   */
  private isBeforeCutoff(): boolean {
    const now = new Date();
    const etHour = now.getUTCHours() - 5; // Approximate ET
    return etHour < this.cutoffTimeET;
  }

  /**
   * Calculate settlement date
   */
  private calculateSettlementDate(wireType: string, isBeforeCutoff: boolean): string {
    const now = new Date();

    if (wireType === 'fedwire' && isBeforeCutoff) {
      // Same day
      return now.toISOString().split('T')[0];
    }

    // Next business day
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  /**
   * Map bank status
   */
  private mapBankStatus(bankStatus: string): PayoutStatusResponse['status'] {
    const statusMap: Record<string, PayoutStatusResponse['status']> = {
      'pending': 'pending',
      'processing': 'processing',
      'sent': 'sent',
      'completed': 'settled',
      'settled': 'settled',
      'failed': 'failed',
      'reversed': 'reversed',
      'cancelled': 'reversed'
    };

    return statusMap[bankStatus.toLowerCase()] || 'pending';
  }
}
