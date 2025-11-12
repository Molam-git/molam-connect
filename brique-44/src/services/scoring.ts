/**
 * Brique 44 - Anti-fraude
 * Transaction Scoring Service
 *
 * Aggregates signals from multiple sources and produces final fraud score
 */

import { pool } from "../utils/db";
import { callSira, SiraContext } from "./sira";

export interface ScoringContext {
  txnId: string;
  userId: string;
  merchantId?: string;
  amount: number;
  currency: string;
  country: string;
  ip: string;
  device?: any;
  payment_method?: any;
  metadata?: any;
}

export interface ScoringResult {
  decision: "allow" | "review" | "block";
  score: number;
  sira_score: number;
  confidence: number;
  reasons: string[];
  signals: Array<{
    source: string;
    type: string;
    value: any;
    contribution: number;
  }>;
}

/**
 * Main scoring function - aggregates all signals
 */
export async function scoreTransaction(ctx: ScoringContext): Promise<ScoringResult> {
  let baseScore = 0;
  const reasons: string[] = [];
  const signals: Array<{ source: string; type: string; value: any; contribution: number }> = [];

  // 1. Amount-based risk
  const amountRisk = evaluateAmountRisk(ctx.amount, ctx.currency);
  if (amountRisk.score > 0) {
    baseScore += amountRisk.score;
    reasons.push(...amountRisk.reasons);
    signals.push({
      source: "connect",
      type: "amount",
      value: ctx.amount,
      contribution: amountRisk.score,
    });
  }

  // 2. IP/Network risk
  const ipRisk = await evaluateIPRisk(ctx.ip);
  if (ipRisk.score > 0) {
    baseScore += ipRisk.score;
    reasons.push(...ipRisk.reasons);
    signals.push({
      source: "network",
      type: "ip",
      value: ctx.ip,
      contribution: ipRisk.score,
    });
  }

  // 3. Velocity check (user/merchant)
  const velocityRisk = await evaluateVelocity(ctx.userId, ctx.merchantId);
  if (velocityRisk.score > 0) {
    baseScore += velocityRisk.score;
    reasons.push(...velocityRisk.reasons);
    signals.push({
      source: "connect",
      type: "velocity",
      value: velocityRisk.details,
      contribution: velocityRisk.score,
    });
  }

  // 4. Blacklist check
  const blacklistRisk = await checkBlacklist(ctx);
  if (blacklistRisk.score > 0) {
    baseScore += blacklistRisk.score;
    reasons.push(...blacklistRisk.reasons);
    signals.push({
      source: "connect",
      type: "blacklist",
      value: blacklistRisk.details,
      contribution: blacklistRisk.score,
    });
  }

  // 5. Call SIRA for AI enrichment
  const siraContext: SiraContext = {
    txnId: ctx.txnId,
    userId: ctx.userId,
    merchantId: ctx.merchantId,
    amount: ctx.amount,
    currency: ctx.currency,
    country: ctx.country,
    ip: ctx.ip,
    device: ctx.device,
    payment_method: ctx.payment_method,
  };

  const siraResult = await callSira(siraContext);

  // Aggregate SIRA signals
  siraResult.signals.forEach((sig) => {
    signals.push({
      source: "sira",
      type: sig.type,
      value: sig.value,
      contribution: sig.contribution,
    });
  });

  reasons.push(...siraResult.reasons);

  // 6. Combine scores (weighted average)
  const finalScore = Math.round((baseScore * 0.4 + siraResult.score * 0.6));
  const clampedScore = Math.max(0, Math.min(100, finalScore));

  // 7. Determine decision based on thresholds
  let decision: "allow" | "review" | "block" = "allow";
  if (clampedScore >= 80) {
    decision = "block";
  } else if (clampedScore >= 60) {
    decision = "review";
  }

  // 8. Store signals in database
  for (const signal of signals) {
    await pool.query(
      `INSERT INTO fraud_signals (txn_id, user_id, merchant_id, source, signal_type, signal_value, risk_contribution)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ctx.txnId, ctx.userId, ctx.merchantId, signal.source, signal.type, signal.value, signal.contribution]
    );
  }

  return {
    decision,
    score: clampedScore,
    sira_score: siraResult.score,
    confidence: siraResult.confidence,
    reasons,
    signals,
  };
}

/**
 * Evaluate amount-based risk
 */
function evaluateAmountRisk(
  amount: number,
  currency: string
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // High amount threshold (adjust by currency)
  const thresholds: Record<string, number> = {
    USD: 5000,
    EUR: 4500,
    XOF: 2500000, // West African CFA
    KES: 500000, // Kenyan Shilling
  };

  const threshold = thresholds[currency] || 5000;

  if (amount > threshold) {
    score += 20;
    reasons.push("high_amount");
  }

  // Very high amount
  if (amount > threshold * 3) {
    score += 20;
    reasons.push("very_high_amount");
  }

  return { score, reasons };
}

/**
 * Evaluate IP/network risk
 */
async function evaluateIPRisk(ip: string): Promise<{ score: number; reasons: string[] }> {
  const reasons: string[] = [];
  let score = 0;

  // Check if IP is in blacklist
  const { rows } = await pool.query(
    `SELECT * FROM fraud_blacklist WHERE list_type = 'ip' AND value = $1 AND (expires_at IS NULL OR expires_at > now())`,
    [ip]
  );

  if (rows.length > 0) {
    score += 50;
    reasons.push("blacklisted_ip");
  }

  // Check for private/suspicious IPs
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    score += 15;
    reasons.push("private_ip");
  }

  return { score, reasons };
}

/**
 * Evaluate transaction velocity (too many transactions in short time)
 */
async function evaluateVelocity(
  userId: string,
  merchantId?: string
): Promise<{ score: number; reasons: string[]; details?: any }> {
  const reasons: string[] = [];
  let score = 0;

  // Check user velocity (last hour)
  const { rows: userRows } = await pool.query(
    `SELECT COUNT(*)::int as count FROM fraud_decisions WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
    [userId]
  );

  const userCount = userRows[0]?.count || 0;

  if (userCount > 10) {
    score += 25;
    reasons.push("high_user_velocity");
  } else if (userCount > 5) {
    score += 10;
    reasons.push("moderate_user_velocity");
  }

  // Check merchant velocity if applicable
  if (merchantId) {
    const { rows: merchantRows } = await pool.query(
      `SELECT COUNT(*)::int as count FROM fraud_decisions WHERE merchant_id = $1 AND created_at > now() - interval '1 hour'`,
      [merchantId]
    );

    const merchantCount = merchantRows[0]?.count || 0;

    if (merchantCount > 100) {
      score += 15;
      reasons.push("high_merchant_velocity");
    }
  }

  return { score, reasons, details: { userCount, merchantCount: merchantId ? userCount : 0 } };
}

/**
 * Check blacklists (IP, card BIN, email, device)
 */
async function checkBlacklist(ctx: ScoringContext): Promise<{ score: number; reasons: string[]; details?: any }> {
  const reasons: string[] = [];
  let score = 0;
  const details: any = {};

  // Check user blacklist
  const { rows: userRows } = await pool.query(
    `SELECT * FROM fraud_blacklist WHERE list_type = 'user' AND value = $1 AND (expires_at IS NULL OR expires_at > now())`,
    [ctx.userId]
  );

  if (userRows.length > 0) {
    score += 100; // Instant block
    reasons.push("blacklisted_user");
    details.user_blacklist = userRows[0];
  }

  // Check device fingerprint if available
  if (ctx.device?.fingerprint) {
    const { rows: deviceRows } = await pool.query(
      `SELECT * FROM fraud_blacklist WHERE list_type = 'device' AND value = $1 AND (expires_at IS NULL OR expires_at > now())`,
      [ctx.device.fingerprint]
    );

    if (deviceRows.length > 0) {
      score += 50;
      reasons.push("blacklisted_device");
      details.device_blacklist = deviceRows[0];
    }
  }

  // Check card BIN if card payment
  if (ctx.payment_method?.type === "card" && ctx.payment_method?.last4) {
    const bin = ctx.payment_method.last4.substring(0, 6);
    const { rows: binRows } = await pool.query(
      `SELECT * FROM fraud_blacklist WHERE list_type = 'card_bin' AND value = $1 AND (expires_at IS NULL OR expires_at > now())`,
      [bin]
    );

    if (binRows.length > 0) {
      score += 40;
      reasons.push("blacklisted_card_bin");
      details.card_bin_blacklist = binRows[0];
    }
  }

  return { score, reasons, details };
}
