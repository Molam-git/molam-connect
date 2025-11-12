/**
 * Brique 48 - Risk Engine
 * Real-time fraud detection and risk scoring
 */

import { pool } from "../utils/db.js";

const SIRA_URL = process.env.SIRA_URL || "http://localhost:8044";
const SIRA_ENABLED = process.env.SIRA_ENABLED === "true";
const ML_SCORE_BLOCK_THRESHOLD = Number(process.env.ML_SCORE_BLOCK_THRESHOLD) || 90;
const ML_SCORE_REVIEW_THRESHOLD = Number(process.env.ML_SCORE_REVIEW_THRESHOLD) || 70;

export interface TransactionInput {
  id: string;
  type: "payment" | "payout" | "refund" | "transfer";
  merchant_id?: string;
  user_id?: string;
  amount: number;
  currency: string;
  country?: string;
  merchant_country?: string;
  payment_method?: string;
  device_id?: string;
  ip_address?: string;
  metadata?: any;
}

export interface RiskDecision {
  decision: "allow" | "review" | "block";
  confidence: number;
  ml_score?: number;
  matched_rules: string[];
  reason: string;
  risk_flags: string[];
  processing_time_ms: number;
}

/**
 * Main evaluation function
 * SLO: p95 < 100ms
 */
export async function evaluateTransaction(tx: TransactionInput): Promise<RiskDecision> {
  const startTime = Date.now();
  const matchedRules: string[] = [];
  const riskFlags: string[] = [];
  let decision: "allow" | "review" | "block" = "allow";
  let reason = "default_allow";
  let confidence = 100;

  try {
    // 1. Load active rules (priority ASC)
    const { rows: rules } = await pool.query(
      `SELECT * FROM risk_rules WHERE status='active' ORDER BY priority ASC`
    );

    // 2. Evaluate rules
    for (const rule of rules) {
      if (await evalExpression(rule.expression, tx)) {
        matchedRules.push(rule.name);
        const action = extractAction(rule.expression);

        if (action === "block") {
          decision = "block";
          reason = rule.name;
          confidence = 95;
          break; // Stop on first block
        } else if (action === "review") {
          decision = "review";
          reason = rule.name;
          confidence = 75;
        }
      }
    }

    // 3. Calculate velocity (if merchant_id available)
    if (tx.merchant_id) {
      const velocity = await calculateVelocity(tx.merchant_id);
      if (velocity.count_1h > 50) {
        riskFlags.push("high_velocity_1h");
        if (decision === "allow") {
          decision = "review";
          reason = "velocity_anomaly";
        }
      }
    }

    // 4. Device fingerprint check
    if (tx.device_id) {
      const deviceRisk = await checkDeviceRisk(tx.device_id);
      if (deviceRisk.is_suspicious) {
        riskFlags.push("suspicious_device");
        if (decision === "allow") {
          decision = "review";
          reason = "suspicious_device";
        }
      }
    }

    // 5. IP geolocation check
    if (tx.ip_address) {
      const ipRisk = await checkIPRisk(tx.ip_address);
      if (ipRisk.is_vpn || ipRisk.is_proxy) {
        riskFlags.push("vpn_or_proxy");
      }
    }

    // 6. ML Scoring (SIRA) - if not already blocked
    let mlScore: number | undefined;
    if (SIRA_ENABLED && decision !== "block") {
      mlScore = await callSIRA(tx);

      if (mlScore >= ML_SCORE_BLOCK_THRESHOLD) {
        decision = "block";
        reason = "ml_high_risk";
        confidence = 98;
      } else if (mlScore >= ML_SCORE_REVIEW_THRESHOLD) {
        if (decision !== "review") {
          decision = "review";
          reason = "ml_medium_risk";
        }
        confidence = 80;
      }
    }

    // 7. Store decision
    const processingTime = Date.now() - startTime;
    await storeDecision(tx, decision, reason, matchedRules, riskFlags, mlScore, confidence, processingTime);

    // 8. Create alert if high risk
    if (decision === "block" || (decision === "review" && mlScore && mlScore > 85)) {
      await createAlert(tx, decision, reason, mlScore);
    }

    return {
      decision,
      confidence,
      ml_score: mlScore,
      matched_rules: matchedRules,
      reason,
      risk_flags: riskFlags,
      processing_time_ms: processingTime,
    };
  } catch (err) {
    console.error("Risk evaluation error:", err);
    // Fail open (allow) on errors to avoid blocking legitimate transactions
    return {
      decision: "allow",
      confidence: 0,
      matched_rules: [],
      reason: "evaluation_error",
      risk_flags: ["error"],
      processing_time_ms: Date.now() - startTime,
    };
  }
}

