/**
 * Network Connector Interface
 * Defines the contract for network-specific dispute submission connectors
 */

export interface NetworkDisputeSubmission {
  dispute_id: string;
  dispute_ref: string;
  merchant_id: string;
  amount: number;
  currency: string;
  reason_code: string;
  evidence: Array<{
    type: string;
    s3_key: string;
    file_name: string;
    mime_type: string;
  }>;
  notes?: string;
}

export interface NetworkSubmissionResponse {
  success: boolean;
  provider_ref: string; // Network's reference ID
  status: string; // submitted|accepted|rejected
  message?: string;
  estimated_resolution_date?: string;
  raw_response?: any;
}

export interface NetworkConnector {
  /**
   * Network identifier (visa, mastercard, amex, etc.)
   */
  readonly network: string;

  /**
   * Submit dispute evidence to network
   */
  submitDispute(submission: NetworkDisputeSubmission): Promise<NetworkSubmissionResponse>;

  /**
   * Check status of a submitted dispute
   */
  checkStatus(providerRef: string): Promise<{
    status: string;
    last_updated: string;
    outcome?: string;
    raw_response?: any;
  }>;

  /**
   * Withdraw a dispute
   */
  withdrawDispute(providerRef: string, reason?: string): Promise<{
    success: boolean;
    message?: string;
  }>;
}

/**
 * Network Connector Registry
 * Manages available network connectors
 */
export class NetworkConnectorRegistry {
  private static connectors: Map<string, NetworkConnector> = new Map();

  static register(network: string, connector: NetworkConnector): void {
    this.connectors.set(network.toLowerCase(), connector);
    console.log(`[NetworkConnectorRegistry] Registered connector for ${network}`);
  }

  static get(network: string): NetworkConnector {
    const connector = this.connectors.get(network.toLowerCase());
    if (!connector) {
      throw new Error(`No connector registered for network: ${network}`);
    }
    return connector;
  }

  static has(network: string): boolean {
    return this.connectors.has(network.toLowerCase());
  }

  static getAvailableNetworks(): string[] {
    return Array.from(this.connectors.keys());
  }
}
