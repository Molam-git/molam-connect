/**
 * Brique 70octies - Prometheus Metrics
 * Observability metrics for loyalty system monitoring
 */

import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

// Create separate registry for loyalty metrics
export const loyaltyRegistry = new Registry();

// Collect default Node.js metrics
collectDefaultMetrics({ register: loyaltyRegistry, prefix: 'loyalty_' });

/**
 * Business Metrics
 */

// Points earned counter
export const pointsEarnedTotal = new Counter({
  name: 'loyalty_points_earned_total',
  help: 'Total loyalty points awarded to users',
  labelNames: ['program_id', 'program_name', 'tier', 'module'],
  registers: [loyaltyRegistry]
});

// Points redeemed counter
export const pointsRedeemedTotal = new Counter({
  name: 'loyalty_points_redeemed_total',
  help: 'Total loyalty points redeemed by users',
  labelNames: ['program_id', 'program_name', 'reward_type'],
  registers: [loyaltyRegistry]
});

// Transactions counter
export const transactionsTotal = new Counter({
  name: 'loyalty_transactions_total',
  help: 'Total loyalty transactions processed',
  labelNames: ['program_id', 'type', 'status'],
  registers: [loyaltyRegistry]
});

// Active users gauge
export const activeUsers = new Gauge({
  name: 'loyalty_active_users',
  help: 'Number of active users in loyalty programs',
  labelNames: ['program_id', 'tier'],
  registers: [loyaltyRegistry]
});

// Program budget gauge
export const programBudgetRemaining = new Gauge({
  name: 'loyalty_program_budget_remaining',
  help: 'Remaining budget for loyalty program',
  labelNames: ['program_id', 'program_name'],
  registers: [loyaltyRegistry]
});

// Redemption rate gauge
export const redemptionRate = new Gauge({
  name: 'loyalty_redemption_rate',
  help: 'Percentage of points redeemed vs earned',
  labelNames: ['program_id'],
  registers: [loyaltyRegistry]
});

// Churn risk gauge
export const avgChurnRisk = new Gauge({
  name: 'loyalty_avg_churn_risk',
  help: 'Average churn risk score across users',
  labelNames: ['program_id', 'tier'],
  registers: [loyaltyRegistry]
});

/**
 * SIRA AI Metrics
 */

// SIRA bonus points counter
export const siraBonus Points = new Counter({
  name: 'loyalty_sira_bonus_points_total',
  help: 'Total bonus points awarded by SIRA AI',
  labelNames: ['program_id', 'reason'],
  registers: [loyaltyRegistry]
});

// SIRA confidence score histogram
export const siraConfidenceScore = new Histogram({
  name: 'loyalty_sira_confidence_score',
  help: 'SIRA AI confidence scores distribution',
  labelNames: ['program_id', 'model_version'],
  buckets: [0.1, 0.3, 0.5, 0.7, 0.9, 1.0],
  registers: [loyaltyRegistry]
});

// Tier upgrades counter
export const tierUpgradesTotal = new Counter({
  name: 'loyalty_tier_upgrades_total',
  help: 'Total tier upgrades',
  labelNames: ['program_id', 'from_tier', 'to_tier'],
  registers: [loyaltyRegistry]
});

/**
 * Performance Metrics
 */

