/**
 * Brique 85 — Bank Connectors
 * Connector Interface (Industrial Contract)
 *
 * Abstract interface that all bank connectors must implement
 * Supports: REST APIs, MT940 files, ISO20022, local rails
 */

// =====================================================================
// TYPES
// =====================================================================

export type ConnectorStatus = 'accepted' | 'sent' | 'settled' | 'failed' | 'rejected' | 'pending';

export interface ConnectorResult {
  status: ConnectorStatus;
  provider_ref?: string;      // Bank's transaction reference
  provider_code?: string;      // Bank's response code
  provider_message?: string;   // Bank's response message
  details?: any;               // Additional metadata from bank
  latency_ms?: number;         // Request latency
}

export interface PaymentRequest {
  // Payout context
  payoutId: string;
  reference_code: string;      // External reference (end-to-end ID)
  idempotencyKey: string;      // For preventing duplicates

  // Beneficiary
  beneficiary: BankAccount;

  // Amount
  amount: number;
  currency: string;

  // Payment details
  description?: string;
  remittance_info?: string;

  // Metadata
  metadata?: Record<string, any>;

  // Timing
  requested_execution_date?: string; // ISO date for future-dated payments
  urgency?: 'standard' | 'urgent' | 'instant';
}

export interface BankAccount {
  // Basic info
  account_holder_name: string;
  bank_name?: string;

  // US/Domestic
  account_number?: string;
  routing_number?: string;

  // International
  iban?: string;
  swift_code?: string;
  bic?: string;

  // Country-specific
  sort_code?: string;          // UK
  bsb?: string;                // Australia
  ifsc?: string;               // India
  branch_code?: string;        // Japan

  // Address (required for some rails)
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
  };

  // Metadata
  metadata?: Record<string, any>;
}

export interface StatementUploadResult {
  imported_id: string;         // Unique ID for this import
  file_name?: string;
  imported_at?: string;
  lines_count?: number;
}

export interface StatementLine {
  // Transaction details
  transaction_date: string;    // ISO date
  value_date?: string;         // ISO date
  amount: number;
  currency: string;
  debit_credit: 'D' | 'C';     // Debit or Credit

  // References
  bank_reference?: string;
  end_to_end_id?: string;      // ISO20022 EndToEndId
  transaction_id?: string;

  // Description
  description?: string;
  remittance_info?: string;

  // Counterparty (if available)
  counterparty_name?: string;
  counterparty_account?: string;
  counterparty_iban?: string;

  // Balance (if provided)
  balance_after?: number;

  // Metadata
  metadata?: Record<string, any>;
}

export interface HealthCheckResult {
  ok: boolean;
  latency_ms?: number;
  details?: Record<string, any>;
  error?: string;
  timestamp?: string;
}

export interface ConnectorCapabilities {
  supports_idempotency: boolean;
  supports_status_check: boolean;
  supports_cancellation: boolean;
  supports_statement_upload: boolean;
  supports_realtime_webhooks: boolean;
  supports_future_dated: boolean;
  max_amount?: number;
  min_amount?: number;
  supported_currencies: string[];
  supported_rails: string[];
}

// =====================================================================
// BANK CONNECTOR INTERFACE
// =====================================================================

export abstract class BankConnector {
  public readonly name: string;
  public readonly bankProfileId: string;
  public readonly connectorType: string;

  constructor(name: string, bankProfileId: string, connectorType: string) {
    this.name = name;
    this.bankProfileId = bankProfileId;
    this.connectorType = connectorType;
  }

  /**
   * Health check - verify connector is operational
   * Called periodically to monitor connector health
   */
  abstract healthCheck(): Promise<HealthCheckResult>;

  /**
   * Send payment to bank
   * Must be idempotent (use request.idempotencyKey)
   */
  abstract sendPayment(
    request: PaymentRequest,
    opts?: { timeoutMs?: number }
  ): Promise<ConnectorResult>;

  /**
   * Get payment status from bank
   * Uses provider_ref from sendPayment response
   */
  abstract getPaymentStatus(providerRef: string): Promise<ConnectorResult>;

  /**
   * Cancel/reverse a payment (if supported)
   * Returns success=true if cancelled, false if not supported or failed
   */
  abstract cancelPayment(providerRef: string, reason?: string): Promise<ConnectorResult>;

  /**
   * Upload bank statement file (for file-based connectors)
   * Returns import ID for later parsing
   */
  abstract uploadStatement(
    fileBuffer: Buffer,
    meta?: { fileName?: string; fileType?: string }
  ): Promise<StatementUploadResult>;

