// Sandbox Bank Connector
// Mock connector for testing and development

import {
  BaseBankConnector,
  PayoutRequest,
  PayoutResponse,
  BatchPayoutRequest,
  BatchPayoutResponse,
  PayoutStatusQuery,
  PayoutStatusResponse,
  ConnectorHealth,
} from './base-connector';
import { v4 as uuidv4 } from 'uuid';

export class SandboxConnector extends BaseBankConnector {
  private mockPayouts: Map<string, any>;
  private simulateFailureRate: number;
  private simulateLatencyMs: number;

  constructor(config: any = {}) {
    super('sandbox', config);
    this.mockPayouts = new Map();
    this.simulateFailureRate = config.failure_rate || 0.05; // 5% default failure rate
    this.simulateLatencyMs = config.latency_ms || 500;
  }

  async sendPayment(request: PayoutRequest): Promise<PayoutResponse> {
    // Simulate network latency
    await this.sleep(this.simulateLatencyMs);

    // Validate beneficiary
    const validation = this.validateBeneficiary(request.beneficiary);
    if (!validation.valid) {
      return {
        success: false,
        provider_ref: '',
        status: 'failed',
        error_code: 'INVALID_BENEFICIARY',
        error_message: validation.errors.join(', '),
      };
    }

    // Simulate random failures
    if (Math.random() < this.simulateFailureRate) {
      const errorCodes = ['INSUFFICIENT_FUNDS', 'INVALID_ACCOUNT', 'NETWORK_ERROR', 'TIMEOUT'];
      const errorCode = errorCodes[Math.floor(Math.random() * errorCodes.length)];

      return {
        success: false,
        provider_ref: '',
        status: 'failed',
        error_code: errorCode,
        error_message: this.getErrorMessage(errorCode),
      };
    }

    // Generate provider reference
    const provider_ref = `SANDBOX-${uuidv4().substring(0, 8).toUpperCase()}`;

    // Store mock payout
    this.mockPayouts.set(provider_ref, {
      ...request,
      provider_ref,
      status: request.urgency === 'instant' ? 'sent' : 'processing',
      created_at: new Date(),
      settled_at: null,
    });

    // Simulate instant settlement for instant payouts
    if (request.urgency === 'instant') {
      setTimeout(() => {
        const payout = this.mockPayouts.get(provider_ref);
        if (payout) {
          payout.status = 'settled';
          payout.settled_at = new Date();
        }
      }, 10000); // Settle after 10 seconds
    }

    return {
      success: true,
      provider_ref,
      status: request.urgency === 'instant' ? 'sent' : 'processing',
      estimated_settlement_date: this.estimateSettlementDate(request.urgency),
      fee_charged: this.calculateFee(request),
      metadata: {
        connector: 'sandbox',
        simulated: true,
      },
    };
  }

  async sendBatch(request: BatchPayoutRequest): Promise<BatchPayoutResponse> {
    // Simulate batch processing latency
    await this.sleep(this.simulateLatencyMs * 2);

    const provider_batch_ref = `BATCH-${uuidv4().substring(0, 12).toUpperCase()}`;
    const rejected_items: Array<{
      payout_id: string;
      error_code: string;
      error_message: string;
    }> = [];

    let accepted_count = 0;

    // Process each payout in batch
    for (const payout of request.payouts) {
      // Simulate random rejections
      if (Math.random() < this.simulateFailureRate) {
        rejected_items.push({
          payout_id: payout.payout_id,
          error_code: 'INVALID_ACCOUNT',
          error_message: 'Account validation failed',
        });
      } else {
        const provider_ref = `${provider_batch_ref}-${String(accepted_count).padStart(4, '0')}`;

        this.mockPayouts.set(provider_ref, {
          ...payout,
          provider_ref,
          batch_ref: provider_batch_ref,
          status: 'processing',
          created_at: new Date(),
        });

        accepted_count++;
      }
    }

    return {
      success: true,
      provider_batch_ref,
      status: 'submitted',
      accepted_count,
      rejected_count: rejected_items.length,
      rejected_items: rejected_items.length > 0 ? rejected_items : undefined,
      metadata: {
        connector: 'sandbox',
        batch_size: request.payouts.length,
      },
    };
  }

