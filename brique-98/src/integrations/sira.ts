/**
 * Brique 98 — SIRA Integration
 *
 * Integrates offline payment system with SIRA (Brique 94) for fraud detection.
 *
 * Features:
 * - Score offline bundles before acceptance
 * - Score transactions during reconciliation
 * - Escalate suspicious transactions
 * - Auto-quarantine based on risk thresholds
 * - Risk-based routing decisions
 *
 * Usage:
 * ```typescript
 * import { SiraClient } from './integrations/sira';
 *
 * const sira = new SiraClient({
 *   apiUrl: 'https://sira.molam.com',
 *   apiKey: process.env.SIRA_API_KEY,
 * });
 *
 * const result = await sira.scoreOfflineBundle(bundlePayload);
 * ```
 */

import { BundlePayload, OfflineTransaction } from '../offline/security';

// =====================================================================
// Types & Interfaces
// =====================================================================

export interface SiraConfig {
  apiUrl: string; // SIRA API base URL
  apiKey: string; // SIRA API key
  timeout?: number; // Request timeout (ms)
  enableMock?: boolean; // Use mock scoring for testing
  thresholds?: RiskThresholds;
}

export interface RiskThresholds {
  acceptBelow: number; // Auto-accept if score < threshold (default: 0.15)
  reviewAbove: number; // Manual review if score >= threshold (default: 0.15)
  quarantineAbove: number; // Auto-quarantine if score >= threshold (default: 0.35)
}

export interface SiraBundleScoreRequest {
  bundle_id: string;
  device_id: string;
  transactions: OfflineTransaction[];
  device_clock: string;
  metadata?: Record<string, any>;
}

export interface SiraTransactionScoreRequest {
  transaction_id: string;
  bundle_id?: string;
  device_id?: string;
  type: string;
  amount: number;
  currency: string;
  sender: string;
  receiver: string;
  merchant_id?: string;
  initiated_at: string;
  metadata?: Record<string, any>;
}

export interface SiraScoreResponse {
  score: number; // 0-1 fraud probability
  action: 'accept' | 'review' | 'quarantine';
  reasons: string[]; // List of risk factors
  confidence: number; // 0-1 model confidence
  details?: {
    velocity_score?: number;
    anomaly_score?: number;
    pattern_score?: number;
    device_reputation?: number;
  };
}

export interface SiraEscalationRequest {
  transaction_id: string;
  bundle_id: string;
  escalation_reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any>;
}

export interface SiraEscalationResponse {
  escalation_id: string;
  status: 'created' | 'assigned' | 'in_review';
  assigned_to?: string;
  created_at: string;
}

// =====================================================================
// SIRA Client
// =====================================================================

export class SiraClient {
  private config: SiraConfig;
  private thresholds: RiskThresholds;

  constructor(config: SiraConfig) {
    this.config = {
      timeout: 5000,
      enableMock: false,
      ...config,
    };

    this.thresholds = {
      acceptBelow: 0.15,
      reviewAbove: 0.15,
      quarantineAbove: 0.35,
      ...config.thresholds,
    };
  }

  // ===================================================================
  // Bundle Scoring
  // ===================================================================

  /**
   * Score offline bundle for fraud risk
   *
   * Analyzes entire bundle including all transactions
   */
  async scoreOfflineBundle(bundle: SiraBundleScoreRequest): Promise<SiraScoreResponse> {
    if (this.config.enableMock) {
      return this.mockBundleScore(bundle);
    }

    try {
      const response = await this.request<SiraScoreResponse>('/api/sira/score/offline-bundle', {
        method: 'POST',
        body: JSON.stringify(bundle),
      });

      // Apply thresholds to determine action
      const action = this.determineAction(response.score);

      return {
        ...response,
        action,
      };
    } catch (error: any) {
      console.error('[SIRA] Bundle scoring error:', error);

      // Fallback to mock on error (fail-open for availability)
      console.warn('[SIRA] Falling back to mock scoring due to error');
      return this.mockBundleScore(bundle);
    }
  }

