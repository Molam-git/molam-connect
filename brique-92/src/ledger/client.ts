// Ledger Client - Integration with central ledger service
// Handles hold creation, finalization, and release operations

import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import * as fs from 'fs';

const LEDGER_BASE_URL = process.env.LEDGER_API_URL || 'http://localhost:8080';
const LEDGER_TIMEOUT_MS = parseInt(process.env.LEDGER_TIMEOUT_MS || '5000');
const LEDGER_MTLS_ENABLED = process.env.LEDGER_MTLS_ENABLED === 'true';

interface LedgerHoldRequest {
  owner_id: string; // entity_id (merchant, user, agent)
  owner_type: string; // 'merchant', 'user', 'agent'
  amount: number;
  currency: string;
  reason: string; // e.g. 'payout:PAYOUT-20250114-XXX'
  idempotency_key?: string;
  metadata?: Record<string, any>;
}

interface LedgerHoldResponse {
  hold_id: string;
  hold_ref: string;
  status: 'created' | 'failed';
  available_balance: number;
  held_amount: number;
  error?: string;
}

interface LedgerFinalizeRequest {
  hold_ref: string;
  payout_id: string;
  provider_ref?: string;
  bank_fee: number;
  molam_fee: number;
  metadata?: Record<string, any>;
}

interface LedgerFinalizeResponse {
  entry_ref: string;
  status: 'finalized' | 'failed';
  journal_entries: Array<{
    account: string;
    debit: number;
    credit: number;
  }>;
  error?: string;
}

interface LedgerReleaseRequest {
  hold_ref: string;
  payout_id: string;
  reason: string;
  metadata?: Record<string, any>;
}

interface LedgerReleaseResponse {
  hold_ref: string;
  status: 'released' | 'failed';
  released_amount: number;
  error?: string;
}

/**
 * Ledger Client with mTLS support
 */
class LedgerClient {
  private client: AxiosInstance;

  constructor() {
    const httpsAgent = LEDGER_MTLS_ENABLED
      ? new https.Agent({
          cert: fs.readFileSync(process.env.LEDGER_CLIENT_CERT_PATH || './certs/client.crt'),
          key: fs.readFileSync(process.env.LEDGER_CLIENT_KEY_PATH || './certs/client.key'),
          ca: fs.readFileSync(process.env.LEDGER_CA_CERT_PATH || './certs/ca.crt'),
          rejectUnauthorized: true
        })
      : undefined;

    this.client = axios.create({
      baseURL: LEDGER_BASE_URL,
      timeout: LEDGER_TIMEOUT_MS,
      httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Name': 'brique-92-payouts',
        'X-Service-Version': '1.0.0'
      }
    });

