// ============================================================================
// Brique 121 — Bank Connectors TypeScript Types & Interfaces
// ============================================================================
// Purpose: Common contracts for all bank connector implementations
// ============================================================================

/**
 * Payout slice to be sent to bank
 */
export interface PayoutSlice {
  id: string;
  parent_payout_id: string;
  slice_amount: number;
  currency: string;
  beneficiary: BeneficiaryInfo;
  idempotency_key: string;
  reference_code?: string; // Our reference for reconciliation
  metadata?: Record<string, any>;
}

/**
 * Beneficiary information
 */
export interface BeneficiaryInfo {
  name: string;
  bank_account: BankAccountInfo;
  address?: string;
  phone?: string;
  email?: string;
  tax_id?: string;
  metadata?: Record<string, any>;
}

/**
 * Bank account details
 */
export interface BankAccountInfo {
  iban?: string;
  account_number?: string;
  sort_code?: string;
  bank_code?: string;
  bank_name?: string;
  swift_bic?: string;
  country?: string;
  currency?: string;
  routing_number?: string;
  branch_code?: string;
}

/**
 * Result of sending payment to bank
 */
export interface BankSendResult {
  status: 'sent' | 'failed' | 'queued' | 'pending';
  provider_ref?: string; // Bank's reference/transaction ID
  estimated_settlement_date?: string;
  details?: Record<string, any>;
  error_code?: string;
  error_message?: string;
}

/**
 * Payment status from bank
 */
export interface BankPaymentStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  provider_ref?: string;
  settlement_date?: string;
  failure_reason?: string;
  details?: Record<string, any>;
}

/**
 * Normalized bank statement line
 */
export interface BankStatementLine {
  id?: string;
  statement_date?: string;
  value_date?: string;
  amount: number;
  currency: string;
  debit_credit?: 'debit' | 'credit';
  description?: string;
  reference?: string;
  bank_reference?: string;
  transaction_code?: string;
  counterparty_name?: string;
  counterparty_account?: string;
  raw?: any;
}

/**
 * File upload metadata
 */
export interface StatementFileMetadata {
  bank_profile_id: string;
  file_name: string;
  statement_date?: string;
  file_size?: number;
  file_hash?: string;
}

/**
 * Connector configuration
 */
export interface ConnectorConfig {
  endpoint?: string;
  api_key?: string;
  vault_secret_key?: string;
  vault_hmac_key?: string;
  vault_cert_path?: string;
  hmac_key?: string;
  timeout_ms?: number;
  retry_attempts?: number;
  retry_delay_ms?: number;
  circuit_breaker_threshold?: number;
  circuit_breaker_timeout_ms?: number;
  bank_profile_id?: string;

  // SFTP/FTP specific
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  privateKey?: string;
  remote_path?: string;
  archive_path?: string;

  // ISO20022 specific
  hsm_sign?: boolean;
  signing_key_id?: string;
  message_id_prefix?: string;
  debtor_iban?: string;
  debtor_name?: string;
  debtor_bic?: string;

  // Custom metadata
  metadata?: Record<string, any>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  latency_ms?: number;
  details?: Record<string, any>;
  error?: string;
}

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

/**
 * Connector execution context
 */
export interface ConnectorContext {
  trace_id: string;
  connector_id: string;
  operation: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Main BankConnector interface - all connectors must implement this
 */
export interface BankConnector {
  /** Connector name/identifier */
  name: string;

  /** Connector type */
  type: 'rest' | 'mt940' | 'iso20022' | 'local' | 'csv' | 'camt053';

  /**
   * Initialize connector with configuration
   * Load secrets from Vault, establish connections, etc.
   */
  init(config: ConnectorConfig): Promise<void>;

  /**
   * Send a payment to the bank
   * Must respect idempotency_key
   */
  sendPayment(slice: PayoutSlice, context?: ConnectorContext): Promise<BankSendResult>;

  /**
   * Get payment status from bank
   */
  getPaymentStatus(providerRef: string, context?: ConnectorContext): Promise<BankPaymentStatus>;

  /**
   * Upload statement file to connector (if supported)
   * Returns imported statement ID for later parsing
   */
  uploadStatement(fileBuffer: Buffer, meta: StatementFileMetadata, context?: ConnectorContext): Promise<{ imported_id: string }>;

  /**
   * Parse previously uploaded statement
   * Returns normalized statement lines
   */
  parseStatement(importedId: string, context?: ConnectorContext): Promise<BankStatementLine[]>;

  /**
   * Health check - verify connector is operational
   */
  healthcheck(context?: ConnectorContext): Promise<HealthCheckResult>;

  /**
   * Cleanup resources (close connections, etc.)
   */
  shutdown?(): Promise<void>;
}

/**
 * Connector registry entry
 */
export interface ConnectorRegistryEntry {
  id: string;
  bank_profile_id: string;
  connector_type: string;
  config: ConnectorConfig;
  priority: number;
  status: 'active' | 'inactive' | 'maintenance' | 'failed';
  circuit_breaker_state: CircuitBreakerState;
  failure_count: number;
  last_failure?: Date;
  last_health_check?: Date;
  health_status?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Connector metrics for observability
 */
export interface ConnectorMetrics {
  connector_id: string;
  connector_type: string;
  operation: string;
  success_count: number;
  failure_count: number;
  total_latency_ms: number;
  avg_latency_ms: number;
  last_success?: Date;
  last_failure?: Date;
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  max_attempts: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
  jitter: boolean;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failure_threshold: number;
  success_threshold: number;
  timeout_ms: number;
  half_open_max_calls: number;
}

/**
 * Bank profile info
 */
export interface BankProfile {
  id: string;
  bank_name: string;
  bank_code?: string;
  country: string;
  swift_bic?: string;
  supported_rails: string[];
  metadata?: Record<string, any>;
  status: string;
}

/**
 * Error types
 */
export class ConnectorError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false,
    public details?: any
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export class ConnectorTimeoutError extends ConnectorError {
  constructor(message: string, details?: any) {
    super(message, 'TIMEOUT', true, details);
    this.name = 'ConnectorTimeoutError';
  }
}

export class ConnectorNetworkError extends ConnectorError {
  constructor(message: string, details?: any) {
    super(message, 'NETWORK_ERROR', true, details);
    this.name = 'ConnectorNetworkError';
  }
}

export class ConnectorAuthError extends ConnectorError {
  constructor(message: string, details?: any) {
    super(message, 'AUTH_ERROR', false, details);
    this.name = 'ConnectorAuthError';
  }
}

export class ConnectorValidationError extends ConnectorError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', false, details);
    this.name = 'ConnectorValidationError';
  }
}

export class CircuitBreakerOpenError extends ConnectorError {
  constructor(connectorId: string) {
    super(`Circuit breaker open for connector ${connectorId}`, 'CIRCUIT_OPEN', false);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Type guards
 */
export function isRetryableError(error: any): boolean {
  return error instanceof ConnectorError && error.retryable;
}

export function shouldRetry(error: any, attempt: number, maxAttempts: number): boolean {
  if (attempt >= maxAttempts) return false;
  return isRetryableError(error);
}

// ============================================================================
// End of types
// ============================================================================
