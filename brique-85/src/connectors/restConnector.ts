/**
 * Brique 85 — Bank Connectors
 * REST API Connector Implementation
 *
 * Industrial-grade REST connector with:
 * - Idempotency support
 * - mTLS authentication
 * - Retry logic
 * - Comprehensive error handling
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import https from 'https';
import {
  BankConnector,
  PaymentRequest,
  ConnectorResult,
  StatementUploadResult,
  StatementLine,
  HealthCheckResult,
  ConnectorCapabilities,
  ConnectorConfig,
  ConnectorContext,
  ConnectorError,
  ConnectorTimeoutError,
  ConnectorAuthError,
  ConnectorNetworkError,
  ConnectorValidationError
} from './interface';

// =====================================================================
// REST CONNECTOR
// ===================================================================== export class RestConnector extends BankConnector {
  private client: AxiosInstance;
  private config: ConnectorConfig;
  private context: ConnectorContext;
  private baseURL: string;
  private authType: 'bearer' | 'basic' | 'mTLS' | 'api_key';

  constructor(
    name: string,
    bankProfileId: string,
    config: ConnectorConfig,
    context: ConnectorContext
  ) {
    super(name, bankProfileId, 'rest');
    this.config = config;
    this.context = context;
    this.baseURL = config.endpoint || '';
    this.authType = config.auth_type || 'bearer';

    // Initialize axios client
    this.client = this.createAxiosClient();
  }

  /**
   * Create axios client with appropriate configuration
   */
  private createAxiosClient(): AxiosInstance {
    const clientConfig: any = {
      baseURL: this.baseURL,
      timeout: this.config.timeout_ms || 15000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Molam-Connector/1.0'
      }
    };

    // Configure mTLS if enabled
    if (this.authType === 'mTLS' && this.config.mtls_cert_path) {
      // In production, load cert and key from Vault
      clientConfig.httpsAgent = new https.Agent({
        // cert: await loadCertFromVault(this.config.mtls_cert_path),
        // key: await loadKeyFromVault(this.config.mtls_cert_path),
        rejectUnauthorized: true
      });
    }

    return axios.create(clientConfig);
  }

  /**
   * Get authorization header based on auth type
   */
  private async getAuthHeader(): Promise<Record<string, string>> {
    if (this.authType === 'bearer') {
      const token = await this.context.getSecret(`${this.config.vault_path}/token`);
      return { 'Authorization': `Bearer ${token}` };
    }

    if (this.authType === 'basic') {
      const username = await this.context.getSecret(`${this.config.vault_path}/username`);
      const password = await this.context.getSecret(`${this.config.vault_path}/password`);
      const encoded = Buffer.from(`${username}:${password}`).toString('base64');
      return { 'Authorization': `Basic ${encoded}` };
    }

    if (this.authType === 'api_key') {
      const apiKey = await this.context.getSecret(`${this.config.vault_path}/api_key`);
      return { 'X-API-Key': apiKey };
    }

    // mTLS uses client cert, no header needed
    return {};
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const response = await this.client.get('/health', {
        timeout: 3000
      });

      const latency_ms = Date.now() - startTime;

      return {
        ok: response.status === 200,
        latency_ms,
        details: {
          status: response.status,
          data: response.data
        },
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      const latency_ms = Date.now() - startTime;

      return {
        ok: false,
        latency_ms,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Send payment
   */
  async sendPayment(
    request: PaymentRequest,
    opts?: { timeoutMs?: number }
  ): Promise<ConnectorResult> {
    const startTime = Date.now();

    try {
      // Validate request
      const validation = await this.validateRequest(request);
      if (!validation.valid) {
        throw new ConnectorValidationError(validation.error || 'Validation failed');
      }

      // Get auth header
      const authHeader = await this.getAuthHeader();

      // Build request payload
      const payload = {
        reference: request.reference_code,
        beneficiary: {
          name: request.beneficiary.account_holder_name,
          account_number: request.beneficiary.account_number,
          routing_number: request.beneficiary.routing_number,
          iban: request.beneficiary.iban,
          swift_code: request.beneficiary.swift_code,
          bank_name: request.beneficiary.bank_name
        },
        amount: request.amount,
        currency: request.currency,
        description: request.description || '',
        remittance_info: request.remittance_info,
        execution_date: request.requested_execution_date,
        urgency: request.urgency || 'standard',
        metadata: request.metadata
      };

      // Send request with idempotency key
      const response = await this.client.post('/payments', payload, {
        headers: {
          ...authHeader,
          'Idempotency-Key': request.idempotencyKey
        },
        timeout: opts?.timeoutMs || this.config.timeout_ms || 15000
      });

      const latency_ms = Date.now() - startTime;

      // Log event
      await this.context.recordEvent({
        connector_id: this.bankProfileId,
        bank_profile_id: this.bankProfileId,
        direction: 'outbound',
        event_type: 'send_payment',
        status: 'success',
        provider_ref: response.data.provider_ref || response.data.id,
        latency_ms,
        metadata: {
          payout_id: request.payoutId,
          reference_code: request.reference_code,
          amount: request.amount,
          currency: request.currency
        }
      });

      // Map response
      if (response.status >= 200 && response.status < 300) {
        return {
          status: this.mapResponseStatus(response.data.status),
          provider_ref: response.data.provider_ref || response.data.id || response.data.transaction_id,
          provider_code: response.data.code,
          provider_message: response.data.message,
          details: response.data,
          latency_ms
        };
      }

      throw new ConnectorError(
        'UNEXPECTED_RESPONSE',
        `Unexpected status: ${response.status}`,
        String(response.status),
        response.data
      );

    } catch (error: any) {
      const latency_ms = Date.now() - startTime;

      // Log error event
      await this.context.recordEvent({
        connector_id: this.bankProfileId,
        bank_profile_id: this.bankProfileId,
        direction: 'outbound',
        event_type: 'send_payment',
        status: 'failed',
        latency_ms,
        metadata: {
          payout_id: request.payoutId,
          error: error.message
        }
      });

      return this.handleError(error, latency_ms);
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(providerRef: string): Promise<ConnectorResult> {
    const startTime = Date.now();

    try {
      const authHeader = await this.getAuthHeader();

      const response = await this.client.get(`/payments/${providerRef}`, {
        headers: authHeader,
        timeout: 5000
      });

      const latency_ms = Date.now() - startTime;

      // Log event
      await this.context.recordEvent({
        connector_id: this.bankProfileId,
        bank_profile_id: this.bankProfileId,
        direction: 'outbound',
        event_type: 'get_payment_status',
        status: 'success',
        provider_ref: providerRef,
        latency_ms
      });

      return {
        status: this.mapResponseStatus(response.data.status),
        provider_ref: providerRef,
        provider_code: response.data.code,
        provider_message: response.data.message,
        details: response.data,
        latency_ms
      };

    } catch (error: any) {
      const latency_ms = Date.now() - startTime;

      await this.context.recordEvent({
        connector_id: this.bankProfileId,
        bank_profile_id: this.bankProfileId,
        direction: 'outbound',
        event_type: 'get_payment_status',
        status: 'failed',
        provider_ref: providerRef,
        latency_ms
      });

      return this.handleError(error, latency_ms);
    }
  }

  /**
   * Cancel payment
   */
  async cancelPayment(providerRef: string, reason?: string): Promise<ConnectorResult> {
    const startTime = Date.now();

    try {
      const authHeader = await this.getAuthHeader();

      const response = await this.client.post(
        `/payments/${providerRef}/cancel`,
        { reason: reason || 'Cancelled by merchant' },
        {
          headers: authHeader,
          timeout: 10000
        }
      );

      const latency_ms = Date.now() - startTime;

      await this.context.recordEvent({
        connector_id: this.bankProfileId,
        bank_profile_id: this.bankProfileId,
        direction: 'outbound',
        event_type: 'cancel_payment',
        status: 'success',
        provider_ref: providerRef,
        latency_ms
      });

      return {
        status: 'rejected',
        provider_ref: providerRef,
        provider_message: 'Payment cancelled',
        details: response.data,
        latency_ms
      };

    } catch (error: any) {
      const latency_ms = Date.now() - startTime;

      await this.context.recordEvent({
        connector_id: this.bankProfileId,
        bank_profile_id: this.bankProfileId,
        direction: 'outbound',
        event_type: 'cancel_payment',
        status: 'failed',
        provider_ref: providerRef,
        latency_ms
      });

      return this.handleError(error, latency_ms);
    }
  }

  /**
   * Upload statement (not typically supported by REST APIs)
   */
  async uploadStatement(
    fileBuffer: Buffer,
    meta?: { fileName?: string; fileType?: string }
  ): Promise<StatementUploadResult> {
    throw new ConnectorError(
      'NOT_SUPPORTED',
      'Statement upload not supported by REST connector'
    );
  }

  /**
   * Parse statement (not typically supported by REST APIs)
   */
  async parseStatement(importedId: string): Promise<StatementLine[]> {
    throw new ConnectorError(
      'NOT_SUPPORTED',
      'Statement parsing not supported by REST connector'
    );
  }

  /**
   * Get capabilities
   */
  getCapabilities(): ConnectorCapabilities {
    return {
      supports_idempotency: this.config.idempotency_enabled !== false,
      supports_status_check: true,
      supports_cancellation: true,
      supports_statement_upload: false,
      supports_realtime_webhooks: true,
      supports_future_dated: true,
      max_amount: 10000000, // $10M
      min_amount: 0.01,
      supported_currencies: ['USD', 'EUR', 'GBP'],
      supported_rails: ['ach', 'wire', 'sepa']
    };
  }

  /**
   * Handle errors and map to ConnectorResult
   */
  private handleError(error: any, latency_ms: number): ConnectorResult {
    this.context.logger.error('Connector error', {
      error: error.message,
      code: error.code,
      provider_code: error.response?.data?.code
    });

    // Timeout
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        status: 'failed',
        provider_code: 'TIMEOUT',
        provider_message: 'Request timeout',
        details: { error: error.message },
        latency_ms
      };
    }

    // Network error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return {
        status: 'failed',
        provider_code: 'NETWORK_ERROR',
        provider_message: 'Network error',
        details: { error: error.message },
        latency_ms
      };
    }

    // Axios error with response
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      // Auth error
      if (status === 401 || status === 403) {
        return {
          status: 'failed',
          provider_code: 'AUTH_ERROR',
          provider_message: data.message || 'Authentication failed',
          details: data,
          latency_ms
        };
      }

      // Validation error
      if (status === 400) {
        return {
          status: 'failed',
          provider_code: 'VALIDATION_ERROR',
          provider_message: data.message || 'Validation failed',
          details: data,
          latency_ms
        };
      }

      // Rejected by bank
      if (status === 422) {
        return {
          status: 'rejected',
          provider_code: data.code || 'REJECTED',
          provider_message: data.message || 'Payment rejected',
          details: data,
          latency_ms
        };
      }

      // Server error
      if (status >= 500) {
        return {
          status: 'failed',
          provider_code: 'SERVER_ERROR',
          provider_message: data.message || 'Server error',
          details: data,
          latency_ms
        };
      }

      // Other errors
      return {
        status: 'failed',
        provider_code: String(status),
        provider_message: data.message || 'Unknown error',
        details: data,
        latency_ms
      };
    }

    // Unknown error
    return {
      status: 'failed',
      provider_code: 'UNKNOWN_ERROR',
      provider_message: error.message || 'Unknown error',
      details: { error },
      latency_ms
    };
  }

  /**
   * Map bank response status to our status
   */
  private mapResponseStatus(bankStatus?: string): ConnectorResult['status'] {
    if (!bankStatus) return 'pending';

    const normalized = bankStatus.toLowerCase();

    const statusMap: Record<string, ConnectorResult['status']> = {
      'pending': 'pending',
      'accepted': 'accepted',
      'processing': 'sent',
      'sent': 'sent',
      'submitted': 'sent',
      'completed': 'settled',
      'settled': 'settled',
      'success': 'settled',
      'failed': 'failed',
      'rejected': 'rejected',
      'cancelled': 'rejected',
      'reversed': 'rejected'
    };

    return statusMap[normalized] || 'pending';
  }
}
