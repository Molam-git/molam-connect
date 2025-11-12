/**
 * SIRA Guard - API Key & Webhook Anomaly Detection
 * Brique 73 + 73bis Integration
 *
 * Monitors API keys and webhooks for suspicious patterns and automatically
 * takes protective actions (alert, throttle, ban)
 */

import { pool } from '../db';

// ========================================
// Types
// ========================================

export interface ApiKeyStats {
  keyId: string;
  totalRequests: number;
  successfulRequests: number;
  errors: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  uniqueIps: number;
  topIps: Array<{ ip: string; count: number }>;
  statusDistribution: Record<string, number>;
  periodStart: Date;
  periodEnd: Date;
}

export interface WebhookStats {
  webhookId: string;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  avgLatency: number;
  maxLatency: number;
  errorTypes: Record<string, number>;
  consecutiveFailures: number;
}

export interface SuspiciousEvent {
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  evidence: any;
  evidenceSummary: string;
  recommendations: string[];
}

export interface SiraGuardResult {
  suspicious: boolean;
  anomalyScore: number;
  events: SuspiciousEvent[];
  actionTaken: 'none' | 'alert' | 'throttle' | 'tempban' | 'permban';
  recommendations: string[];
}

// ========================================
// Main Analysis Functions
// ========================================

/**
 * Analyze API key behavior for suspicious patterns
 */
export async function analyzeApiKeyBehavior(stats: ApiKeyStats): Promise<SiraGuardResult> {
  const events: SuspiciousEvent[] = [];
  let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  const allRecommendations = new Set<string>();

  // Run detection algorithms
  const detections = [
    detectBruteForce(stats),
    detectBotPattern(stats),
    detectIpRotation(stats),
    detectSpikeAnomaly(stats),
  ];

  for (const detection of detections) {
    if (detection) {
      events.push(detection);
      if (getSeverityLevel(detection.severity) > getSeverityLevel(maxSeverity)) {
        maxSeverity = detection.severity;
      }
      detection.recommendations.forEach(r => allRecommendations.add(r));
    }
  }

  // Calculate anomaly score
  const anomalyScore = calculateAnomalyScore(events);

  // Determine action
  let actionTaken: 'none' | 'alert' | 'throttle' | 'tempban' | 'permban' = 'none';
  if (maxSeverity === 'critical' && anomalyScore > 0.8) {
    actionTaken = 'tempban';
  } else if (maxSeverity === 'high' || anomalyScore > 0.7) {
    actionTaken = 'throttle';
  } else if (events.length > 0) {
    actionTaken = 'alert';
  }

  // Log events
  if (events.length > 0) {
    await logSuspiciousEvents(stats.keyId, 'api_key', events, actionTaken);
  }

  // Execute action
  if (actionTaken !== 'none' && actionTaken !== 'alert') {
    await executeApiKeyAction(stats.keyId, actionTaken);
  }

  return {
    suspicious: events.length > 0,
    anomalyScore,
    events,
    actionTaken,
    recommendations: Array.from(allRecommendations),
  };
}

/**
 * Analyze webhook delivery patterns for issues
 */
export async function analyzeWebhookHealth(stats: WebhookStats): Promise<SiraGuardResult> {
  const events: SuspiciousEvent[] = [];
  const allRecommendations = new Set<string>();
  let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // Check for high failure rate
  const failureRate = stats.failedDeliveries / Math.max(stats.totalDeliveries, 1);
  if (failureRate > 0.5 && stats.totalDeliveries > 10) {
    const event: SuspiciousEvent = {
      eventType: 'webhook_high_failure',
      severity: failureRate > 0.8 ? 'high' : 'medium',
      confidence: Math.min(failureRate + 0.2, 1.0),
      evidence: {
        failureRate: (failureRate * 100).toFixed(2) + '%',
        totalDeliveries: stats.totalDeliveries,
        failedDeliveries: stats.failedDeliveries,
        errorTypes: stats.errorTypes,
      },
      evidenceSummary: `High webhook failure rate (${(failureRate * 100).toFixed(1)}%) - ${stats.failedDeliveries}/${stats.totalDeliveries} deliveries failed`,
      recommendations: [
        'Check webhook endpoint health',
        'Verify endpoint authentication',
        'Review webhook payload format',
        'Contact webhook receiver admin',
      ],
    };
    events.push(event);
    maxSeverity = event.severity;
    event.recommendations.forEach(r => allRecommendations.add(r));
  }

  // Check for consecutive failures
  if (stats.consecutiveFailures > 5) {
    const event: SuspiciousEvent = {
      eventType: 'webhook_endpoint_down',
      severity: stats.consecutiveFailures > 20 ? 'critical' : 'high',
      confidence: 0.9,
      evidence: {
        consecutiveFailures: stats.consecutiveFailures,
        lastErrorTypes: stats.errorTypes,
      },
      evidenceSummary: `Webhook endpoint appears down - ${stats.consecutiveFailures} consecutive failures`,
      recommendations: [
        'Disable webhook temporarily',
        'Contact endpoint administrator',
        'Check endpoint SSL certificate',
        'Verify endpoint is not blocking Molam IPs',
      ],
    };
    events.push(event);
    if (getSeverityLevel(event.severity) > getSeverityLevel(maxSeverity)) {
      maxSeverity = event.severity;
    }
    event.recommendations.forEach(r => allRecommendations.add(r));
  }

  // Calculate anomaly score
  const anomalyScore = Math.min(failureRate + (stats.consecutiveFailures / 50), 1.0);

  // Determine action
  let actionTaken: 'none' | 'alert' | 'throttle' | 'tempban' | 'permban' = 'none';
  if (maxSeverity === 'critical' || stats.consecutiveFailures > 20) {
    actionTaken = 'tempban';
  } else if (maxSeverity === 'high') {
    actionTaken = 'alert';
  } else if (events.length > 0) {
    actionTaken = 'alert';
  }

  // Log events
  if (events.length > 0) {
    await logSuspiciousEvents(stats.webhookId, 'webhook', events, actionTaken);
  }

  // Execute action
  if (actionTaken === 'tempban') {
    await executeWebhookAction(stats.webhookId, 'disable');
  }

  return {
    suspicious: events.length > 0,
    anomalyScore,
    events,
    actionTaken,
    recommendations: Array.from(allRecommendations),
  };
}