// API latency histogram
export const apiLatency = new Histogram({
  name: 'loyalty_api_latency_seconds',
  help: 'API endpoint latency in seconds',
  labelNames: ['method', 'endpoint', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [loyaltyRegistry]
});

// Ingestion latency histogram
export const ingestionLatency = new Histogram({
  name: 'loyalty_ingestion_latency_ms',
  help: 'Event ingestion latency in milliseconds',
  labelNames: ['program_id', 'event_type'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000],
  registers: [loyaltyRegistry]
});

// Database query latency
export const dbQueryLatency = new Histogram({
  name: 'loyalty_db_query_latency_ms',
  help: 'Database query latency in milliseconds',
  labelNames: ['query_type'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [loyaltyRegistry]
});

/**
 * Error Metrics
 */

// Errors counter
export const errorsTotal = new Counter({
  name: 'loyalty_errors_total',
  help: 'Total errors in loyalty system',
  labelNames: ['type', 'source'],
  registers: [loyaltyRegistry]
});

// Idempotency hits counter
export const idempotencyHits = new Counter({
  name: 'loyalty_idempotency_hits_total',
  help: 'Number of duplicate requests caught by idempotency check',
  labelNames: ['program_id'],
  registers: [loyaltyRegistry]
});

// Fraud detection counter
export const fraudDetections = new Counter({
  name: 'loyalty_fraud_detections_total',
  help: 'Number of fraud cases detected',
  labelNames: ['program_id', 'fraud_type'],
  registers: [loyaltyRegistry]
});

// Account freezes counter
export const accountFreezes = new Counter({
  name: 'loyalty_account_freezes_total',
  help: 'Number of accounts frozen',
  labelNames: ['program_id', 'reason'],
  registers: [loyaltyRegistry]
});

/**
 * Worker Metrics
 */

// Worker execution counter
export const workerExecutions = new Counter({
  name: 'loyalty_worker_executions_total',
  help: 'Total worker executions',
  labelNames: ['worker_name', 'status'],
  registers: [loyaltyRegistry]
});

// Worker duration histogram
export const workerDuration = new Histogram({
  name: 'loyalty_worker_duration_seconds',
  help: 'Worker execution duration in seconds',
  labelNames: ['worker_name'],
  buckets: [1, 5, 10, 30, 60, 300, 600],
  registers: [loyaltyRegistry]
});

// Campaign executions counter
export const campaignExecutions = new Counter({
  name: 'loyalty_campaign_executions_total',
  help: 'Total campaign executions',
  labelNames: ['campaign_type', 'status'],
  registers: [loyaltyRegistry]
});

/**
 * Approval Workflow Metrics
 */

// Approval requests counter
export const approvalRequests = new Counter({
  name: 'loyalty_approval_requests_total',
  help: 'Total approval requests created',
  labelNames: ['request_type', 'status'],
  registers: [loyaltyRegistry]
});

// Approval time histogram
export const approvalTime = new Histogram({
  name: 'loyalty_approval_time_hours',
  help: 'Time taken to approve requests in hours',
  labelNames: ['request_type'],
  buckets: [0.5, 1, 2, 4, 8, 24, 48],
  registers: [loyaltyRegistry]
});

/**
 * Helper functions to record metrics
 */

export function recordPointsEarned(
  programId: string,
  programName: string,
  tier: string,
  module: string,
  points: number
) {
  pointsEarnedTotal.inc({ program_id: programId, program_name: programName, tier, module }, points);
}

export function recordPointsRedeemed(
  programId: string,
  programName: string,
  rewardType: string,
  points: number
) {
  pointsRedeemedTotal.inc({ program_id: programId, program_name: programName, reward_type: rewardType }, points);
}

export function recordTransaction(programId: string, type: string, status: string) {
  transactionsTotal.inc({ program_id: programId, type, status });
}

export function recordSiraBonus(programId: string, reason: string, bonusPoints: number) {
  siraBonusPoints.inc({ program_id: programId, reason }, bonusPoints);
}

export function recordSiraConfidence(programId: string, modelVersion: string, confidence: number) {
  siraConfidenceScore.observe({ program_id: programId, model_version: modelVersion }, confidence);
}

export function recordTierUpgrade(programId: string, fromTier: string, toTier: string) {
  tierUpgradesTotal.inc({ program_id: programId, from_tier: fromTier, to_tier: toTier });
}

export function recordIngestionLatency(programId: string, eventType: string, latencyMs: number) {
  ingestionLatency.observe({ program_id: programId, event_type: eventType }, latencyMs);
}

export function recordError(type: string, source: string) {
  errorsTotal.inc({ type, source });
}

export function recordIdempotencyHit(programId: string) {
  idempotencyHits.inc({ program_id: programId });
}

export function recordFraudDetection(programId: string, fraudType: string) {
  fraudDetections.inc({ program_id: programId, fraud_type: fraudType });
}

export function recordAccountFreeze(programId: string, reason: string) {
  accountFreezes.inc({ program_id: programId, reason });
}

export function recordWorkerExecution(workerName: string, status: string, durationSeconds: number) {
  workerExecutions.inc({ worker_name: workerName, status });
  workerDuration.observe({ worker_name: workerName }, durationSeconds);
}

export function recordCampaignExecution(campaignType: string, status: string) {
  campaignExecutions.inc({ campaign_type: campaignType, status });
}

export function recordApprovalRequest(requestType: string, status: string) {
  approvalRequests.inc({ request_type: requestType, status });
}

export function recordApprovalTime(requestType: string, hours: number) {
  approvalTime.observe({ request_type: requestType }, hours);
}

/**
 * Express middleware to track API latency
 */
export function metricsMiddleware() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000; // Convert to seconds
      apiLatency.observe(
        {
          method: req.method,
          endpoint: req.route?.path || req.path,
          status_code: res.statusCode
        },
        duration
      );
    });

    next();
  };
}

/**
 * Get metrics endpoint handler
 */
export async function getMetrics(): Promise<string> {
  return await loyaltyRegistry.metrics();
}
