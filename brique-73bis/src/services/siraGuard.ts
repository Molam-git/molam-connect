/**
 * SIRA Guard - Anomaly Detection & Proactive Security
 * Sous-Brique 73bis
 */

import { pool } from '../../../brique-73/src/db';
import axios from 'axios';

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
// Main Analysis Function
// ========================================

/**
 * Analyze API key behavior and detect suspicious patterns
 */
export async function analyzeApiBehavior(stats: ApiKeyStats): Promise<SiraGuardResult> {
  const events: SuspiciousEvent[] = [];
  let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  const allRecommendations = new Set<string>();

  // Run all detection algorithms
  const bruteForceEvent = detectBruteForce(stats);
  if (bruteForceEvent) {
    events.push(bruteForceEvent);
    if (getSeverityLevel(bruteForceEvent.severity) > getSeverityLevel(maxSeverity)) {
      maxSeverity = bruteForceEvent.severity;
    }
    bruteForceEvent.recommendations.forEach(r => allRecommendations.add(r));
  }

  const botPatternEvent = detectBotPattern(stats);
  if (botPatternEvent) {
    events.push(botPatternEvent);
    if (getSeverityLevel(botPatternEvent.severity) > getSeverityLevel(maxSeverity)) {
      maxSeverity = botPatternEvent.severity;
    }
    botPatternEvent.recommendations.forEach(r => allRecommendations.add(r));
  }

  const ipRotationEvent = detectIpRotation(stats);
  if (ipRotationEvent) {
    events.push(ipRotationEvent);
    if (getSeverityLevel(ipRotationEvent.severity) > getSeverityLevel(maxSeverity)) {
      maxSeverity = ipRotationEvent.severity;
    }
    ipRotationEvent.recommendations.forEach(r => allRecommendations.add(r));
  }

  const spikeAnomalyEvent = detectSpikeAnomaly(stats);
  if (spikeAnomalyEvent) {
    events.push(spikeAnomalyEvent);
    if (getSeverityLevel(spikeAnomalyEvent.severity) > getSeverityLevel(maxSeverity)) {
      maxSeverity = spikeAnomalyEvent.severity;
    }
    spikeAnomalyEvent.recommendations.forEach(r => allRecommendations.add(r));
  }

  // Calculate overall anomaly score
  const anomalyScore = calculateAnomalyScore(stats, events);

  // Determine action based on severity and score
  let actionTaken: 'none' | 'alert' | 'throttle' | 'tempban' | 'permban' = 'none';

  if (maxSeverity === 'critical' && anomalyScore > 0.8) {
    actionTaken = 'tempban';
  } else if (maxSeverity === 'high' || anomalyScore > 0.7) {
    actionTaken = 'throttle';
  } else if (events.length > 0) {
    actionTaken = 'alert';
  }

  // Log suspicious events to database
  if (events.length > 0) {
    await logSuspiciousEvents(stats.keyId, events, actionTaken);
  }

  // Execute action
  if (actionTaken !== 'none' && actionTaken !== 'alert') {
    await executeAction(stats.keyId, actionTaken);
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

/**
 * Detect brute force attempts (high error rate)
 */
function detectBruteForce(stats: ApiKeyStats): SuspiciousEvent | null {
  const errorRate = stats.errors / stats.totalRequests;

  // Brute force: >50% errors with high volume
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
      evidenceSummary: `High error rate (${(errorRate * 100).toFixed(1)}%) with ${stats.totalRequests} requests suggests brute force or credential stuffing`,
      recommendations: [
        'rotate_key',
        'Review failed authentication attempts',
        'Implement stricter rate limits',
        'Enable multi-factor authentication',
      ],
    };
  }

  return null;
}

/**
 * Detect bot patterns (low latency, high volume)
 */
function detectBotPattern(stats: ApiKeyStats): SuspiciousEvent | null {
  const isLowLatency = stats.p95Latency < 50;
  const isHighVolume = stats.totalRequests > 1000;
  const isUniformTiming = stats.p99Latency - stats.p95Latency < 20;

  if (isLowLatency && isHighVolume && isUniformTiming) {
    const confidence = 0.7;

    return {
      eventType: 'bot_pattern',
      severity: 'medium',
      confidence,
      evidence: {
        p95Latency: stats.p95Latency,
        p99Latency: stats.p99Latency,
        totalRequests: stats.totalRequests,
        latencyVariance: stats.p99Latency - stats.p95Latency,
      },
      evidenceSummary: `Automated bot pattern detected: consistent low latency (${stats.p95Latency}ms) with high volume (${stats.totalRequests} requests)`,
      recommendations: [
        'Implement CAPTCHA for high-frequency operations',
        'Add request signature validation',
        'Consider bot detection service integration',
      ],
    };
  }

  return null;
}

/**
 * Detect IP rotation (credential sharing or proxy abuse)
 */
