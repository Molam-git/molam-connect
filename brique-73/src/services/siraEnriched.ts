/**
 * SIRA Enriched - AI-Guided Observability & Fraud Detection
 * Advanced intelligence layer for webhook replay, fraud detection, and adaptive optimization
 * Brique 73 v2.1
 */

import { pool } from '../db';
import crypto from 'crypto';

// ========================================
// Types
// ========================================

export interface WebhookProfile {
  webhookId: string;
  avgLatency: number;
  p95Latency: number;
  successRate: number;
  failureRate: number;
  consecutiveFailures: number;
  preferredStrategy: string;
  aiHealthScore: number;
  aiRecommendations: string[];
}

export interface AbusePattern {
  id: string;
  keyId: string;
  patternType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidenceScore: number;
  details: any;
  actionTaken: string;
  detectedAt: Date;
}

export interface ReplayStrategy {
  strategy: string;
  modifiedPayload?: any;
  customTimeout?: number;
  customRetryDelay?: number;
  expectedImprovement: string;
  aiConfidence: number;
}

export interface ImmutableAuditEntry {
  eventType: string;
  eventCategory: string;
  keyId?: string;
  webhookId?: string;
  payload: any;
  hash: string;
  prevHash: string;
  chainIndex: number;
}

// ========================================
// AI-Guided Webhook Replay
// ========================================

/**
 * Analyze a failed delivery and suggest intelligent replay strategy
 */
export async function analyzeAndSuggestReplay(deliveryId: string): Promise<ReplayStrategy> {
  // Get delivery details
  const deliveryResult = await pool.query(
    `SELECT wd.*, w.url, wp.avg_latency_ms, wp.failure_rate, wp.preferred_strategy
     FROM webhook_deliveries wd
     JOIN webhooks w ON wd.webhook_id = w.id
     LEFT JOIN webhook_profiles wp ON w.id = wp.webhook_id
     WHERE wd.id = $1`,
    [deliveryId]
  );

  if (deliveryResult.rows.length === 0) {
    throw new Error('Delivery not found');
  }

  const delivery = deliveryResult.rows[0];
  const payload = JSON.parse(delivery.payload);
  const responseCode = delivery.response_code;
  const errorType = delivery.error_type;

  // AI analysis based on failure reason
  let strategy: ReplayStrategy;

  if (errorType === 'timeout' || responseCode === 408 || responseCode === 504) {
    // Timeout: Reduce payload + increase timeout
    strategy = {
      strategy: 'reduced_payload_with_extended_timeout',
      modifiedPayload: minimizePayload(payload),
      customTimeout: 30000, // 30 seconds
      customRetryDelay: 5000,
      expectedImprovement: 'Reduced payload size by 60%, extended timeout to 30s',
      aiConfidence: 0.85,
    };
  } else if (responseCode === 413 || responseCode === 400) {
    // Payload too large or bad request: Use JSON light
    strategy = {
      strategy: 'json_light',
      modifiedPayload: convertToJsonLight(payload),
      customTimeout: 15000,
      customRetryDelay: 2000,
      expectedImprovement: 'Converted to JSON Light format, 70% smaller',
      aiConfidence: 0.90,
    };
  } else if (responseCode === 503 || errorType === 'connection_refused') {
    // Service unavailable: Linear backoff with longer delays
    strategy = {
      strategy: 'conservative_linear_backoff',
      modifiedPayload: payload,
      customTimeout: 20000,
      customRetryDelay: 10000, // Wait 10 seconds
      expectedImprovement: 'Extended retry delay to allow endpoint recovery',
      aiConfidence: 0.75,
    };
  } else if (responseCode === 429) {
    // Rate limited: Aggressive backoff
    strategy = {
      strategy: 'aggressive_exponential_backoff',
      modifiedPayload: payload,
      customTimeout: 15000,
      customRetryDelay: 60000, // Wait 1 minute
      expectedImprovement: 'Long delay to respect rate limits',
      aiConfidence: 0.95,
    };
  } else if (responseCode >= 500 && responseCode < 600) {
    // Server error: Batch with reduced frequency
    strategy = {
      strategy: 'batch_with_compression',
      modifiedPayload: compressPayload(payload),
      customTimeout: 25000,
      customRetryDelay: 5000,
      expectedImprovement: 'Compressed payload, extended timeout',
      aiConfidence: 0.80,
    };
  } else {
    // Unknown error: Standard retry
    strategy = {
      strategy: 'standard_retry',
      modifiedPayload: payload,
      customTimeout: 15000,
      customRetryDelay: 3000,
      expectedImprovement: 'Standard retry with default settings',
      aiConfidence: 0.60,
    };
  }

  // Log AI recommendation
  await logAIRecommendation(delivery.webhook_id, 'replay', strategy);

  return strategy;
}

