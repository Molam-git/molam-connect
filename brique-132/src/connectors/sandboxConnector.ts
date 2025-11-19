// ============================================================================
// Sandbox Bank Connector - For testing and development
// ============================================================================

import { BankConnector } from "./bankConnectorInterface";

export class SandboxBankConnector implements BankConnector {
  name = "SandboxBank";
  type: "REST" = "REST";

  private simulatedLatency = 500; // ms
  private failureRate = 0.05; // 5% failure rate

  /**
   * Simulate sending payment to bank
   */
  async sendPayment(payout: any): Promise<{
    status: "sent" | "failed";
    provider_ref?: string;
    http_code?: number;
    details?: any;
  }> {
    // Simulate network latency
    await this.delay(this.simulatedLatency);

    // Simulate random failures
    if (Math.random() < this.failureRate) {
      return {
        status: "failed",
        http_code: 500,
        details: { error: "Simulated bank API error" },
      };
    }

    // Generate mock provider reference
    const providerRef = `SBX-${Date.now()}-${this.randomId()}`;

    return {
      status: "sent",
      provider_ref: providerRef,
      http_code: 200,
      details: {
        simulated: true,
        payout_id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Query payment status from bank
   */
  async getPaymentStatus(provider_ref: string): Promise<{
    status: string;
    details?: any;
  }> {
    await this.delay(200);

    // Simulate status progression
    // In real scenario, this would query actual bank API
    return {
      status: "settled",
      details: {
        provider_ref,
        settled_at: new Date().toISOString(),
        simulated: true,
      },
    };
  }

  /**
   * Upload bank statement (mock)
   */
  async uploadStatement(
    fileBuffer: Buffer,
    meta: any
  ): Promise<{ imported_id: string }> {
    await this.delay(300);

    const importedId = `STMT-${Date.now()}-${this.randomId()}`;

    return { imported_id: importedId };
  }

  /**
   * Parse bank statement (mock)
   */
  async parseStatement(imported_id: string): Promise<any[]> {
    await this.delay(500);

    // Return mock statement lines
    return [
      {
        id: this.randomId(),
        date: new Date().toISOString(),
        reference: `SBX-${Date.now()}-${this.randomId()}`,
        amount: 100.0,
        currency: "USD",
        description: "Simulated payout settlement",
      },
    ];
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    await this.delay(100);
    return true;
  }

  // Helper methods
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private randomId(): string {
    return Math.random().toString(36).substring(2, 9).toUpperCase();
  }
}

/**
 * Create and export sandbox connector instance
 */
export const sandboxConnector = new SandboxBankConnector();