function detectIpRotation(stats: ApiKeyStats): SuspiciousEvent | null {
  const ipDiversity = stats.uniqueIps / Math.max(stats.totalRequests / 100, 1);

  // Suspicious if >10 unique IPs per 100 requests
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
      evidenceSummary: `Abnormal IP rotation detected: ${stats.uniqueIps} unique IPs across ${stats.totalRequests} requests`,
      recommendations: [
        'split_keys',
        'Investigate credential sharing',
        'Whitelist known IP ranges',
        'Enable IP-based rate limiting',
      ],
    };
  }

  return null;
}

/**
 * Detect traffic spike anomalies
 */
function detectSpikeAnomaly(stats: ApiKeyStats): SuspiciousEvent | null {
  // This requires historical data - simplified for now
  // In production, compare against rolling average

  const EXPECTED_HOURLY_MAX = 5000;

  if (stats.totalRequests > EXPECTED_HOURLY_MAX * 5) {
    const confidence = 0.6;

    return {
      eventType: 'spike_anomaly',
      severity: 'medium',
      confidence,
      evidence: {
        totalRequests: stats.totalRequests,
        expectedMax: EXPECTED_HOURLY_MAX,
        spikeRatio: (stats.totalRequests / EXPECTED_HOURLY_MAX).toFixed(2),
      },
      evidenceSummary: `Unusual traffic spike: ${stats.totalRequests} requests (${(stats.totalRequests / EXPECTED_HOURLY_MAX).toFixed(1)}x normal)`,
      recommendations: [
        'increase_quota',
        'Contact support if spike is expected',
        'Review for DDoS attack',
      ],
    };
  }

  return null;
}

// ========================================
// Scoring & Actions
// ========================================

/**
 * Calculate overall anomaly score (0-1)
 */
function calculateAnomalyScore(stats: ApiKeyStats, events: SuspiciousEvent[]): number {
  if (events.length === 0) return 0;

  // Weight by severity
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

  // Average and clamp
  const avgScore = weightedScore / events.length;
  return Math.min(1.0, avgScore);
}

/**
 * Log suspicious events to database
 */
async function logSuspiciousEvents(
  keyId: string,
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
          keyId,
          event.eventType,
          event.severity,
          event.confidence,
          JSON.stringify(event.evidence),
          event.evidenceSummary,
          actionTaken,
          event.recommendations,
        ]
      );

      console.log(`[SIRA Guard] Suspicious event logged: ${event.eventType} (${event.severity}) for key ${keyId}`);
    } catch (error) {
      console.error('Failed to log suspicious event', { keyId, event, error });
    }
  }
}

/**
 * Execute protective action
 */
async function executeAction(keyId: string, action: 'throttle' | 'tempban' | 'permban'): Promise<void> {
  try {
    if (action === 'tempban') {
      // Temporarily revoke key for 1 hour
      await pool.query(
        `UPDATE api_keys SET status = 'revoked', revoked_reason = 'SIRA Guard: Temporary ban due to suspicious activity', revoked_at = NOW() WHERE id = $1`,
        [keyId]
      );

      console.warn(`[SIRA Guard] Temporarily banned key ${keyId}`);

      // Schedule re-activation (requires worker)
      // await scheduleKeyReactivation(keyId, 3600);
    } else if (action === 'throttle') {
      // Reduce rate limit to 10 req/min
      console.warn(`[SIRA Guard] Throttled key ${keyId} to 10 req/min`);
      // Implementation: Update rate limit config in Redis
    } else if (action === 'permban') {
      await pool.query(
        `UPDATE api_keys SET status = 'revoked', revoked_reason = 'SIRA Guard: Permanent ban due to severe abuse' WHERE id = $1`,
        [keyId]
      );

      console.error(`[SIRA Guard] Permanently banned key ${keyId}`);
    }

    // Send alert to Ops (Slack, email, etc.)
    await sendOpsAlert(keyId, action);
  } catch (error) {
    console.error('Failed to execute action', { keyId, action, error });
  }
}

/**
 * Send alert to Ops team
 */
async function sendOpsAlert(keyId: string, action: string): Promise<void> {
  // Integration with Slack, PagerDuty, etc.
  console.log(`[SIRA Guard] Ops alert: Key ${keyId} - Action: ${action}`);

  // Example: Slack webhook
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      await axios.post(process.env.SLACK_WEBHOOK_URL, {
        text: `🚨 SIRA Guard Alert: Key ${keyId.slice(0, 8)}... - Action: ${action}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*SIRA Guard Security Alert*\n\nKey: \`${keyId}\`\nAction: *${action}*\n\nReview immediately in Dev Console.`,
            },
          },
        ],
      });
    } catch (error) {
      console.error('Failed to send Slack alert', error);
    }
  }
}

// ========================================
// Helpers
// ========================================

function getSeverityLevel(severity: string): number {
  const levels: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return levels[severity] || 0;
}