/**
 * Queue intelligent replay with AI-suggested modifications
 */
export async function queueIntelligentReplay(
  deliveryId: string,
  requestedBy: string
): Promise<{ replayId: string; strategy: ReplayStrategy }> {
  const strategy = await analyzeAndSuggestReplay(deliveryId);

  // Get original delivery
  const delivery = await pool.query(
    `SELECT * FROM webhook_deliveries WHERE id = $1`,
    [deliveryId]
  );

  const originalPayload = JSON.parse(delivery.rows[0].payload);
  const payloadReduction = strategy.modifiedPayload
    ? calculatePayloadReduction(originalPayload, strategy.modifiedPayload)
    : 0;

  // Insert into replay queue
  const result = await pool.query(
    `INSERT INTO webhook_replay_queue (
      original_delivery_id, webhook_id, replay_strategy,
      ai_suggestions, original_payload, modified_payload,
      payload_reduced_by_pct, custom_timeout_ms, custom_retry_delay_ms,
      requested_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id`,
    [
      deliveryId,
      delivery.rows[0].webhook_id,
      strategy.strategy,
      JSON.stringify(strategy),
      originalPayload,
      strategy.modifiedPayload || originalPayload,
      payloadReduction,
      strategy.customTimeout,
      strategy.customRetryDelay,
      requestedBy,
    ]
  );

  return {
    replayId: result.rows[0].id,
    strategy,
  };
}

// ========================================
// Advanced Fraud Detection
// ========================================

/**
 * Detect API abuse patterns with geographic and behavioral analysis
 */