    // Request interceptor for logging
    this.client.interceptors.request.use((config) => {
      console.log(`[LedgerClient] ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('[LedgerClient] Request failed:', error.message);
        if (error.response) {
          console.error('[LedgerClient] Response:', error.response.status, error.response.data);
        }
        throw error;
      }
    );
  }

  /**
   * Create a ledger hold (reserve funds before payout)
   */
  async createHold(request: LedgerHoldRequest): Promise<LedgerHoldResponse> {
    try {
      console.log(`[LedgerClient] Creating hold for ${request.currency} ${request.amount}`);

      const response = await this.client.post<LedgerHoldResponse>('/ledger/holds', {
        owner_id: request.owner_id,
        owner_type: request.owner_type,
        amount: request.amount,
        currency: request.currency,
        reason: request.reason,
        idempotency_key: request.idempotency_key,
        metadata: request.metadata || {},
        created_at: new Date().toISOString()
      });

      if (response.data.status === 'failed') {
        throw new Error(`Hold creation failed: ${response.data.error || 'unknown error'}`);
      }

      console.log(`[LedgerClient] ✓ Hold created: ${response.data.hold_ref}`);
      return response.data;
    } catch (error: any) {
      console.error('[LedgerClient] Error creating hold:', error);

      // Return error response for handling
      return {
        hold_id: '',
        hold_ref: '',
        status: 'failed',
        available_balance: 0,
        held_amount: 0,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Finalize a hold (create final journal entries after settlement)
   */
  async finalizeHold(request: LedgerFinalizeRequest): Promise<LedgerFinalizeResponse> {
    try {
      console.log(`[LedgerClient] Finalizing hold: ${request.hold_ref}`);

      const response = await this.client.post<LedgerFinalizeResponse>('/ledger/finalize', {
        hold_ref: request.hold_ref,
        payout_id: request.payout_id,
        provider_ref: request.provider_ref,
        bank_fee: request.bank_fee,
        molam_fee: request.molam_fee,
        metadata: request.metadata || {},
        finalized_at: new Date().toISOString()
      });

      if (response.data.status === 'failed') {
        throw new Error(`Hold finalization failed: ${response.data.error || 'unknown error'}`);
      }

      console.log(`[LedgerClient] ✓ Hold finalized: ${response.data.entry_ref}`);
      return response.data;
    } catch (error: any) {
      console.error('[LedgerClient] Error finalizing hold:', error);

      return {
        entry_ref: '',
        status: 'failed',
        journal_entries: [],
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Release a hold (rollback if payout cancelled/failed)
   */
  async releaseHold(request: LedgerReleaseRequest): Promise<LedgerReleaseResponse> {
    try {
      console.log(`[LedgerClient] Releasing hold: ${request.hold_ref}`);

      const response = await this.client.post<LedgerReleaseResponse>('/ledger/release', {
        hold_ref: request.hold_ref,
        payout_id: request.payout_id,
        reason: request.reason,
        metadata: request.metadata || {},
        released_at: new Date().toISOString()
      });

      if (response.data.status === 'failed') {
        throw new Error(`Hold release failed: ${response.data.error || 'unknown error'}`);
      }

      console.log(`[LedgerClient] ✓ Hold released: ${request.hold_ref}`);
      return response.data;
    } catch (error: any) {
      console.error('[LedgerClient] Error releasing hold:', error);

      return {
        hold_ref: request.hold_ref,
        status: 'failed',
        released_amount: 0,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Create manual journal entry (for adjustments)
   */
  async createJournalEntry(entries: Array<{
    account: string;
    debit: number;
    credit: number;
    description: string;
  }>, metadata?: Record<string, any>): Promise<{ entry_ref: string; status: string }> {
    try {
      console.log(`[LedgerClient] Creating journal entry with ${entries.length} lines`);

      const response = await this.client.post('/ledger/journal', {
        entries,
        metadata: metadata || {},
        created_at: new Date().toISOString()
      });

      console.log(`[LedgerClient] ✓ Journal entry created: ${response.data.entry_ref}`);
      return response.data;
    } catch (error: any) {
      console.error('[LedgerClient] Error creating journal entry:', error);
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  /**
   * Get balance for an entity
   */
  async getBalance(owner_id: string, owner_type: string, currency: string): Promise<{
    available_balance: number;
    held_amount: number;
    total_balance: number;
  }> {
    try {
      const response = await this.client.get('/ledger/balance', {
        params: { owner_id, owner_type, currency }
      });

      return response.data;
    } catch (error: any) {
      console.error('[LedgerClient] Error fetching balance:', error);
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

// Singleton instance
export const ledgerClient = new LedgerClient();

// Convenience functions
export async function createLedgerHold(request: LedgerHoldRequest): Promise<LedgerHoldResponse> {
  return ledgerClient.createHold(request);
}

export async function finalizeLedgerHold(request: LedgerFinalizeRequest): Promise<LedgerFinalizeResponse> {
  return ledgerClient.finalizeHold(request);
}

export async function releaseLedgerHold(request: LedgerReleaseRequest): Promise<LedgerReleaseResponse> {
  return ledgerClient.releaseHold(request);
}

export async function getEntityBalance(owner_id: string, owner_type: string, currency: string) {
  return ledgerClient.getBalance(owner_id, owner_type, currency);
}

export default ledgerClient;
