import { pool } from '../db/pool';
import { applyPromoCode, validatePromoCode } from './applyPromo';
import { checkPromoCodeFraud, reportFraudEvent } from './siraIntegration';
import { PromoCodeApplicationResult } from '../types/marketing';

/**
 * Apply promo code with fraud detection
 */
export async function applyPromoCodeWithFraudCheck(
  code: string,
  amount: number,
  currency: string,
  customerId: string,
  merchantId: string,
  orderId?: string,
  productIds?: string[],
  ipAddress?: string,
  userAgent?: string
): Promise<PromoCodeApplicationResult & { fraud_check?: any }> {
  // Step 1: Validate promo code
  const validation = await validatePromoCode(code, customerId);

  if (!validation.valid || !validation.promo_code) {
    return {
      success: false,
      original_amount: amount,
      discount_amount: 0,
      final_amount: amount,
      currency,
      promo_code: null as any,
      usage_log_id: '',
      error: validation.reason || 'Invalid promo code',
    };
  }

  // Step 2: Fraud check via SIRA
  const fraudCheck = await checkPromoCodeFraud({
    code,
    customer_id: customerId,
    merchant_id: merchantId,
    amount,
    currency,
    ip_address: ipAddress,
    user_agent: userAgent,
    order_id: orderId,
  });

  // Step 3: Block if high risk
  if (fraudCheck.should_block) {
    console.warn('[Fraud] Blocked promo code usage:', {
      code,
      customer_id: customerId,
      risk_score: fraudCheck.risk_score,
      reason: fraudCheck.reason,
    });

    // Log blocked attempt
    await pool.query(
      `INSERT INTO promo_code_usage (
        promo_code_id, customer_id, order_id,
        original_amount, discount_amount, final_amount, currency,
        ip_address, user_agent, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'expired')`,
      [
        validation.promo_code.id,
        customerId,
        orderId,
        amount,
        0,
        amount,
        currency,
        ipAddress,
        `BLOCKED: ${userAgent}`,
      ]
    );

    return {
      success: false,
      original_amount: amount,
      discount_amount: 0,
      final_amount: amount,
      currency,
      promo_code: validation.promo_code,
      usage_log_id: '',
      error: `Promo code usage blocked: ${fraudCheck.reason || 'High fraud risk detected'}`,
      fraud_check: fraudCheck,
    };
  }

  // Step 4: Apply promo code if not blocked
  const result = await applyPromoCode(
    code,
    amount,
    currency,
    customerId,
    orderId,
    productIds,
    ipAddress,
    userAgent
  );

  // Step 5: If high/medium risk, flag for review
  if (fraudCheck.risk_level === 'high' || fraudCheck.risk_level === 'medium') {
    console.info('[Fraud] Flagged promo code usage for review:', {
      code,
      customer_id: customerId,
      usage_log_id: result.usage_log_id,
      risk_score: fraudCheck.risk_score,
      flags: fraudCheck.flags,
    });

    // Mark usage log with fraud flags (extend schema if needed)
    // For now, just log to console
  }

  return {
    ...result,
    fraud_check: fraudCheck,
  };
}

/**
 * Check customer for suspicious promo code activity
 */
export async function checkCustomerPromoActivity(
  customerId: string
): Promise<{
  is_suspicious: boolean;
  usage_count_24h: number;
  unique_codes_24h: number;
  flags: string[];
}> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result = await pool.query(
    `SELECT
      COUNT(*) as usage_count,
      COUNT(DISTINCT promo_code_id) as unique_codes,
      COUNT(*) FILTER (WHERE status = 'applied') as successful_uses,
      COUNT(DISTINCT ip_address) as unique_ips
    FROM promo_code_usage
    WHERE customer_id = $1
    AND created_at >= $2`,
    [customerId, twentyFourHoursAgo]
  );

  const stats = result.rows[0];
  const flags: string[] = [];
  let isSuspicious = false;

  // Check for suspicious patterns
  if (parseInt(stats.usage_count) > 10) {
    flags.push('high_frequency');
    isSuspicious = true;
  }

  if (parseInt(stats.unique_codes) > 5) {
    flags.push('multiple_codes');
    isSuspicious = true;
  }

  if (parseInt(stats.unique_ips) > 3) {
    flags.push('multiple_ips');
    isSuspicious = true;
  }

  return {
    is_suspicious: isSuspicious,
    usage_count_24h: parseInt(stats.usage_count),
    unique_codes_24h: parseInt(stats.unique_codes),
    flags,
  };
}

/**
 * Report confirmed fraud case to SIRA
 */
export async function reportPromoCodeFraud(params: {
  usage_log_id: string;
  customer_id: string;
  reason: string;
  details?: Record<string, any>;
}): Promise<void> {
  // Update usage log status
  await pool.query(
    `UPDATE promo_code_usage
     SET status = 'expired',
         user_agent = CONCAT('FRAUD: ', COALESCE(user_agent, ''), ' - ', $1)
     WHERE id = $2`,
    [params.reason, params.usage_log_id]
  );

  // Report to SIRA
  await reportFraudEvent({
    event_type: 'promo_code_fraud',
    customer_id: params.customer_id,
    is_fraud: true,
    details: {
      usage_log_id: params.usage_log_id,
      reason: params.reason,
      ...params.details,
    },
  });

  console.info('[Fraud] Reported promo code fraud:', params);
}