// ========================================
// Detection Algorithms
// ========================================

function detectBruteForce(stats: ApiKeyStats): SuspiciousEvent | null {
  const errorRate = stats.errors / stats.totalRequests;

  if (errorRate > 0.5 && stats.totalRequests > 100) {
    const confidence = Math.min(errorRate + (stats.totalRequests / 1000), 1.0);

    return {
      eventType: 'brute_force',
      severity: errorRate > 0.8 ? 'critical' : 'high',
      confidence,
      evidence: {
        errorRate: (errorRate * 100).toFixed(2) + '%',
        totalRequests: stats.totalRequests,
        errors: stats.errors,
        statusDistribution: stats.statusDistribution,
      },
      evidenceSummary: `High error rate (${(errorRate * 100).toFixed(1)}%) with ${stats.totalRequests} requests suggests brute force attack`,
      recommendations: [
        'Rotate API key immediately',
        'Review failed authentication attempts',
        'Implement stricter rate limits',
        'Enable multi-factor authentication',
      ],
    };
  }

  return null;
}

function detectBotPattern(stats: ApiKeyStats): SuspiciousEvent | null {
  const isLowLatency = stats.p95Latency < 50;
  const isHighVolume = stats.totalRequests > 1000;
  const isUniformTiming = stats.p99Latency - stats.p95Latency < 20;

  if (isLowLatency && isHighVolume && isUniformTiming) {
    return {
      eventType: 'bot_pattern',
      severity: 'medium',
      confidence: 0.7,
      evidence: {
        p95Latency: stats.p95Latency,
        p99Latency: stats.p99Latency,
        totalRequests: stats.totalRequests,
        latencyVariance: stats.p99Latency - stats.p95Latency,
      },
      evidenceSummary: `Automated bot pattern: consistent low latency (${stats.p95Latency}ms) with high volume (${stats.totalRequests} requests)`,
      recommendations: [
        'Implement CAPTCHA for high-frequency operations',
        'Add request signature validation',
        'Consider bot detection service',
      ],
    };
  }

  return null;
}

function detectIpRotation(stats: ApiKeyStats): SuspiciousEvent | null {
  const ipDiversity = stats.uniqueIps / Math.max(stats.totalRequests / 100, 1);

  if (ipDiversity > 10 && stats.uniqueIps > 20) {
    const confidence = Math.min(ipDiversity / 20, 1.0);

    return {
      eventType: 'ip_rotation',
      severity: ipDiversity > 50 ? 'high' : 'medium',
      confidence,
      evidence: {
        uniqueIps: stats.uniqueIps,
        totalRequests: stats.totalRequests,
        ipDiversity: ipDiversity.toFixed(2),
        topIps: stats.topIps.slice(0, 5),
      },
      evidenceSummary: `Abnormal IP rotation: ${stats.uniqueIps} unique IPs across ${stats.totalRequests} requests`,
      recommendations: [
        'Split credentials across multiple API keys',
        'Investigate credential sharing',
        'Whitelist known IP ranges',
        'Enable IP-based rate limiting',
      ],
    };
  }

  return null;
}

function detectSpikeAnomaly(stats: ApiKeyStats): SuspiciousEvent | null {
  const EXPECTED_HOURLY_MAX = 5000;

  if (stats.totalRequests > EXPECTED_HOURLY_MAX * 5) {
    return {
      eventType: 'spike_anomaly',
      severity: 'medium',
      confidence: 0.6,
      evidence: {
        totalRequests: stats.totalRequests,
        expectedMax: EXPECTED_HOURLY_MAX,
        spikeRatio: (stats.totalRequests / EXPECTED_HOURLY_MAX).toFixed(2),
      },
      evidenceSummary: `Unusual traffic spike: ${stats.totalRequests} requests (${(stats.totalRequests / EXPECTED_HOURLY_MAX).toFixed(1)}x normal)`,
      recommendations: [
        'Contact support if spike is expected',
        'Consider increasing rate quota',
        'Review for DDoS attack',
      ],
    };
  }

  return null;
}