  /**
   * Parse uploaded statement into normalized lines
   * Returns array of statement lines ready for reconciliation
   */
  abstract parseStatement(importedId: string): Promise<StatementLine[]>;

  /**
   * Get connector capabilities
   * Describes what this connector supports
   */
  abstract getCapabilities(): ConnectorCapabilities;

  /**
   * Validate request before sending
   * Override for connector-specific validation
   */
  async validateRequest(request: PaymentRequest): Promise<{ valid: boolean; error?: string }> {
    // Basic validation
    if (!request.payoutId) {
      return { valid: false, error: 'Missing payoutId' };
    }

    if (!request.reference_code) {
      return { valid: false, error: 'Missing reference_code' };
    }

    if (!request.idempotencyKey) {
      return { valid: false, error: 'Missing idempotencyKey' };
    }

    if (!request.amount || request.amount <= 0) {
      return { valid: false, error: 'Invalid amount' };
    }

    if (!request.currency) {
      return { valid: false, error: 'Missing currency' };
    }

    if (!request.beneficiary) {
      return { valid: false, error: 'Missing beneficiary' };
    }

    // Check capabilities
    const capabilities = this.getCapabilities();

    if (!capabilities.supported_currencies.includes(request.currency)) {
      return { valid: false, error: `Currency ${request.currency} not supported` };
    }

    if (capabilities.max_amount && request.amount > capabilities.max_amount) {
      return { valid: false, error: `Amount exceeds maximum ${capabilities.max_amount}` };
    }

    if (capabilities.min_amount && request.amount < capabilities.min_amount) {
      return { valid: false, error: `Amount below minimum ${capabilities.min_amount}` };
    }

    return { valid: true };
  }
}

// =====================================================================
// CONNECTOR ERROR CLASSES
// =====================================================================

export class ConnectorError extends Error {
  constructor(
    public code: string,
    message: string,
    public provider_code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export class ConnectorTimeoutError extends ConnectorError {
  constructor(message: string, details?: any) {
    super('TIMEOUT', message, undefined, details);
    this.name = 'ConnectorTimeoutError';
  }
}

export class ConnectorAuthError extends ConnectorError {
  constructor(message: string, provider_code?: string, details?: any) {
    super('AUTH_ERROR', message, provider_code, details);
    this.name = 'ConnectorAuthError';
  }
}

export class ConnectorNetworkError extends ConnectorError {
  constructor(message: string, details?: any) {
    super('NETWORK_ERROR', message, undefined, details);
    this.name = 'ConnectorNetworkError';
  }
}

export class ConnectorValidationError extends ConnectorError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', message, undefined, details);
    this.name = 'ConnectorValidationError';
  }
}

export class ConnectorRejectedError extends ConnectorError {
  constructor(message: string, provider_code?: string, details?: any) {
    super('REJECTED', message, provider_code, details);
    this.name = 'ConnectorRejectedError';
  }
}

// =====================================================================
// HELPER TYPES
// =====================================================================

export interface ConnectorConfig {
  // Common config fields
  endpoint?: string;
  auth_type?: 'bearer' | 'basic' | 'mTLS' | 'api_key';
  timeout_ms?: number;
  retry_count?: number;
  idempotency_enabled?: boolean;

  // File-based config
  sftp_host?: string;
  sftp_port?: number;
  sftp_path?: string;
  poll_interval_minutes?: number;
  parser_variant?: string;

  // ISO20022 config
  message_types?: string[];
  signing_required?: boolean;
  hsm_enabled?: boolean;
  schema_version?: string;

  // Security
  vault_path?: string;
  mtls_cert_path?: string;

  // Custom fields
  [key: string]: any;
}

export interface ConnectorContext {
  // Database connection
  db: any; // Pool or client

  // Secrets management
  getSecret: (path: string) => Promise<string>;

  // Logging
  logger: {
    info: (message: string, meta?: any) => void;
    error: (message: string, meta?: any) => void;
    warn: (message: string, meta?: any) => void;
    debug: (message: string, meta?: any) => void;
  };

  // Event recording
  recordEvent: (event: {
    connector_id: string;
    bank_profile_id: string;
    direction: 'outbound' | 'inbound' | 'internal';
    event_type: string;
    status: 'success' | 'failed' | 'pending';
    provider_ref?: string;
    latency_ms?: number;
    metadata?: Record<string, any>;
  }) => Promise<string>;
}