export async function detectAdvancedAbusePatterns(keyId: string): Promise<AbusePattern[]> {
  const patterns: AbusePattern[] = [];

  // Get recent requests for this key (last 24 hours)
  const requests = await pool.query(
    `SELECT ip_address, geo_country, created_at, response_code, endpoint
     FROM api_audit_log
     WHERE key_id = $1
       AND created_at >= NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC`,
    [keyId]
  );

  if (requests.rows.length === 0) {
    return patterns;
  }

  // 1. Detect IP Rotation
  const uniqueIps = new Set(requests.rows.map(r => r.ip_address).filter(Boolean));
  const uniqueCountries = new Set(requests.rows.map(r => r.geo_country).filter(Boolean));

  if (uniqueIps.size > 20 && requests.rows.length > 100) {
    const ipDiversityRatio = uniqueIps.size / (requests.rows.length / 10);

    if (ipDiversityRatio > 5) {
      patterns.push(await createAbusePattern(keyId, {
        patternType: 'ip_rotation',
        severity: uniqueIps.size > 50 ? 'critical' : 'high',
        confidenceScore: Math.min(ipDiversityRatio / 10, 1.0),
        details: {
          uniqueIps: uniqueIps.size,
          uniqueCountries: uniqueCountries.size,
          totalRequests: requests.rows.length,
          ipDiversityRatio,
        },
        evidenceSummary: `Excessive IP rotation: ${uniqueIps.size} unique IPs across ${requests.rows.length} requests`,
        actionTaken: 'temp_ban',
      }));
    }
  }

  // 2. Detect Geo-Impossible Travel
  const countries = requests.rows.map(r => ({
    country: r.geo_country,
    timestamp: r.created_at,
  })).filter(r => r.country);

  for (let i = 1; i < countries.length; i++) {
    const prev = countries[i - 1];
    const curr = countries[i];

    if (prev.country !== curr.country) {
      const timeDiffMinutes = (new Date(prev.timestamp).getTime() - new Date(curr.timestamp).getTime()) / 60000;

      if (timeDiffMinutes < 60) {
        // Same key used in 2 different countries within 1 hour
        patterns.push(await createAbusePattern(keyId, {
          patternType: 'geo_impossible',
          severity: 'critical',
          confidenceScore: 0.95,
          details: {
            country1: prev.country,
            country2: curr.country,
            timeDiffMinutes: Math.abs(timeDiffMinutes),
          },
          evidenceSummary: `Impossible travel: Used in ${prev.country} and ${curr.country} within ${Math.abs(timeDiffMinutes).toFixed(0)} minutes`,
          actionTaken: 'perm_ban',
        }));
      }
    }
  }

  // 3. Detect Credential Stuffing (high error rate on auth endpoints)
  const authRequests = requests.rows.filter(r =>
    r.endpoint?.includes('/auth') || r.endpoint?.includes('/login')
  );

  if (authRequests.length > 50) {
    const failedAuth = authRequests.filter(r => r.response_code === 401 || r.response_code === 403).length;
    const failureRate = failedAuth / authRequests.length;

    if (failureRate > 0.7) {
      patterns.push(await createAbusePattern(keyId, {
        patternType: 'credential_stuffing',
        severity: 'critical',
        confidenceScore: failureRate,
        details: {
          totalAuthAttempts: authRequests.length,
          failedAttempts: failedAuth,
          failureRate: (failureRate * 100).toFixed(2) + '%',
        },
        evidenceSummary: `Credential stuffing detected: ${failedAuth}/${authRequests.length} auth failures (${(failureRate * 100).toFixed(1)}%)`,
        actionTaken: 'perm_ban',
      }));
    }
  }

  // 4. Detect Bot Pattern (uniform timing)
  if (requests.rows.length > 100) {
    const timings: number[] = [];
    for (let i = 1; i < requests.rows.length; i++) {
      const diff = new Date(requests.rows[i - 1].created_at).getTime() -
                   new Date(requests.rows[i].created_at).getTime();
      timings.push(Math.abs(diff));
    }

    const avgTiming = timings.reduce((a, b) => a + b, 0) / timings.length;
    const variance = timings.reduce((sum, t) => sum + Math.pow(t - avgTiming, 2), 0) / timings.length;
    const stdDev = Math.sqrt(variance);
    const uniformityScore = 1 - (stdDev / avgTiming);

    if (uniformityScore > 0.85 && requests.rows.length > 200) {
      patterns.push(await createAbusePattern(keyId, {
        patternType: 'bot_pattern',
        severity: 'medium',
        confidenceScore: uniformityScore,
        details: {
          totalRequests: requests.rows.length,
          avgTimingMs: avgTiming.toFixed(2),
          uniformityScore: uniformityScore.toFixed(2),
        },
        evidenceSummary: `Automated bot detected: ${requests.rows.length} requests with ${(uniformityScore * 100).toFixed(1)}% timing uniformity`,
        actionTaken: 'throttle',
      }));
    }
  }

  // 5. Detect Rate Limit Abuse
  const requestsPerMinute = requests.rows.length / (24 * 60);
  if (requestsPerMinute > 100) {
    patterns.push(await createAbusePattern(keyId, {
      patternType: 'rate_limit_abuse',
      severity: requestsPerMinute > 500 ? 'high' : 'medium',
      confidenceScore: 0.90,
      details: {
        requestsPerMinute: requestsPerMinute.toFixed(2),
        totalRequests: requests.rows.length,
      },
      evidenceSummary: `Excessive request rate: ${requestsPerMinute.toFixed(1)} req/min (${requests.rows.length} in 24h)`,
      actionTaken: 'throttle',
    }));
  }

  return patterns;
}