// ========================================
// Scoring & Actions
// ========================================

function calculateAnomalyScore(events: SuspiciousEvent[]): number {
  if (events.length === 0) return 0;

  const severityWeights: Record<string, number> = {
    low: 0.25,
    medium: 0.50,
    high: 0.75,
    critical: 1.0,
  };

  const weightedScore = events.reduce((acc, event) => {
    const weight = severityWeights[event.severity] || 0.5;
    return acc + (event.confidence * weight);
  }, 0);

  return Math.min(1.0, weightedScore / events.length);
}

async function logSuspiciousEvents(
  entityId: string,
  entityType: 'api_key' | 'webhook',
  events: SuspiciousEvent[],
  actionTaken: string
): Promise<void> {
  for (const event of events) {
    try {
      await pool.query(
        `INSERT INTO api_suspicious_events (
          key_id, event_type, severity, confidence, metadata, evidence_summary,
          action_taken, sira_recommendations, detected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          entityType === 'api_key' ? entityId : null,
          event.eventType,
          event.severity,
          event.confidence,
          JSON.stringify({ ...event.evidence, entityType }),
          event.evidenceSummary,
          actionTaken,
          event.recommendations,
        ]
      );
    } catch (error) {
      console.error('Failed to log suspicious event', { entityId, event, error });
    }
  }
}

async function executeApiKeyAction(keyId: string, action: 'throttle' | 'tempban' | 'permban'): Promise<void> {
  try {
    if (action === 'tempban') {
      await pool.query(
        `UPDATE api_keys
         SET status = 'revoked',
             revoked_reason = 'SIRA Guard: Temporary ban due to suspicious activity',
             revoked_at = NOW()
         WHERE id = $1`,
        [keyId]
      );
      console.warn(`[SIRA Guard] Temporarily banned API key ${keyId}`);
    } else if (action === 'throttle') {
      // Update rate limit (implementation depends on rate limiter)
      console.warn(`[SIRA Guard] Throttled API key ${keyId}`);
    } else if (action === 'permban') {
      await pool.query(
        `UPDATE api_keys
         SET status = 'revoked',
             revoked_reason = 'SIRA Guard: Permanent ban due to severe abuse'
         WHERE id = $1`,
        [keyId]
      );
      console.error(`[SIRA Guard] Permanently banned API key ${keyId}`);
    }
  } catch (error) {
    console.error('Failed to execute API key action', { keyId, action, error });
  }
}

async function executeWebhookAction(webhookId: string, action: 'disable'): Promise<void> {
  try {
    await pool.query(
      `UPDATE webhooks
       SET enabled = FALSE,
           updated_at = NOW()
       WHERE id = $1`,
      [webhookId]
    );
    console.warn(`[SIRA Guard] Disabled webhook ${webhookId} due to consecutive failures`);
  } catch (error) {
    console.error('Failed to execute webhook action', { webhookId, action, error });
  }
}

function getSeverityLevel(severity: string): number {
  const levels: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return levels[severity] || 0;
}

// ========================================
// Query Functions
// ========================================

/**
 * Get recent suspicious events for display
 */
export async function getRecentSuspiciousEvents(
  keyId?: string,
  limit: number = 50
): Promise<any[]> {
  const query = keyId
    ? `SELECT * FROM api_suspicious_events
       WHERE key_id = $1
       ORDER BY detected_at DESC
       LIMIT $2`
    : `SELECT * FROM api_suspicious_events
       ORDER BY detected_at DESC
       LIMIT $1`;

  const params = keyId ? [keyId, limit] : [limit];
  const result = await pool.query(query, params);

  return result.rows.map(row => ({
    id: row.id,
    keyId: row.key_id,
    eventType: row.event_type,
    severity: row.severity,
    confidence: parseFloat(row.confidence),
    evidenceSummary: row.evidence_summary,
    actionTaken: row.action_taken,
    recommendations: row.sira_recommendations,
    detectedAt: row.detected_at,
    reviewed: row.reviewed,
  }));
}

/**
 * Get SIRA recommendations for a key
 */
export async function getSiraRecommendations(keyId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM api_sira_recommendations
     WHERE key_id = $1 AND status = 'pending'
     ORDER BY priority DESC, created_at DESC
     LIMIT 10`,
    [keyId]
  );

  return result.rows.map(row => ({
    id: row.id,
    type: row.recommendation_type,
    priority: row.priority,
    title: row.title,
    description: row.description,
    actionSteps: row.action_steps,
    triggeredBy: row.triggered_by,
    createdAt: row.created_at,
  }));
}