/**
 * Evaluate DSL expression
 * Production: use safe parser (ANTLR, PEG.js), not eval()
 */
async function evalExpression(expression: string, tx: TransactionInput): Promise<boolean> {
  // Simple implementation - in production, use proper DSL parser
  try {
    // Extract condition from "if(...) then action"
    const match = expression.match(/if\((.*?)\)\s*then/);
    if (!match) return false;

    const condition = match[1];

    // Replace transaction fields
    const replaced = condition
      .replace(/amount/g, String(tx.amount))
      .replace(/country/g, `"${tx.country || ""}"`)
      .replace(/merchant_country/g, `"${tx.merchant_country || ""}"`)
      .replace(/currency/g, `"${tx.currency}"`)
      .replace(/payment_method/g, `"${tx.payment_method || ""}"`);

    // Safe evaluation (very basic - DO NOT USE IN PRODUCTION)
    // Production: use proper DSL parser with whitelist of allowed operations
    const result = safeEval(replaced);
    return Boolean(result);
  } catch (err) {
    console.error("Expression evaluation error:", err);
    return false;
  }
}

/**
 * Safe eval (simplified - production needs proper DSL)
 */
function safeEval(expr: string): any {
  // Remove dangerous patterns
  if (/[;{}()[\]]/.test(expr.replace(/&&|\|\||!=/g, ""))) {
    throw new Error("Invalid expression");
  }

  // Basic comparisons only
  if (expr.includes(">")) {
    const [left, right] = expr.split(">");
    return Number(left.trim()) > Number(right.trim());
  }
  if (expr.includes("!=")) {
    const [left, right] = expr.split("!=");
    return left.trim() !== right.trim();
  }

  return false;
}

/**
 * Extract action from expression
 */
function extractAction(expression: string): "allow" | "review" | "block" {
  if (expression.includes("then block")) return "block";
  if (expression.includes("then review")) return "review";
  return "allow";
}

/**
 * Calculate transaction velocity for a merchant
 */
async function calculateVelocity(merchantId: string): Promise<{ count_1h: number; count_24h: number }> {
  const { rows: [result] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE created_at >= now() - interval '1 hour') as count_1h,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours') as count_24h
     FROM risk_decisions
     WHERE merchant_id = $1`,
    [merchantId]
  );

  return result || { count_1h: 0, count_24h: 0 };
}

/**
 * Check device risk
 */
async function checkDeviceRisk(deviceId: string): Promise<{ is_suspicious: boolean; risk_score: number }> {
  const { rows: [device] } = await pool.query(
    `SELECT is_suspicious, risk_score FROM device_fingerprints WHERE device_id = $1`,
    [deviceId]
  );

  if (!device) {
    // Create new device record
    await pool.query(
      `INSERT INTO device_fingerprints(device_id, transaction_count, first_seen, last_seen)
       VALUES ($1, 1, now(), now())`,
      [deviceId]
    );
    return { is_suspicious: false, risk_score: 0 };
  }

  // Update device
  await pool.query(
    `UPDATE device_fingerprints SET transaction_count = transaction_count + 1, last_seen = now() WHERE device_id = $1`,
    [deviceId]
  );

  return { is_suspicious: device.is_suspicious || false, risk_score: device.risk_score || 0 };
}

/**
 * Check IP risk
 */
async function checkIPRisk(ipAddress: string): Promise<{ is_vpn: boolean; is_proxy: boolean; country_code?: string }> {
  const { rows: [cached] } = await pool.query(
    `SELECT * FROM ip_geolocation_cache WHERE ip_address = $1 AND cached_at > now() - interval '7 days'`,
    [ipAddress]
  );

  if (cached) {
    return { is_vpn: cached.is_vpn, is_proxy: cached.is_proxy, country_code: cached.country_code };
  }

  // In production: call IP geolocation API
  // For now, cache as low risk
  await pool.query(
    `INSERT INTO ip_geolocation_cache(ip_address, is_vpn, is_proxy, cached_at)
     VALUES ($1, false, false, now())
     ON CONFLICT (ip_address) DO UPDATE SET cached_at = now()`,
    [ipAddress]
  );

  return { is_vpn: false, is_proxy: false };
}

/**
 * Call SIRA ML model
 */
async function callSIRA(tx: TransactionInput): Promise<number> {
  try {
    const response = await fetch(`${SIRA_URL}/score_tx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tx),
    });

    if (!response.ok) {
      throw new Error(`SIRA error: ${response.status}`);
    }

    const data: any = await response.json();
    return data.score || 50; // Default medium risk
  } catch (err) {
    console.error("SIRA call error:", err);
    return 50; // Default medium risk on error
  }
}

