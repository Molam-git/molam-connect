// ============================================================================
// Brique 121 — REST Sandbox Connector
// ============================================================================
// Purpose: Modern REST API connector for PSPs with JSON APIs
// Features: HMAC signing, mTLS support, idempotency, retry logic
// ============================================================================

import crypto from 'crypto';
import https from 'https';
import {
  BankConnector,
  PayoutSlice,
  BankSendResult,
  BankStatementLine,
  StatementFileMetadata,
  ConnectorConfig,
  ConnectorContext,
  HealthCheckResult,
  ConnectorTimeoutError,
  ConnectorNetworkError,
  ConnectorAuthError
} from '../types';
import { getVaultSecret, resolveConnectorConfig } from '../utils/vault';
import { signWithHMAC } from '../utils/hsm';
import { createResilientExecutor } from '../utils/circuit-breaker';
import { logConnectorExecution } from './logger';

/**
 * REST Sandbox Connector
 * For modern banks/PSPs with RESTful JSON APIs
 */
export class RestSandboxConnector implements BankConnector {
  name = 'rest-sandbox';
  type: 'rest' = 'rest';
  private config!: ConnectorConfig;
  private apiKey: string = '';
  private hmacKey: string = '';
  private resilientExecutor = createResilientExecutor('rest-sandbox');
  private httpsAgent: https.Agent | undefined;

  /**
   * Initialize connector
   */
  async init(config: ConnectorConfig): Promise<void> {
    // Resolve Vault references
    this.config = await resolveConnectorConfig(config as any) as ConnectorConfig;

    // Load API key from Vault if needed
    if (this.config.vault_secret_key) {
      this.apiKey = await getVaultSecret(this.config.vault_secret_key);
    } else if (this.config.api_key) {
      this.apiKey = this.config.api_key;
    }

    // Load HMAC key for request signing
    if (this.config.vault_hmac_key) {
      this.hmacKey = await getVaultSecret(this.config.vault_hmac_key);
    } else if (this.config.hmac_key) {
      this.hmacKey = this.config.hmac_key;
    }

    // Setup mTLS if configured
    if (this.config.vault_cert_path) {
      const { default: fs } = await import('fs/promises');
      const certData = await getVaultSecret(this.config.vault_cert_path);

      this.httpsAgent = new https.Agent({
        cert: certData.cert,
        key: certData.key,
        ca: certData.ca,
        rejectUnauthorized: true
      });
    }

    console.log(`✅ REST Sandbox Connector initialized: ${this.config.endpoint}`);
  }

  /**
   * Send payment to bank via REST API
   */
  async sendPayment(slice: PayoutSlice, context?: ConnectorContext): Promise<BankSendResult> {
    const startTime = Date.now();

    try {
      const result = await this.resilientExecutor.execute(async () => {
        return await this._sendPaymentInternal(slice, context);
      });

      // Log success
      if (context) {
        await logConnectorExecution({
          connector_id: context.connector_id,
          operation: 'sendPayment',
          payout_slice_id: slice.id,
          trace_id: context.trace_id,
          status: 'success',
          duration_ms: Date.now() - startTime,
          request_payload: this.sanitizePayload(slice),
          response_payload: result
        });
      }

      return result;
    } catch (error: any) {
      // Log failure
      if (context) {
        await logConnectorExecution({
          connector_id: context.connector_id,
          operation: 'sendPayment',
          payout_slice_id: slice.id,
          trace_id: context.trace_id,
          status: 'failed',
          duration_ms: Date.now() - startTime,
          error_message: error.message
        });
      }

      return {
        status: 'failed',
        error_code: error.code || 'UNKNOWN_ERROR',
        error_message: error.message
      };
    }
  }

  /**
   * Internal send payment implementation
   */
  private async _sendPaymentInternal(slice: PayoutSlice, context?: ConnectorContext): Promise<BankSendResult> {
    const url = `${this.config.endpoint}/payments`;

    // Build request payload
    const payload = {
      amount: slice.slice_amount,
      currency: slice.currency,
      beneficiary: {
        name: slice.beneficiary.name,
        account: slice.beneficiary.bank_account,
        address: slice.beneficiary.address
      },
      idempotency_key: slice.idempotency_key,
      reference: slice.reference_code,
      metadata: {
        payout_id: slice.parent_payout_id,
        slice_id: slice.id,
        ...slice.metadata
      }
    };

    const body = JSON.stringify(payload);
    const signature = this.hmacKey ? signWithHMAC(body, this.hmacKey) : null;

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body).toString(),
      'User-Agent': 'Molam-Connect/1.0'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (signature) {
      headers['X-Signature'] = signature;
      headers['X-Signature-Algorithm'] = 'HMAC-SHA256';
    }

    if (context?.trace_id) {
      headers['X-Trace-Id'] = context.trace_id;
    }

    headers['X-Idempotency-Key'] = slice.idempotency_key;

    // Make request with timeout
    const timeout = this.config.timeout_ms || 15000;

