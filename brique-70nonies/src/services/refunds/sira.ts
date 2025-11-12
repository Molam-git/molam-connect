/**
 * Brique 70nonies - SIRA Refund Evaluation Service
 * ML-powered risk assessment for refund requests
 */

import pool from '../../db';

export interface SiraRefundInput {
  paymentId: string;
  userId: string;
  merchantId: string;
  requestedAmount: number;
  originalAmount: number;
  currency: string;
  reason?: string;
  originModule: string;
}

export interface SiraRefundDecision {
  action: 'auto_approve' | 'manual_review' | 'auto_reject';
  score: number;  // 0.0 to 1.0 (0=safe, 1=very risky)
  confidence: number;  // 0.0 to 1.0
  reasons: string[];
  suggestedAmount?: number;  // For partial refund suggestions
  requireKyc: boolean;
  requireMultiSig: boolean;
  modelVersion: string;
}

export interface UserRefundHistory {
  totalRefunds: number;
  totalRefundedAmount: number;
  refundsLast30Days: number;
  refundsLast7Days: number;
  avgRefundAmount: number;
  chargebackCount: number;
  disputeCount: number;
  lifetimeValue: number;
  accountAge: number;  // days
  kycLevel: number;  // 0-3
}

export interface PaymentContext {
  paymentAge: number;  // days since payment
  paymentMethod: string;
  deviceFingerprint?: string;
  ipAddress?: string;
  geolocation?: string;
  previousRefunds: number;  // refunds on this specific payment
}

/**
 * Main SIRA evaluation function
 * Returns risk score and recommended action
 */
export async function callSiraRefundEval(input: SiraRefundInput): Promise<SiraRefundDecision> {
  const startTime = Date.now();

  // Gather context
  const userHistory = await getUserRefundHistory(input.userId);
  const paymentContext = await getPaymentContext(input.paymentId);
  const merchantConfig = await getMerchantConfig(input.merchantId);

  // Calculate risk score based on multiple factors
  let riskScore = 0;
  const reasons: string[] = [];

  // Factor 1: User refund velocity (30%)
  const velocityRisk = calculateVelocityRisk(userHistory);
  riskScore += velocityRisk * 0.3;
  if (velocityRisk > 0.5) {
    reasons.push(`High refund velocity: ${userHistory.refundsLast30Days} refunds in 30 days`);
  }

  // Factor 2: Payment age (20%)
  const ageRisk = calculatePaymentAgeRisk(paymentContext.paymentAge, merchantConfig.refundWindowDays);
  riskScore += ageRisk * 0.2;
  if (ageRisk > 0.7) {
    reasons.push(`Payment older than typical refund window (${paymentContext.paymentAge} days)`);
  }

  // Factor 3: Amount relative to original payment (15%)
  const amountRisk = calculateAmountRisk(input.requestedAmount, input.originalAmount);
  riskScore += amountRisk * 0.15;
  if (amountRisk > 0.5 && input.requestedAmount !== input.originalAmount) {
    reasons.push(`Unusual partial refund amount: ${((input.requestedAmount / input.originalAmount) * 100).toFixed(0)}%`);
  }

  // Factor 4: User lifetime value vs refund amount (15%)
  const valuRisk = calculateValueRisk(input.requestedAmount, userHistory.lifetimeValue);
  riskScore += valueRisk * 0.15;
  if (valuRisk > 0.6) {
    reasons.push('Refund amount disproportionate to user lifetime value');
  }

  // Factor 5: Chargeback/dispute history (10%)
  const chargebackRisk = calculateChargebackRisk(userHistory);
  riskScore += chargebackRisk * 0.1;
  if (chargebackRisk > 0.5) {
    reasons.push(`User has ${userHistory.chargebackCount} previous chargebacks`);
  }

  // Factor 6: KYC level (5%)
  const kycRisk = calculateKycRisk(userHistory.kycLevel, input.requestedAmount);
  riskScore += kycRisk * 0.05;
  if (kycRisk > 0.7) {
    reasons.push('Low KYC level for refund amount');
  }

  // Factor 7: Previous refunds on this payment (5%)
  if (paymentContext.previousRefunds > 0) {
    riskScore += 0.05;
    reasons.push(`Payment has ${paymentContext.previousRefunds} previous refund attempts`);
  }

  // Cap score at 1.0
  riskScore = Math.min(riskScore, 1.0);

  // Determine action based on score and thresholds
  let action: 'auto_approve' | 'manual_review' | 'auto_reject' = 'manual_review';
  let requireKyc = false;
  let requireMultiSig = false;

  // Check merchant config thresholds
  if (riskScore < merchantConfig.siraAutoApproveThreshold &&
      input.requestedAmount <= merchantConfig.autoRefundLimit &&
      paymentContext.paymentAge <= merchantConfig.refundWindowDays) {
    action = 'auto_approve';
    reasons.push('Low risk score, within merchant auto-refund policy');
  } else if (riskScore > 0.85) {
    action = 'auto_reject';
    reasons.push('Very high risk score - automatic rejection');
  } else {
    action = 'manual_review';
    reasons.push('Medium risk - requires manual review');
  }

  // KYC requirement
  if (input.requestedAmount > merchantConfig.requireKycAboveAmount && userHistory.kycLevel < 2) {
    requireKyc = true;
    if (action === 'auto_approve') {
      action = 'manual_review';  // Downgrade to manual review
    }
    reasons.push('KYC verification required for this amount');
  }

  // Multi-sig requirement
  if (input.requestedAmount > merchantConfig.multiSigRequiredAbove) {
    requireMultiSig = true;
    if (action === 'auto_approve') {
      action = 'manual_review';
    }
    reasons.push('Multi-signature approval required for high value');
  }

  // Calculate confidence based on data quality
  const confidence = calculateConfidence(userHistory, paymentContext);

  const latency = Date.now() - startTime;
  console.log(`[SIRA] Refund evaluation completed in ${latency}ms. Score: ${riskScore.toFixed(4)}, Action: ${action}`);

  return {
    action,
    score: parseFloat(riskScore.toFixed(4)),
    confidence: parseFloat(confidence.toFixed(4)),
    reasons,
    requireKyc,
    requireMultiSig,
    modelVersion: 'sira-refund-v1.0-industrial'
  };
}