/**
 * Store decision in database
 */
async function storeDecision(
  tx: TransactionInput,
  decision: string,
  reason: string,
  matchedRules: string[],
  riskFlags: string[],
  mlScore: number | undefined,
  confidence: number,
  processingTime: number
): Promise<void> {
  const velocity = tx.merchant_id ? await calculateVelocity(tx.merchant_id) : { count_1h: 0, count_24h: 0 };

  await pool.query(
    `INSERT INTO risk_decisions(
      transaction_id, transaction_type, merchant_id, user_id,
      amount, currency, country, payment_method, device_id, ip_address,
      decision, confidence, matched_rules, reason,
      ml_score, velocity_1h, velocity_24h, risk_flags,
      metadata, processing_time_ms, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now())`,
    [
      tx.id,
      tx.type,
      tx.merchant_id,
      tx.user_id,
      tx.amount,
      tx.currency,
      tx.country,
      tx.payment_method,
      tx.device_id,
      tx.ip_address,
      decision,
      confidence,
      matchedRules,
      reason,
      mlScore,
      velocity.count_1h,
      velocity.count_24h,
      riskFlags,
      tx.metadata || {},
      processingTime,
    ]
  );

  // Update merchant risk profile
  if (tx.merchant_id) {
    await updateMerchantRiskProfile(tx.merchant_id, decision, mlScore);
  }
}

/**
 * Update merchant risk profile
 */
async function updateMerchantRiskProfile(merchantId: string, decision: string, mlScore?: number): Promise<void> {
  await pool.query(
    `INSERT INTO merchant_risk_profiles(merchant_id, total_transactions, blocked_count, reviewed_count, avg_ml_score, last_updated)
     VALUES ($1, 1, $2, $3, $4, now())
     ON CONFLICT (merchant_id) DO UPDATE SET
       total_transactions = merchant_risk_profiles.total_transactions + 1,
       blocked_count = merchant_risk_profiles.blocked_count + $2,
       reviewed_count = merchant_risk_profiles.reviewed_count + $3,
       avg_ml_score = (merchant_risk_profiles.avg_ml_score * merchant_risk_profiles.total_transactions + $4) / (merchant_risk_profiles.total_transactions + 1),
       last_updated = now()`,
    [merchantId, decision === "block" ? 1 : 0, decision === "review" ? 1 : 0, mlScore || 50]
  );
}

/**
 * Create high-priority alert
 */
async function createAlert(tx: TransactionInput, decision: string, reason: string, mlScore?: number): Promise<void> {
  const severity = decision === "block" ? "critical" : mlScore && mlScore > 90 ? "high" : "medium";
  const category = reason.includes("velocity") ? "velocity" : reason.includes("amount") ? "amount" : "pattern";

  const message = `${decision.toUpperCase()}: ${reason} - Tx: ${tx.id}, Amount: ${tx.amount} ${tx.currency}, ML Score: ${mlScore || "N/A"}`;

  await pool.query(
    `INSERT INTO risk_alerts(decision_id, severity, category, message, status, created_at)
     SELECT $1, $2, $3, $4, 'open', now()
     FROM risk_decisions WHERE transaction_id = $5`,
    [null, severity, category, message, tx.id]
  );
}