    try {
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body,
        agent: this.httpsAgent
      }, timeout);

      if (response.ok) {
        const json = await response.json();
        return {
          status: json.status === 'queued' ? 'queued' : 'sent',
          provider_ref: json.transaction_id || json.payment_id || json.id,
          estimated_settlement_date: json.estimated_settlement_date,
          details: json
        };
      } else if (response.status === 401 || response.status === 403) {
        throw new ConnectorAuthError(`Authentication failed: ${response.status}`);
      } else if (response.status >= 500) {
        const error = new ConnectorNetworkError(`Server error: ${response.status}`);
        (error as any).retryable = true;
        throw error;
      } else {
        const errorText = await response.text();
        return {
          status: 'failed',
          error_code: `HTTP_${response.status}`,
          error_message: errorText,
          details: { status: response.status, body: errorText }
        };
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new ConnectorTimeoutError('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Get payment status from bank
   */
  async getPaymentStatus(providerRef: string, context?: ConnectorContext) {
    try {
      const result = await this.resilientExecutor.execute(async () => {
        const url = `${this.config.endpoint}/payments/${encodeURIComponent(providerRef)}`;

        const headers: Record<string, string> = {
          'User-Agent': 'Molam-Connect/1.0'
        };

        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        if (context?.trace_id) {
          headers['X-Trace-Id'] = context.trace_id;
        }

        const timeout = this.config.timeout_ms || 8000;
        const response = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers,
          agent: this.httpsAgent
        }, timeout);

        if (response.ok) {
          const json = await response.json();
          return {
            status: json.status || 'unknown',
            provider_ref: providerRef,
            settlement_date: json.settlement_date,
            details: json
          };
        }

        return {
          status: 'unknown',
          provider_ref: providerRef,
          details: { http_status: response.status }
        };
      });

      return result;
    } catch (error: any) {
      return {
        status: 'unknown',
        provider_ref: providerRef,
        failure_reason: error.message
      };
    }
  }

  /**
   * Upload statement file (if bank supports API upload)
   */
  async uploadStatement(fileBuffer: Buffer, meta: StatementFileMetadata, context?: ConnectorContext) {
    const url = `${this.config.endpoint}/statements/upload`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileBuffer.length.toString(),
      'X-File-Name': meta.file_name,
      'X-Bank-Profile-Id': meta.bank_profile_id
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (context?.trace_id) {
      headers['X-Trace-Id'] = context.trace_id;
    }

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: fileBuffer,
      agent: this.httpsAgent
    }, 30000);

    if (!response.ok) {
      throw new Error(`Failed to upload statement: ${response.status}`);
    }

    const json = await response.json();

    // Store reference in database (handled by caller)
    return {
      imported_id: json.statement_id || json.id
    };
  }

  /**
   * Parse statement (typically done server-side for REST APIs)
   */
  async parseStatement(importedId: string, context?: ConnectorContext): Promise<BankStatementLine[]> {
    const url = `${this.config.endpoint}/statements/${encodeURIComponent(importedId)}/transactions`;

    const headers: Record<string, string> = {};

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers,
      agent: this.httpsAgent
    }, 15000);

    if (!response.ok) {
      throw new Error(`Failed to fetch statement transactions: ${response.status}`);
    }

    const json = await response.json();
    const transactions = json.transactions || json.data || [];

    return transactions.map((tx: any) => ({
      statement_date: tx.date || tx.transaction_date,
      value_date: tx.value_date || tx.date,
      amount: tx.amount,
      currency: tx.currency,
      debit_credit: tx.type === 'debit' || tx.amount < 0 ? 'debit' : 'credit',
      description: tx.description || tx.narrative,
      reference: tx.reference || tx.transaction_reference,
      bank_reference: tx.bank_reference,
      counterparty_name: tx.counterparty?.name,
      counterparty_account: tx.counterparty?.account,
      raw: tx
    }));
  }

  /**
   * Health check
   */
  async healthcheck(context?: ConnectorContext): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const url = `${this.config.endpoint}/health`;
      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        agent: this.httpsAgent
      }, 5000);

      const latency = Date.now() - startTime;

      if (response.ok) {
        const json = await response.json().catch(() => ({}));
        return {
          healthy: true,
          latency_ms: latency,
          details: json
        };
      }

      return {
        healthy: false,
        latency_ms: latency,
        error: `HTTP ${response.status}`
      };
    } catch (error: any) {
      return {
        healthy: false,
        latency_ms: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Shutdown connector
   */
  async shutdown(): Promise<void> {
    if (this.httpsAgent) {
      this.httpsAgent.destroy();
    }
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(url: string, options: any, timeoutMs: number): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * Sanitize payload for logging (remove sensitive data)
   */
  private sanitizePayload(slice: PayoutSlice): any {
    return {
      id: slice.id,
      parent_payout_id: slice.parent_payout_id,
      slice_amount: slice.slice_amount,
      currency: slice.currency,
      beneficiary: {
        name: slice.beneficiary.name,
        bank_account: {
          account_number: slice.beneficiary.bank_account.account_number ? '***' + slice.beneficiary.bank_account.account_number.slice(-4) : undefined,
          iban: slice.beneficiary.bank_account.iban ? '***' + slice.beneficiary.bank_account.iban.slice(-4) : undefined
        }
      },
      idempotency_key: slice.idempotency_key
    };
  }
}

// ============================================================================
// End of REST Sandbox Connector
// ============================================================================
