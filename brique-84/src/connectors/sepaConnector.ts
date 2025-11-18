/**
 * Brique 84 — Payouts Engine
 * SEPA Connector (European Payments)
 *
 * Features:
 * - SEPA Credit Transfer (SCT) - Standard (T+1)
 * - SEPA Instant Credit Transfer (SCT Inst) - Real-time
 */

import {
  BankConnector,
  PayoutSubmitRequest,
  PayoutSubmitResponse,
  PayoutStatusResponse,
  BankAccount
} from './bankConnector';
import axios from 'axios';

export class SEPAConnector extends BankConnector {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly cutoffTimeCET: number = 18; // 6 PM CET

  constructor(connectorId: string, config: Record<string, any>) {
    super(connectorId, 'sepa', config);
    this.baseURL = config.baseURL || 'https://api.sepa.example.com';
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

      // Validate IBAN
      if (!account.iban) {
        return {
          success: false,
          error: 'IBAN required for SEPA transfers',
          errorCode: 'MISSING_IBAN'
        };
      }

      // Determine SEPA type (instant or standard)
      const metadata = request.metadata || {};
      const isInstant = metadata.priority === 'instant' && this.isInstantEligible(request.amount);

      const response = await axios.post(
        `${this.baseURL}/v1/sepa/transfers`,
        {
          amount: (request.amount * 100).toString(),
          currency: request.currency,
          transfer_type: isInstant ? 'sct_inst' : 'sct',
          creditor: {
            name: account.accountHolderName,
            iban: account.iban,
            bic: account.swiftCode // Optional for SEPA
          },
          remittance_information: request.description,
          end_to_end_id: request.payoutId.substring(0, 35), // SEPA max length
          metadata: request.metadata
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': request.payoutId
          }
        }
      );

      const data = response.data;

      return {
        success: true,
        bankReference: data.payment_id,
        instantSettlement: isInstant,
        estimatedSettlementDate: this.calculateSettlementDate(isInstant)
      };

    } catch (error: any) {
      console.error('[SEPAConnector] Submit failed:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.error || error.message,
        errorCode: error.response?.data?.code || 'SEPA_SUBMIT_ERROR'
      };
    }
  }

  async getPayoutStatus(bankReference: string): Promise<PayoutStatusResponse> {
    try {
      const response = await axios.get(
        `${this.baseURL}/v1/sepa/transfers/${bankReference}`,
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
        bankMetadata: data
      };

    } catch (error: any) {
      throw new Error(`Failed to get SEPA status: ${error.message}`);
    }
  }

  async cancelPayout(bankReference: string, reason: string): Promise<boolean> {
    try {
      // SEPA SCT Inst cannot be cancelled (instant)
      // SEPA SCT can be cancelled before execution
      await axios.post(
        `${this.baseURL}/v1/sepa/transfers/${bankReference}/cancel`,
        { reason },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return true;

    } catch (error: any) {
      console.error('[SEPAConnector] Cancel failed:', error);
      return false;
    }
  }

  async getBeneficiaryAccount(accountId: string): Promise<BankAccount | null> {
    // Mock implementation
    return {
      id: accountId,
      accountNumber: '',
      routingNumber: null,
      iban: 'DE89370400440532013000',
      swiftCode: 'COBADEFFXXX',
      accountHolderName: 'European Merchant Ltd',
      bankName: 'Deutsche Bank',
      country: 'DE',
      currency: 'EUR'
    };
  }

  async validateAccount(accountId: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const account = await this.getBeneficiaryAccount(accountId);

      if (!account) {
        return { valid: false, error: 'Account not found' };
      }

      // IBAN is required for SEPA
      if (!account.iban) {
        return { valid: false, error: 'IBAN required for SEPA transfers' };
      }

      // Basic IBAN validation (length and format)
      if (!this.validateIBAN(account.iban)) {
        return { valid: false, error: 'Invalid IBAN format' };
      }

      // Currency must be EUR
      if (account.currency !== 'EUR') {
        return { valid: false, error: 'SEPA transfers require EUR currency' };
      }

      return { valid: true };

    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  getCapabilities() {
    return {
      supportsInstantSettlement: true, // SCT Inst
      supportsCancellation: true, // Before execution
      supportsStatusCheck: true,
      maxAmount: 999999.99, // SCT Inst limit
      minAmount: 0.01,
      supportedCurrencies: ['EUR']
    };
  }

  /**
   * Check if amount is eligible for SEPA Instant
   * SCT Inst has a limit of €100,000 (can vary by country)
   */
  private isInstantEligible(amount: number): boolean {
    return amount <= 100000;
  }

  /**
   * Validate IBAN format
   */
  private validateIBAN(iban: string): boolean {
    // Remove spaces and convert to uppercase
    const cleanIBAN = iban.replace(/\s/g, '').toUpperCase();

    // Check length (15-34 characters)
    if (cleanIBAN.length < 15 || cleanIBAN.length > 34) {
      return false;
    }

    // Check format (2 letters + 2 digits + alphanumeric)
    const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/;
    return ibanRegex.test(cleanIBAN);
  }

  /**
   * Calculate settlement date
   */
  private calculateSettlementDate(isInstant: boolean): string {
    const now = new Date();

    if (isInstant) {
      // SCT Inst: within 10 seconds (same day)
      return now.toISOString().split('T')[0];
    }

    // SCT: T+1 business day
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Skip weekends
    while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
      tomorrow.setDate(tomorrow.getDate() + 1);
    }

    return tomorrow.toISOString().split('T')[0];
  }

  /**
   * Map bank status
   */
  private mapBankStatus(bankStatus: string): PayoutStatusResponse['status'] {
    const statusMap: Record<string, PayoutStatusResponse['status']> = {
      'pending': 'pending',
      'processing': 'processing',
      'executed': 'sent',
      'completed': 'settled',
      'settled': 'settled',
      'failed': 'failed',
      'rejected': 'failed',
      'returned': 'failed',
      'cancelled': 'reversed',
      'reversed': 'reversed'
    };

    return statusMap[bankStatus.toLowerCase()] || 'pending';
  }
}