  /**
   * Mock bundle scoring (for testing and fallback)
   */
  private mockBundleScore(bundle: SiraBundleScoreRequest): SiraScoreResponse {
    // Simple heuristic-based scoring
    let score = 0;
    const reasons: string[] = [];

    // Check transaction count
    if (bundle.transactions.length > 50) {
      score += 0.1;
      reasons.push('high_transaction_count');
    }

    // Check total amount
    const totalAmount = bundle.transactions.reduce((sum, tx) => sum + tx.amount, 0);
    if (totalAmount > 500000) {
      score += 0.15;
      reasons.push('high_total_amount');
    }

    // Check for unusual patterns
    const uniqueReceivers = new Set(bundle.transactions.map((tx) => tx.receiver)).size;
    if (uniqueReceivers > 20) {
      score += 0.1;
      reasons.push('many_unique_receivers');
    }

    // Check time distribution (all transactions within 1 minute is suspicious)
    const timestamps = bundle.transactions.map((tx) => new Date(tx.initiated_at).getTime());
    const timeSpan = Math.max(...timestamps) - Math.min(...timestamps);
    if (timeSpan < 60000) {
      score += 0.08;
      reasons.push('rapid_transaction_cluster');
    }

    // Cap score at 1.0
    score = Math.min(score, 1.0);

    const action = this.determineAction(score);

    return {
      score,
      action,
      reasons,
      confidence: 0.7,
      details: {
        velocity_score: score * 0.4,
        anomaly_score: score * 0.3,
        pattern_score: score * 0.2,
        device_reputation: 0.8,
      },
    };
  }

  // ===================================================================
  // Transaction Scoring
  // ===================================================================

  /**
   * Score individual transaction for fraud risk
   *
   * Used during reconciliation for additional checks
   */
  async scoreTransaction(transaction: SiraTransactionScoreRequest): Promise<SiraScoreResponse> {
    if (this.config.enableMock) {
      return this.mockTransactionScore(transaction);
    }

    try {
      const response = await this.request<SiraScoreResponse>('/api/sira/score/transaction', {
        method: 'POST',
        body: JSON.stringify(transaction),
      });

      const action = this.determineAction(response.score);

      return {
        ...response,
        action,
      };
    } catch (error: any) {
      console.error('[SIRA] Transaction scoring error:', error);

      // Fallback to mock
      console.warn('[SIRA] Falling back to mock scoring due to error');
      return this.mockTransactionScore(transaction);
    }
  }

  /**
   * Mock transaction scoring (for testing and fallback)
   */
  private mockTransactionScore(transaction: SiraTransactionScoreRequest): SiraScoreResponse {
    let score = 0;
    const reasons: string[] = [];

    // Check amount
    if (transaction.amount > 100000) {
      score += 0.12;
      reasons.push('high_amount');
    }

    // Check type
    if (transaction.type === 'cashout') {
      score += 0.05;
      reasons.push('cashout_type');
    }

    // Random noise for realism
    score += Math.random() * 0.1;

    // Cap at 1.0
    score = Math.min(score, 1.0);

    const action = this.determineAction(score);

    return {
      score,
      action,
      reasons,
      confidence: 0.75,
      details: {
        velocity_score: score * 0.3,
        anomaly_score: score * 0.4,
        pattern_score: score * 0.2,
        device_reputation: 0.85,
      },
    };
  }

  // ===================================================================
  // Escalation
  // ===================================================================

  /**
   * Escalate suspicious transaction for manual review
   */
  async escalateTransaction(request: SiraEscalationRequest): Promise<SiraEscalationResponse> {
    if (this.config.enableMock) {
      return this.mockEscalation(request);
    }

    try {
      const response = await this.request<SiraEscalationResponse>('/api/sira/escalations', {
        method: 'POST',
        body: JSON.stringify(request),
      });

      return response;
    } catch (error: any) {
      console.error('[SIRA] Escalation error:', error);

      // Return mock escalation on error
      return this.mockEscalation(request);
    }
  }