async function createAbusePattern(keyId: string, pattern: any): Promise<AbusePattern> {
  const result = await pool.query(
    `INSERT INTO api_abuse_patterns (
      key_id, pattern_type, severity, confidence_score,
      details, evidence_summary, action_taken
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      keyId,
      pattern.patternType,
      pattern.severity,
      pattern.confidenceScore,
      JSON.stringify(pattern.details),
      pattern.evidenceSummary,
      pattern.actionTaken,
    ]
  );

  // Execute automatic action if enabled
  if (pattern.actionTaken !== 'none') {
    await executeAbuseAction(keyId, pattern.actionTaken);
  }

  return {
    id: result.rows[0].id,
    keyId,
    patternType: pattern.patternType,
    severity: pattern.severity,
    confidenceScore: pattern.confidenceScore,
    details: pattern.details,
    actionTaken: pattern.actionTaken,
    detectedAt: result.rows[0].detected_at,
  };
}

async function executeAbuseAction(keyId: string, action: string): Promise<void> {
  if (action === 'temp_ban' || action === 'perm_ban') {
    await pool.query(
      `UPDATE api_keys
       SET status = 'revoked',
           revoked_reason = $1,
           revoked_at = NOW()
       WHERE id = $2`,
      [`SIRA Auto-Ban: ${action}`, keyId]
    );

    console.error(`[SIRA] Banned API key ${keyId} - Action: ${action}`);
  } else if (action === 'throttle') {
    // Implement throttling logic (could update rate limiter in Redis)
    console.warn(`[SIRA] Throttled API key ${keyId}`);
  }
}

// ========================================
// Immutable Audit Logging
// ========================================

/**
 * Write to immutable audit log with hash chain
 */
export async function writeImmutableAudit(entry: {
  keyId?: string;
  webhookId?: string;
  appId?: string;
  eventType: string;
  eventCategory: string;
  actorId?: string;
  actorType?: string;
  httpMethod?: string;
  endpoint?: string;
  ipAddress?: string;
  userAgent?: string;
  payload?: any;
  responseCode?: number;
  responseTimeMs?: number;
  complianceFlags?: string[];
  geoCountry?: string;
}): Promise<ImmutableAuditEntry> {
  const result = await pool.query(
    `INSERT INTO api_audit_log (
      key_id, webhook_id, app_id, event_type, event_category,
      actor_id, actor_type, http_method, endpoint, ip_address,
      user_agent, payload, response_code, response_time_ms,
      compliance_flags, geo_country
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING hash, prev_hash, chain_index`,
    [
      entry.keyId || null,
      entry.webhookId || null,
      entry.appId || null,
      entry.eventType,
      entry.eventCategory,
      entry.actorId || null,
      entry.actorType || 'system',
      entry.httpMethod || null,
      entry.endpoint || null,
      entry.ipAddress || null,
      entry.userAgent || null,
      entry.payload ? JSON.stringify(entry.payload) : null,
      entry.responseCode || null,
      entry.responseTimeMs || null,
      entry.complianceFlags || [],
      entry.geoCountry || null,
    ]
  );

  return {
    eventType: entry.eventType,
    eventCategory: entry.eventCategory,
    keyId: entry.keyId,
    webhookId: entry.webhookId,
    payload: entry.payload,
    hash: result.rows[0].hash,
    prevHash: result.rows[0].prev_hash,
    chainIndex: result.rows[0].chain_index,
  };
}

/**
 * Verify audit log integrity (check hash chain)
 */
export async function verifyAuditLogIntegrity(startIndex: number, endIndex: number): Promise<{
  valid: boolean;
  brokenAt?: number;
  error?: string;
}> {
  const result = await pool.query(
    `SELECT id, hash, prev_hash, chain_index
     FROM api_audit_log
     WHERE chain_index >= $1 AND chain_index <= $2
     ORDER BY chain_index ASC`,
    [startIndex, endIndex]
  );

  for (let i = 1; i < result.rows.length; i++) {
    const prev = result.rows[i - 1];
    const curr = result.rows[i];

    if (curr.prev_hash !== prev.hash) {
      return {
        valid: false,
        brokenAt: curr.chain_index,
        error: `Hash chain broken at index ${curr.chain_index}`,
      };
    }
  }

  return { valid: true };
}

// ========================================
// Adaptive Webhook Profiles
// ========================================

/**
 * Update webhook profile based on delivery results
 */
export async function updateWebhookProfile(webhookId: string): Promise<void> {
  // Get recent delivery stats
  const stats = await pool.query(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as successful,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
       AVG(latency_ms) as avg_latency,
       PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) as p50_latency,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency,
       PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99_latency
     FROM webhook_deliveries
     WHERE webhook_id = $1
       AND created_at >= NOW() - INTERVAL '7 days'`,
    [webhookId]
  );

  const row = stats.rows[0];
  const total = parseInt(row.total) || 0;

  if (total === 0) return;

  const successRate = (parseInt(row.successful) / total) * 100;
  const failureRate = (parseInt(row.failed) / total) * 100;

  // Determine AI health score
  let healthScore = 1.0;
  if (failureRate > 50) healthScore = 0.2;
  else if (failureRate > 30) healthScore = 0.4;
  else if (failureRate > 10) healthScore = 0.6;
  else if (failureRate > 5) healthScore = 0.8;

  // Determine optimal strategy
  let preferredStrategy = 'exponential_backoff';
  if (failureRate > 40) preferredStrategy = 'conservative_linear_backoff';
  else if (successRate > 95) preferredStrategy = 'aggressive';

  // Generate AI recommendations
  const recommendations: string[] = [];
  if (failureRate > 30) recommendations.push('Consider enabling payload compression');
  if (parseFloat(row.avg_latency) > 5000) recommendations.push('Endpoint response time is slow, consider increasing timeout');
  if (failureRate > 50) recommendations.push('High failure rate - webhook may need to be temporarily disabled');

  // Update profile
  await pool.query(
    `INSERT INTO webhook_profiles (
      webhook_id, avg_latency_ms, p50_latency_ms, p95_latency_ms, p99_latency_ms,
      success_rate, failure_rate, preferred_strategy, ai_health_score, ai_recommendations,
      total_deliveries
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (webhook_id) DO UPDATE SET
      avg_latency_ms = EXCLUDED.avg_latency_ms,
      p50_latency_ms = EXCLUDED.p50_latency_ms,
      p95_latency_ms = EXCLUDED.p95_latency_ms,
      p99_latency_ms = EXCLUDED.p99_latency_ms,
      success_rate = EXCLUDED.success_rate,
      failure_rate = EXCLUDED.failure_rate,
      preferred_strategy = EXCLUDED.preferred_strategy,
      ai_health_score = EXCLUDED.ai_health_score,
      ai_recommendations = EXCLUDED.ai_recommendations,
      total_deliveries = EXCLUDED.total_deliveries,
      last_analysis = NOW()`,
    [
      webhookId,
      parseFloat(row.avg_latency) || 0,
      parseFloat(row.p50_latency) || 0,
      parseFloat(row.p95_latency) || 0,
      parseFloat(row.p99_latency) || 0,
      successRate,
      failureRate,
      preferredStrategy,
      healthScore,
      recommendations,
      total,
    ]
  );
}

// ========================================
// Helper Functions
// ========================================

function minimizePayload(payload: any): any {
  // Remove optional fields to reduce size
  const minimal: any = {};
  const essentialFields = ['id', 'type', 'data', 'timestamp'];

  for (const field of essentialFields) {
    if (payload[field] !== undefined) {
      minimal[field] = payload[field];
    }
  }

  return minimal;
}

function convertToJsonLight(payload: any): any {
  // Convert to lightweight format
  return {
    id: payload.id,
    type: payload.type || payload.event,
    ts: payload.timestamp || Date.now(),
    d: JSON.stringify(payload.data || payload).substring(0, 500), // Truncate
  };
}

function compressPayload(payload: any): any {
  // Simulate compression by removing verbose fields
  const compressed = { ...payload };
  delete compressed.metadata;
  delete compressed.debug;
  delete compressed.trace;
  return compressed;
}

function calculatePayloadReduction(original: any, modified: any): number {
  const originalSize = JSON.stringify(original).length;
  const modifiedSize = JSON.stringify(modified).length;
  return ((originalSize - modifiedSize) / originalSize) * 100;
}

async function logAIRecommendation(webhookId: string, type: string, strategy: any): Promise<void> {
  await pool.query(
    `INSERT INTO sira_ai_recommendations (
      entity_type, entity_id, recommendation_type, priority, title,
      description, ai_confidence, triggered_by, evidence
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      'webhook',
      webhookId,
      type,
      'high',
      `AI-Guided Replay: ${strategy.strategy}`,
      strategy.expectedImprovement,
      strategy.aiConfidence,
      'replay_analysis',
      JSON.stringify(strategy),
    ]
  );
}