/**
 * Get user refund history
 */
async function getUserRefundHistory(userId: string): Promise<UserRefundHistory> {
  const result = await pool.query(
    `SELECT
      COUNT(*) as total_refunds,
      COALESCE(SUM(requested_amount), 0) as total_refunded_amount,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as refunds_last_30d,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as refunds_last_7d,
      COALESCE(AVG(requested_amount), 0) as avg_refund_amount
    FROM refund_requests
    WHERE requester_user_id = $1 AND status IN ('refunded', 'approved', 'auto_approved')`,
    [userId]
  );

  const row = result.rows[0];

  // Mock chargeback data (would come from payment processor API in production)
  const chargebackCount = 0;
  const disputeCount = 0;
  const lifetimeValue = 5000;  // Mock: would come from user analytics
  const accountAge = 365;  // Mock: would come from user table
  const kycLevel = 1;  // Mock: would come from KYC service

  return {
    totalRefunds: parseInt(row.total_refunds),
    totalRefundedAmount: parseFloat(row.total_refunded_amount),
    refundsLast30Days: parseInt(row.refunds_last_30d),
    refundsLast7Days: parseInt(row.refunds_last_7d),
    avgRefundAmount: parseFloat(row.avg_refund_amount),
    chargebackCount,
    disputeCount,
    lifetimeValue,
    accountAge,
    kycLevel
  };
}

/**
 * Get payment context
 */
async function getPaymentContext(paymentId: string): Promise<PaymentContext> {
  // Mock payment data (would come from payments table in production)
  const paymentAge = 5;  // days
  const paymentMethod = 'card';

  // Count previous refunds on this payment
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM refund_requests WHERE payment_id = $1',
    [paymentId]
  );

  return {
    paymentAge,
    paymentMethod,
    previousRefunds: parseInt(result.rows[0]?.count || 0)
  };
}

/**
 * Get merchant refund configuration
 */