  async getPayoutStatus(query: PayoutStatusQuery): Promise<PayoutStatusResponse> {
    // Simulate API latency
    await this.sleep(200);

    const payout = this.mockPayouts.get(query.provider_ref);

    if (!payout) {
      return {
        provider_ref: query.provider_ref,
        status: 'failed',
        failure_reason: 'Payout not found',
      };
    }

    // Simulate progressive status updates
    const now = new Date();
    const ageMinutes = (now.getTime() - payout.created_at.getTime()) / (1000 * 60);

    let status = payout.status;

    // Auto-progress status based on time
    if (payout.urgency !== 'instant') {
      if (ageMinutes > 60) {
        status = 'settled';
        payout.status = 'settled';
        payout.settled_at = new Date(payout.created_at.getTime() + 60 * 60 * 1000);
      } else if (ageMinutes > 30) {
        status = 'sent';
        payout.status = 'sent';
      }
    }

    return {
      provider_ref: query.provider_ref,
      status,
      settled_at: payout.settled_at ? payout.settled_at.toISOString() : undefined,
      settled_amount: status === 'settled' ? payout.amount : undefined,
      metadata: {
        age_minutes: Math.floor(ageMinutes),
      },
    };
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now();

    // Simulate health check
    await this.sleep(50);

    return {
      healthy: true,
      latency_ms: Date.now() - start,
      last_check: new Date(),
    };
  }

  async cancelPayout(provider_ref: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const payout = this.mockPayouts.get(provider_ref);

    if (!payout) {
      return {
        success: false,
        error: 'Payout not found',
      };
    }

    if (payout.status === 'settled' || payout.status === 'sent') {
      return {
        success: false,
        error: 'Cannot cancel payout that has already been sent',
      };
    }

    payout.status = 'cancelled';

    return {
      success: true,
    };
  }

  getCapabilities() {
    return {
      instant_payments: true,
      batch_payments: true,
      cancellation: true,
      status_webhooks: false,
    };
  }

  // Helper methods

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateFee(request: PayoutRequest): number {
    if (request.urgency === 'instant') {
      return request.currency === 'USD' ? 5.0 : 2.5;
    }
    return request.currency === 'USD' ? 1.0 : 0.5;
  }

  private estimateSettlementDate(urgency?: string): string {
    const now = new Date();

    if (urgency === 'instant') {
      // 30 minutes
      now.setMinutes(now.getMinutes() + 30);
    } else {
      // 1 business day
      now.setDate(now.getDate() + 1);
    }

    return now.toISOString();
  }

  private getErrorMessage(errorCode: string): string {
    const messages: Record<string, string> = {
      INSUFFICIENT_FUNDS: 'Insufficient funds in treasury account',
      INVALID_ACCOUNT: 'Beneficiary account number is invalid',
      NETWORK_ERROR: 'Network error connecting to bank',
      TIMEOUT: 'Request timeout',
    };

    return messages[errorCode] || 'Unknown error';
  }

  /**
   * Utility method to simulate settlement of pending payouts
   * (useful for testing)
   */
  settlePendingPayouts(): number {
    let settled = 0;

    this.mockPayouts.forEach((payout) => {
      if (payout.status === 'processing' || payout.status === 'sent') {
        payout.status = 'settled';
        payout.settled_at = new Date();
        settled++;
      }
    });

    return settled;
  }

  /**
   * Get all mock payouts (for testing)
   */
  getMockPayouts(): Map<string, any> {
    return this.mockPayouts;
  }

  /**
   * Clear all mock payouts (for testing)
   */
  clearMockPayouts(): void {
    this.mockPayouts.clear();
  }
}
