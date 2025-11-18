/**
 * SIRA (AI) Client for routing recommendations
 * Provides ML-powered routing hints with caching and fallback
 */

import fetch from 'node-fetch';
import { cacheGet, cacheSet } from './cache';
import { traceAsync } from '../telemetry/otel';
import { recordSiraCall, recordCacheHit, recordCacheMiss } from '../telemetry/prom';
import { logSiraCall } from '../telemetry/logger';

export interface SiraRequest {
  merchant_id: string;
  user_id: string;
  amount: number;
  currency: string;
  country: string;
  payment_method_hint?: string;
  metadata?: any;
}

export interface SiraResponse {
  score: number; // Fraud/risk score (0-1, lower is better)
  routing_hint: 'prefer_wallet' | 'prefer_connect' | 'hybrid' | 'no_preference';
  reasons: string[]; // Explanatory reasons
  confidence: number; // Model confidence (0-1)
  model_version: string;
  latency_ms?: number;
}

const SIRA_URL = process.env.SIRA_URL || 'http://localhost:8083';
const SIRA_API_KEY = process.env.SIRA_API_KEY || 'dev_key';
const SIRA_TIMEOUT_MS = parseInt(process.env.SIRA_TIMEOUT_MS || '2000', 10);
const SIRA_CACHE_TTL = parseInt(process.env.SIRA_CACHE_TTL || '15', 10);

/**
 * Get routing hint from SIRA with caching
 */
export async function getSiraHint(payload: SiraRequest): Promise<SiraResponse> {
  return traceAsync('getSiraHint', async () => {
    const startTime = Date.now();

    // Generate cache key (bucketed by amount to increase cache hits)
    const amountBucket = Math.floor(Number(payload.amount) / 100);
    const cacheKey = `sira:${payload.merchant_id}:${payload.user_id}:${payload.currency}:${amountBucket}`;

    // Try cache first
    const cached = await cacheGet<SiraResponse>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      recordCacheHit('sira_cache');
      logSiraCall({
        merchant_id: payload.merchant_id,
        user_id: payload.user_id,
        duration_ms: duration,
        cached: true,
        hint: cached.routing_hint,
      });
      return {
        ...cached,
        latency_ms: duration
      };
    }

    // Cache miss
    recordCacheMiss('sira_cache');

    // Call SIRA API
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SIRA_TIMEOUT_MS);

      const response = await fetch(`${SIRA_URL}/v1/score`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SIRA_API_KEY}`,
        },
        signal: controller.signal as any,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`SIRA API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as SiraResponse;

      // Validate response
      if (!isValidSiraResponse(data)) {
        throw new Error('Invalid SIRA response format');
      }

      // Cache the response
      await cacheSet(cacheKey, data, SIRA_CACHE_TTL);

      const duration = Date.now() - startTime;

      // Record successful SIRA call metrics
      recordSiraCall('success', duration);
      logSiraCall({
        merchant_id: payload.merchant_id,
        user_id: payload.user_id,
        duration_ms: duration,
        cached: false,
        hint: data.routing_hint,
      });

      return {
        ...data,
        latency_ms: duration
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Record failed SIRA call metrics
      const errorType = error.name === 'AbortError' ? 'timeout' : 'error';
      recordSiraCall(errorType, duration);
      logSiraCall({
        merchant_id: payload.merchant_id,
        user_id: payload.user_id,
        duration_ms: duration,
        cached: false,
        error: error,
      });

      // Return conservative fallback
      const fallback: SiraResponse = {
        score: 0.5,
        routing_hint: 'prefer_connect',
        reasons: ['sira_unavailable', 'using_fallback'],
        confidence: 0.3,
        model_version: 'fallback',
        latency_ms: duration
      };

      // Cache fallback briefly
      await cacheSet(cacheKey, fallback, 10);

      return fallback;
    }
  });
}

/**
 * Get batch SIRA hints for multiple requests
 */
export async function getBatchSiraHints(
  payloads: SiraRequest[]
): Promise<SiraResponse[]> {
  // For batch requests, we could call a batch API endpoint if SIRA supports it
  // For now, process sequentially with caching to benefit from cache hits
  const results: SiraResponse[] = [];

  for (const payload of payloads) {
    const hint = await getSiraHint(payload);
    results.push(hint);
  }

  return results;
}

/**
 * Validate SIRA response structure
 */
function isValidSiraResponse(data: any): data is SiraResponse {
  return (
    data &&
    typeof data.score === 'number' &&
    data.score >= 0 &&
    data.score <= 1 &&
    typeof data.routing_hint === 'string' &&
    ['prefer_wallet', 'prefer_connect', 'hybrid', 'no_preference'].includes(data.routing_hint) &&
    Array.isArray(data.reasons) &&
    typeof data.confidence === 'number' &&
    typeof data.model_version === 'string'
  );
}

/**
 * Mock SIRA service for development/testing
 */
export async function getMockSiraHint(payload: SiraRequest): Promise<SiraResponse> {
  // Simulate latency
  await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

  // Simple heuristic-based mock
  const amount = Number(payload.amount);
  const isSenegal = payload.country === 'SN';
  const isXOF = payload.currency === 'XOF';

  let routing_hint: SiraResponse['routing_hint'] = 'no_preference';
  const reasons: string[] = [];
  let score = 0.3; // Default low risk

  // Mock logic
  if (isSenegal && isXOF && amount < 50000) {
    routing_hint = 'prefer_wallet';
    reasons.push('low_amount', 'local_currency', 'high_wallet_adoption');
    score = 0.15;
  } else if (amount > 500000) {
    routing_hint = 'prefer_connect';
    reasons.push('high_amount', 'better_fraud_protection');
    score = 0.25;
  } else if (payload.payment_method_hint === 'card') {
    routing_hint = 'prefer_connect';
    reasons.push('card_preferred', 'merchant_preference');
  } else {
    routing_hint = 'prefer_wallet';
    reasons.push('cost_effective', 'fast_settlement');
  }

  return {
    score,
    routing_hint,
    reasons,
    confidence: 0.75 + Math.random() * 0.2,
    model_version: 'mock-v1.0',
    latency_ms: 100
  };
}

/**
 * Health check for SIRA service
 */
export async function checkSiraHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    const response = await fetch(`${SIRA_URL}/health`, {
      signal: controller.signal as any,
    });

    clearTimeout(timeout);

    return response.ok;
  } catch (error) {
    return false;
  }
}