async function getMerchantConfig(merchantId: string) {
  const result = await pool.query(
    `SELECT * FROM merchant_refund_config WHERE merchant_id = $1`,
    [merchantId]
  );

  if (result.rows.length === 0) {
    // Return defaults if no config found
    return {
      autoRefundLimit: 500,
      refundWindowDays: 30,
      siraAutoApproveThreshold: 0.3,
      requireKycAboveAmount: 5000,
      multiSigRequiredAbove: 10000
    };
  }

  const config = result.rows[0];
  return {
    autoRefundLimit: parseFloat(config.auto_refund_limit),
    refundWindowDays: config.refund_window_days,
    siraAutoApproveThreshold: parseFloat(config.sira_auto_approve_threshold),
    requireKycAboveAmount: parseFloat(config.require_kyc_above_amount),
    multiSigRequiredAbove: parseFloat(config.multi_sig_required_above)
  };
}

/**
 * Risk calculation functions
 */

function calculateVelocityRisk(history: UserRefundHistory): number {
  // High velocity = high risk
  if (history.refundsLast7Days >= 3) return 1.0;
  if (history.refundsLast7Days >= 2) return 0.7;
  if (history.refundsLast30Days >= 5) return 0.6;
  if (history.refundsLast30Days >= 3) return 0.4;
  return 0.1;
}

function calculatePaymentAgeRisk(paymentAge: number, refundWindow: number): number {
  // Outside refund window = high risk
  if (paymentAge > refundWindow * 2) return 1.0;
  if (paymentAge > refundWindow * 1.5) return 0.8;
  if (paymentAge > refundWindow) return 0.6;
  if (paymentAge < 1) return 0.3;  // Immediate refund = slight risk
  return 0.1;
}

function calculateAmountRisk(requested: number, original: number): number {
  if (requested > original) return 1.0;  // Requesting more than paid = very risky

  const ratio = requested / original;
  if (ratio === 1.0) return 0.0;  // Full refund = normal
  if (ratio > 0.9) return 0.1;
  if (ratio > 0.7) return 0.2;
  if (ratio > 0.5) return 0.3;
  if (ratio > 0.3) return 0.4;
  return 0.5;  // Very small partial refunds are unusual
}

function calculateValueRisk(refundAmount: number, lifetimeValue: number): number {
  if (lifetimeValue === 0) return 0.8;  // No purchase history = high risk

  const ratio = refundAmount / lifetimeValue;
  if (ratio > 0.5) return 0.9;  // Refunding >50% of LTV = very risky
  if (ratio > 0.3) return 0.7;
  if (ratio > 0.1) return 0.4;
  return 0.1;
}

function calculateChargebackRisk(history: UserRefundHistory): number {
  if (history.chargebackCount >= 3) return 1.0;
  if (history.chargebackCount >= 2) return 0.8;
  if (history.chargebackCount >= 1) return 0.5;
  if (history.disputeCount >= 2) return 0.4;
  return 0.0;
}

function calculateKycRisk(kycLevel: number, amount: number): number {
  if (amount > 10000 && kycLevel < 3) return 1.0;
  if (amount > 5000 && kycLevel < 2) return 0.8;
  if (amount > 1000 && kycLevel < 1) return 0.6;
  return 0.0;
}

function calculateConfidence(history: UserRefundHistory, context: PaymentContext): number {
  let confidence = 0.5;  // Base confidence

  // More transaction history = higher confidence
  if (history.totalRefunds > 20) confidence += 0.2;
  else if (history.totalRefunds > 10) confidence += 0.15;
  else if (history.totalRefunds > 5) confidence += 0.1;

  // Longer account age = higher confidence
  if (history.accountAge > 365) confidence += 0.1;
  else if (history.accountAge > 90) confidence += 0.05;

  // Known payment method = higher confidence
  if (context.paymentMethod) confidence += 0.1;

  return Math.min(confidence, 1.0);
}

/**
 * Record SIRA feedback for ML training
 */
export async function recordSiraFeedback(
  refundId: string,
  paymentId: string,
  userId: string,
  features: any,
  prediction: SiraRefundDecision,
  actualOutcome: string
): Promise<void> {
  await pool.query(
    `INSERT INTO refund_sira_feedback
     (refund_id, payment_id, user_id, features, prediction, actual_outcome, outcome_at, model_version)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
    [
      refundId,
      paymentId,
      userId,
      JSON.stringify(features),
      JSON.stringify(prediction),
      actualOutcome,
      prediction.modelVersion
    ]
  );
}
