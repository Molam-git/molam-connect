/**
 * Brique 84 — Payouts Engine
 * ACH Connector Implementation (US)
 *
 * Features:
 * - Standard ACH (T+2 settlement)
 * - Same-day ACH (if submitted before cutoff)
 * - Instant ACH via RTP/FedNow
 */

import {
  BankConnector,
  PayoutSubmitRequest,
  PayoutSubmitResponse,
  PayoutStatusResponse,
  BankAccount
} from './bankConnector';
import axios from 'axios';

export class ACHConnector extends BankConnector {
  private readonly baseURL: string;
  private readonly apiKey: string;

  constructor(
    connectorId: string,
    config: Record<string, any>
  ) {
    super(connectorId, 'ach', config);
    this.baseURL = config.baseURL || 'https://api.achbank.example.com';
    this.apiKey = config.apiKey;
  }

  async submitPayout(request: PayoutSubmitRequest): Promise<PayoutSubmitResponse> {
    try {
      // 1. Get beneficiary account
      const account = await this.getBeneficiaryAccount(request.beneficiaryAccountId);

      if (!account) {
        return {
          success: false,
          error: 'Beneficiary account not found',
          errorCode: 'ACCOUNT_NOT_FOUND'
        };
      }

      // 2. Validate account
      const validation = await this.validateAccount(request.beneficiaryAccountId);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error || 'Account validation failed',
          errorCode: 'INVALID_ACCOUNT'
        };
      }

      // 3. Determine ACH type (standard, same-day, or instant)
      const achType = this.determineACHType(request);

      // 4. Submit to ACH network
      const response = await axios.post(
        `${this.baseURL}/v1/ach/payments`,
        {
          amount: (request.amount * 100).toString(), // Convert to cents
          currency: request.currency,
          destination: {
            account_number: account.accountNumber,
            routing_number: account.routingNumber,
            account_holder_name: account.accountHolderName
          },
          ach_type: achType,
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

      // Calculate settlement date
      const settlementDate = this.calculateSettlementDate(achType);

      return {
        success: true,
        bankReference: data.payment_id,
        instantSettlement: achType === 'instant',
        estimatedSettlementDate: settlementDate
      };

    } catch (error: any) {
      console.error('[ACHConnector] Submit failed:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.error || error.message,
        errorCode: error.response?.data?.code || 'ACH_SUBMIT_ERROR'
      };
    }
  }

  async getPayoutStatus(bankReference: string): Promise<PayoutStatusResponse> {
    try {
      const response = await axios.get(
        `${this.baseURL}/v1/ach/payments/${bankReference}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      const data = response.data;

      return {
        status: this.mapBankStatus(data.status),
        bankReference: data.payment_id,
        settlementDate: data.settlement_date,
        bankMetadata: data.metadata
      };

    } catch (error: any) {
      throw new Error(`Failed to get ACH status: ${error.message}`);
    }
  }

  async cancelPayout(bankReference: string, reason: string): Promise<boolean> {
    try {
      await axios.post(
        `${this.baseURL}/v1/ach/payments/${bankReference}/cancel`,
        { reason },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return true;

    } catch (error: any) {
      console.error('[ACHConnector] Cancel failed:', error);
      return false;
    }
  }

  async getBeneficiaryAccount(accountId: string): Promise<BankAccount | null> {
    // In production, this would query from database
    // For now, return mock data
    return {
      id: accountId,
      accountNumber: '1234567890',
      routingNumber: '021000021',
      iban: null,
      swiftCode: null,
      accountHolderName: 'John Doe',
      bankName: 'Chase Bank',
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

      // Validate routing number format (9 digits)
      if (account.routingNumber && !/^\d{9}$/.test(account.routingNumber)) {
        return { valid: false, error: 'Invalid routing number format' };
      }

      // Validate account number (max 17 digits)
      if (!/^\d{1,17}$/.test(account.accountNumber)) {
        return { valid: false, error: 'Invalid account number format' };
      }

      return { valid: true };

    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  getCapabilities() {
    return {
      supportsInstantSettlement: true, // Via RTP/FedNow
      supportsCancellation: true, // Before cutoff
      supportsStatusCheck: true,
      maxAmount: 1000000,
      minAmount: 0.01,
      supportedCurrencies: ['USD']
    };
  }

  /**
   * Determine ACH type based on priority and time
   */
  private determineACHType(request: PayoutSubmitRequest): 'standard' | 'same_day' | 'instant' {
    const metadata = request.metadata || {};
    const priority = metadata.priority || 'standard';

    if (priority === 'instant') {
      return 'instant'; // RTP/FedNow
    }

    // Check if before same-day cutoff (3 PM ET)
    const now = new Date();
    const etHour = now.getUTCHours() - 5; // Approximate ET

    if (priority === 'priority' && etHour < 15) {
      return 'same_day';
    }

    return 'standard'; // T+2
  }

  /**
   * Calculate settlement date based on ACH type
   */
  private calculateSettlementDate(achType: string): string {
    const now = new Date();

    if (achType === 'instant') {
      return now.toISOString().split('T')[0]; // Same day
    }

    if (achType === 'same_day') {
      // Next business day
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }

    // Standard ACH: T+2 business days
    const settlement = new Date(now);
    settlement.setDate(settlement.getDate() + 2);
    return settlement.toISOString().split('T')[0];
  }

  /**
   * Map bank status to our status
   */
  private mapBankStatus(bankStatus: string): PayoutStatusResponse['status'] {
    const statusMap: Record<string, PayoutStatusResponse['status']> = {
      'pending': 'pending',
      'processing': 'processing',
      'submitted': 'sent',
      'settled': 'settled',
      'completed': 'settled',
      'failed': 'failed',
      'returned': 'failed',
      'reversed': 'reversed',
      'cancelled': 'reversed'
    };

    return statusMap[bankStatus.toLowerCase()] || 'pending';
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const response = await axios.get(`${this.baseURL}/health`, {
        timeout: 5000
      });

      return {
        healthy: response.status === 200,
        message: response.data?.status
      };

    } catch (error: any) {
      return {
        healthy: false,
        message: error.message
      };
    }
  }
}
