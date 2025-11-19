// ============================================================================
// Bank Connector Interface - Pluggable bank integration
// ============================================================================

export interface BankConnector {
  name: string;
  type: "REST" | "MT940" | "ISO20022" | "SFTP";

  /**
   * Send a payout to the bank
   */
  sendPayment(payout: any): Promise<{
    status: "sent" | "failed";
    provider_ref?: string;
    http_code?: number;
    details?: any;
  }>;

  /**
   * Query payment status from bank
   */
  getPaymentStatus(provider_ref: string): Promise<{
    status: string;
    details?: any;
  }>;

  /**
   * Upload bank statement file
   */
  uploadStatement?(
    fileBuffer: Buffer,
    meta: any
  ): Promise<{ imported_id: string }>;

  /**
   * Parse uploaded bank statement
   */
  parseStatement?(imported_id: string): Promise<any[]>;

  /**
   * Health check
   */
  healthCheck?(): Promise<boolean>;
}

/**
 * Connector factory registry
 */
const connectorRegistry = new Map<string, BankConnector>();

export function registerConnector(
  bankProfileId: string,
  connector: BankConnector
) {
  connectorRegistry.set(bankProfileId, connector);
}

export function getConnectorForBank(bankProfileId: string): BankConnector {
  const connector = connectorRegistry.get(bankProfileId);
  if (!connector) {
    throw new Error(`No connector registered for bank ${bankProfileId}`);
  }
  return connector;
}

export function listConnectors(): string[] {
  return Array.from(connectorRegistry.keys());
}
