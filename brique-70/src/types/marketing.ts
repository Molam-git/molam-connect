// Marketing Campaign Types
export interface MarketingCampaign {
  id: string;
  merchant_id: string;
  name: string;
  description?: string;
  type: 'promo_code' | 'coupon' | 'subscription_plan';
  status: 'active' | 'paused' | 'expired' | 'archived';
  min_purchase_amount?: number;
  max_discount_amount?: number;
  applicable_products?: string[];
  applicable_categories?: string[];
  excluded_products?: string[];
  total_usage_limit?: number;
  total_usage_count: number;
  per_user_limit?: number;
  starts_at: Date;
  ends_at?: Date;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

// Promo Code Types
export interface PromoCode {
  id: string;
  campaign_id: string;
  code: string;
  discount_type: 'percentage' | 'fixed' | 'free_shipping';
  discount_value: number;
  currency?: string;
  usage_limit?: number;
  used_count: number;
  per_user_limit?: number;
  valid_from: Date;
  valid_to?: Date;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PromoCodeUsage {
  id: string;
  promo_code_id: string;
  customer_id: string;
  order_id?: string;
  original_amount: number;
  discount_amount: number;
  final_amount: number;
  currency: string;
  ip_address?: string;
  user_agent?: string;
  status: 'applied' | 'refunded' | 'expired';
  created_at: Date;
}

// Coupon Types
export interface Coupon {
  id: string;
  campaign_id: string;
  name: string;
  code?: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  currency?: string;
  duration: 'once' | 'repeating' | 'forever';
  duration_months?: number;
  applies_to: 'all' | 'specific_products' | 'specific_plans';
  product_ids?: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Subscription Types
export interface SubscriptionPlan {
  id: string;
  campaign_id?: string;
  merchant_id: string;
  name: string;
  description?: string;
  product_id?: string;
  amount: number;
  currency: string;
  interval: 'day' | 'week' | 'month' | 'year';
  interval_count: number;
  trial_period_days: number;
  features?: Record<string, any>;
  metadata?: Record<string, any>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Subscription {
  id: string;
  plan_id: string;
  customer_id: string;
  merchant_id: string;
  status: 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'unpaid';
  current_period_start: Date;
  current_period_end: Date;
  trial_start?: Date;
  trial_end?: Date;
  cancel_at_period_end: boolean;
  canceled_at?: Date;
  cancellation_reason?: string;
  latest_invoice_id?: string;
  default_payment_method_id?: string;
  coupon_id?: string;
  discount_end_at?: Date;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionInvoice {
  id: string;
  subscription_id: string;
  customer_id: string;
  amount: number;
  currency: string;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  period_start: Date;
  period_end: Date;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  payment_intent_id?: string;
  paid_at?: Date;
  attempt_count: number;
  next_attempt_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// Application Result Types
export interface PromoCodeValidationResult {
  valid: boolean;
  reason?: string;
  promo_code?: PromoCode;
  campaign?: MarketingCampaign;
}

export interface PromoCodeApplicationResult {
  success: boolean;
  original_amount: number;
  discount_amount: number;
  final_amount: number;
  currency: string;
  promo_code: PromoCode;
  usage_log_id: string;
  free_shipping?: boolean;
  error?: string;
}
