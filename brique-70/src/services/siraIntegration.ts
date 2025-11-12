import axios from 'axios';
import { config } from '../config';

interface SiraFraudCheckRequest {
  event_type: 'promo_code_usage' | 'subscription_signup' | 'payment_attempt';
  customer_id: string;
  merchant_id?: string;
  amount?: number;
  currency?: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
}

interface SiraFraudCheckResponse {
  risk_score: number; // 0-100
  risk_level: 'low' | 'medium' | 'high';
  flags: string[];
  recommendations: string[];
  should_block: boolean;
  reason?: string;
}

/**
 * Check for fraud using SIRA
 */
export async function checkFraud(
  request: SiraFraudCheckRequest
): Promise<SiraFraudCheckResponse> {
  if (!config.sira.enabled) {
    // SIRA disabled, return safe default
    return {
      risk_score: 0,
      risk_level: 'low',
      flags: [],
      recommendations: [],
      should_block: false,
    };
  }

  try {
    const response = await axios.post(
      `${config.sira.apiUrl}/api/fraud/check`,
      request,
      {
        timeout: 5000, // 5 second timeout
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('[SIRA] Fraud check failed:', error);

    // On error, fail open (allow transaction but log)
    return {
      risk_score: 0,
      risk_level: 'low',
      flags: ['sira_unavailable'],
      recommendations: ['Manual review recommended - SIRA unavailable'],
      should_block: false,
      reason: 'SIRA service unavailable',
    };
  }
}

/**
 * Report fraud event to SIRA for learning
 */
export async function reportFraudEvent(params: {
  event_type: string;
  customer_id: string;
  is_fraud: boolean;
  details?: Record<string, any>;
}): Promise<void> {
  if (!config.sira.enabled) {
    return;
  }

  try {
    await axios.post(
      `${config.sira.apiUrl}/api/fraud/report`,
      params,
      {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[SIRA] Failed to report fraud event:', error);
    // Don't throw - this is fire and forget
  }
}

/**
 * Check promo code usage for fraud patterns
 */
export async function checkPromoCodeFraud(params: {
  code: string;
  customer_id: string;
  merchant_id: string;
  amount: number;
  currency: string;
  ip_address?: string;
  user_agent?: string;
  order_id?: string;
}): Promise<SiraFraudCheckResponse> {
  const result = await checkFraud({
    event_type: 'promo_code_usage',
    customer_id: params.customer_id,
    merchant_id: params.merchant_id,
    amount: params.amount,
    currency: params.currency,
    ip_address: params.ip_address,
    user_agent: params.user_agent,
    metadata: {
      promo_code: params.code,
      order_id: params.order_id,
    },
  });

  // Log high-risk attempts
  if (result.risk_level === 'high') {
    console.warn('[SIRA] High-risk promo code usage detected:', {
      customer_id: params.customer_id,
      code: params.code,
      risk_score: result.risk_score,
      flags: result.flags,
    });
  }

  return result;
}

/**
 * Check subscription signup for fraud
 */
export async function checkSubscriptionFraud(params: {
  customer_id: string;
  merchant_id: string;
  plan_amount: number;
  currency: string;
  ip_address?: string;
  user_agent?: string;
  payment_method_id?: string;
}): Promise<SiraFraudCheckResponse> {
  const result = await checkFraud({
    event_type: 'subscription_signup',
    customer_id: params.customer_id,
    merchant_id: params.merchant_id,
    amount: params.plan_amount,
    currency: params.currency,
    ip_address: params.ip_address,
    user_agent: params.user_agent,
    metadata: {
      payment_method_id: params.payment_method_id,
    },
  });

  if (result.risk_level === 'high') {
    console.warn('[SIRA] High-risk subscription signup detected:', {
      customer_id: params.customer_id,
      risk_score: result.risk_score,
      flags: result.flags,
    });
  }

  return result;
}

/**
 * Get customer risk profile from SIRA
 */
export async function getCustomerRiskProfile(customerId: string): Promise<{
  risk_score: number;
  risk_level: string;
  total_transactions: number;
  flagged_transactions: number;
  last_flagged_at?: string;
}> {
  if (!config.sira.enabled) {
    return {
      risk_score: 0,
      risk_level: 'low',
      total_transactions: 0,
      flagged_transactions: 0,
    };
  }

  try {
    const response = await axios.get(
      `${config.sira.apiUrl}/api/customers/${customerId}/risk-profile`,
      {
        timeout: 5000,
      }
    );

    return response.data;
  } catch (error) {
    console.error('[SIRA] Failed to get customer risk profile:', error);
    return {
      risk_score: 0,
      risk_level: 'unknown',
      total_transactions: 0,
      flagged_transactions: 0,
    };
  }
}

/**
 * Detect promo code abuse patterns
 */
export async function detectPromoCodeAbuse(params: {
  customer_id: string;
  promo_code_id: string;
  usage_count: number;
  time_window_hours: number;
}): Promise<{
  is_abuse: boolean;
  confidence: number;
  patterns: string[];
}> {
  if (!config.sira.enabled) {
    return {
      is_abuse: false,
      confidence: 0,
      patterns: [],
    };
  }

  try {
    const response = await axios.post(
      `${config.sira.apiUrl}/api/fraud/detect-abuse`,
      params,
      {
        timeout: 5000,
      }
    );

    return response.data;
  } catch (error) {
    console.error('[SIRA] Failed to detect promo code abuse:', error);
    return {
      is_abuse: false,
      confidence: 0,
      patterns: [],
    };
  }
}