  /**
   * Mock escalation (for testing and fallback)
   */
  private mockEscalation(request: SiraEscalationRequest): SiraEscalationResponse {
    return {
      escalation_id: `esc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      status: 'created',
      created_at: new Date().toISOString(),
    };
  }

  // ===================================================================
  // Bulk Operations
  // ===================================================================

  /**
   * Score multiple transactions in bulk
   *
   * More efficient than scoring one-by-one
   */
  async scoreBulkTransactions(
    transactions: SiraTransactionScoreRequest[]
  ): Promise<Map<string, SiraScoreResponse>> {
    if (this.config.enableMock) {
      const results = new Map<string, SiraScoreResponse>();
      for (const tx of transactions) {
        results.set(tx.transaction_id, this.mockTransactionScore(tx));
      }
      return results;
    }

    try {
      const response = await this.request<{ results: Array<{ transaction_id: string; score: SiraScoreResponse }> }>(
        '/api/sira/score/bulk',
        {
          method: 'POST',
          body: JSON.stringify({ transactions }),
        }
      );

      const results = new Map<string, SiraScoreResponse>();
      for (const result of response.results) {
        results.set(result.transaction_id, {
          ...result.score,
          action: this.determineAction(result.score.score),
        });
      }

      return results;
    } catch (error: any) {
      console.error('[SIRA] Bulk scoring error:', error);

      // Fallback to mock
      const results = new Map<string, SiraScoreResponse>();
      for (const tx of transactions) {
        results.set(tx.transaction_id, this.mockTransactionScore(tx));
      }
      return results;
    }
  }

  // ===================================================================
  // Device Reputation
  // ===================================================================

  /**
   * Get device reputation score
   *
   * Returns historical fraud score for device
   */
  async getDeviceReputation(deviceId: string): Promise<{
    device_id: string;
    reputation_score: number; // 0-1 (1 = trusted)
    fraud_count: number;
    total_transactions: number;
    first_seen: string;
    last_seen: string;
  }> {
    if (this.config.enableMock) {
      return {
        device_id: deviceId,
        reputation_score: 0.85,
        fraud_count: 2,
        total_transactions: 150,
        first_seen: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        last_seen: new Date().toISOString(),
      };
    }

    try {
      return await this.request(`/api/sira/devices/${deviceId}/reputation`);
    } catch (error: any) {
      console.error('[SIRA] Device reputation error:', error);
      return {
        device_id: deviceId,
        reputation_score: 0.5, // Neutral on error
        fraud_count: 0,
        total_transactions: 0,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      };
    }
  }

  // ===================================================================
  // Helper Methods
  // ===================================================================

  /**
   * Determine action based on score and thresholds
   */
  private determineAction(score: number): 'accept' | 'review' | 'quarantine' {
    if (score >= this.thresholds.quarantineAbove) {
      return 'quarantine';
    } else if (score >= this.thresholds.reviewAbove) {
      return 'review';
    } else {
      return 'accept';
    }
  }

  /**
   * Make HTTP request to SIRA API
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.apiUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`SIRA API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`SIRA API timeout after ${this.config.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Update risk thresholds dynamically
   */
  updateThresholds(thresholds: Partial<RiskThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...thresholds,
    };
    console.log('[SIRA] Updated risk thresholds:', this.thresholds);
  }

  /**
   * Get current risk thresholds
   */
  getThresholds(): RiskThresholds {
    return { ...this.thresholds };
  }
}

// =====================================================================
// Utility Functions
// =====================================================================

/**
 * Create SIRA score request from bundle payload
 */
export function createBundleScoreRequest(
  bundlePayload: BundlePayload,
  deviceId: string
): SiraBundleScoreRequest {
  return {
    bundle_id: bundlePayload.bundle_id,
    device_id: deviceId,
    transactions: bundlePayload.transactions,
    device_clock: bundlePayload.device_clock,
    metadata: bundlePayload.metadata,
  };
}

/**
 * Create SIRA score request from transaction
 */
export function createTransactionScoreRequest(
  transaction: OfflineTransaction,
  bundleId?: string,
  deviceId?: string
): SiraTransactionScoreRequest {
  return {
    transaction_id: transaction.local_id,
    bundle_id: bundleId,
    device_id: deviceId,
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    sender: transaction.sender,
    receiver: transaction.receiver,
    merchant_id: transaction.merchant_id,
    initiated_at: transaction.initiated_at,
    metadata: transaction.meta,
  };
}

/**
 * Format SIRA score response for logging
 */
export function formatScoreResponse(response: SiraScoreResponse): string {
  const percentage = (response.score * 100).toFixed(1);
  const emoji = response.action === 'accept' ? '✓' : response.action === 'review' ? '⚠️' : '🚨';

  return `${emoji} Score: ${percentage}% | Action: ${response.action.toUpperCase()} | Confidence: ${(response.confidence * 100).toFixed(0)}% | Reasons: ${response.reasons.join(', ')}`;
}

// =====================================================================
// Exports
// =====================================================================

export default SiraClient;
