// ============================================================================
// Types for Brique 64 — Split Payments Engine
// ============================================================================

export type SplitRuleType = 'percentage' | 'fixed' | 'tiered' | 'hierarchical';
export type SplitStatus = 'pending' | 'processing' | 'settled' | 'failed' | 'reversed';
export type SettlementStatus = 'scheduled' | 'processing' | 'completed' | 'partial' | 'failed' | 'cancelled';
export type RecipientType = 'platform' | 'seller' | 'partner' | 'tax_authority' | 'other';

// ============================================================================
// Split Rule
// ============================================================================

export interface PercentageRuleConfig {
  platform?: number;
  seller?: number;
  partner?: number;
  tax?: number;
  [key: string]: number | undefined;
}

export interface FixedRuleConfig {
  platform_fee?: number;
  seller_fee?: number;
  [key: string]: number | undefined;
}

export interface TieredRuleConfigItem {
  min_amount: number;
  max_amount: number | null;
  platform: number;
  seller: number;
  partner?: number;
}

export interface HierarchicalRuleConfigItem {
  order: number;
  recipient_type: RecipientType;
  percentage?: number;
  fixed_amount?: number;
  from_remaining?: boolean;
}

export type RuleConfig =
  | PercentageRuleConfig
  | FixedRuleConfig
  | TieredRuleConfigItem[]
  | HierarchicalRuleConfigItem[];

export interface SplitRule {
  id: string;
  platform_id: string;
  merchant_id?: string;
  rule_name: string;
  rule_type: SplitRuleType;
  rule_config: RuleConfig;
  max_recipients: number;
  min_split_amount: number;
  tax_handling: 'included' | 'excluded' | 'added';
  allowed_currencies: string[];
  allowed_countries: string[];
  status: 'active' | 'inactive' | 'archived';
  created_by: string;
  created_at: Date;
  updated_at: Date;
  metadata: Record<string, any>;
}

export interface CreateSplitRuleInput {
  platform_id: string;
  merchant_id?: string;
  rule_name: string;
  rule_type: SplitRuleType;
  rule_config: RuleConfig;
  max_recipients?: number;
  min_split_amount?: number;
  tax_handling?: 'included' | 'excluded' | 'added';
  allowed_currencies?: string[];
  allowed_countries?: string[];
  created_by: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Payment Split
// ============================================================================

export interface CalculationBasis {
  type: SplitRuleType;
  rate?: number;
  fixed_amount?: number;
  base_amount: number;
  tier_applied?: string;
  hierarchy_order?: number;
}

export interface PaymentSplit {
  id: string;
  payment_id: string;
  split_rule_id: string;
  platform_id: string;
  merchant_id: string;
  customer_id?: string;
  recipient_id: string;
  recipient_type: RecipientType;
  recipient_account_id?: string;
  total_payment_amount: number;
  split_amount: number;
  currency: string;
  calculation_basis: CalculationBasis;
  status: SplitStatus;
  settlement_id?: string;
  settled_at?: Date;
  failure_reason?: string;
  retry_count: number;
  next_retry_at?: Date;
  risk_score?: number;
  risk_flags: string[];
  created_at: Date;
  updated_at: Date;
  metadata: Record<string, any>;
}

export interface CreatePaymentSplitInput {
  payment_id: string;
  split_rule_id: string;
  platform_id: string;
  merchant_id: string;
  customer_id?: string;
  recipient_id: string;
  recipient_type: RecipientType;
  recipient_account_id?: string;
  total_payment_amount: number;
  split_amount: number;
  currency: string;
  calculation_basis: CalculationBasis;
  metadata?: Record<string, any>;
}

// ============================================================================
// Split Settlement
// ============================================================================

export interface FailureSummaryItem {
  split_id: string;
  reason: string;
}

export interface SplitSettlement {
  id: string;
  settlement_batch_id: string;
  platform_id: string;
  recipient_id: string;
  recipient_type: RecipientType;
  total_splits_count: number;
  total_amount: number;
  currency: string;
  settlement_period_start: Date;
  settlement_period_end: Date;
  scheduled_at: Date;
  status: SettlementStatus;
  executed_at?: Date;
  completed_at?: Date;
  payout_id?: string;
  payout_method?: 'wallet' | 'bank_transfer' | 'check';
  payout_reference?: string;
  failed_splits_count: number;
  failure_summary: FailureSummaryItem[];
  risk_score?: number;
  risk_flags: string[];
  requires_manual_review: boolean;
  reviewed_by?: string;
  reviewed_at?: Date;
  created_at: Date;
  updated_at: Date;
  metadata: Record<string, any>;
}

export interface CreateSettlementInput {
  platform_id: string;
  recipient_id: string;
  recipient_type: RecipientType;
  settlement_period_start: Date;
  settlement_period_end: Date;
  scheduled_at: Date;
  currency?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Split Calculation
// ============================================================================

export interface SplitRecipient {
  recipient_id: string;
  recipient_type: RecipientType;
  recipient_account_id?: string;
  amount: number;
  calculation_basis: CalculationBasis;
}

export interface SplitCalculationResult {
  payment_id: string;
  total_amount: number;
  currency: string;
  recipients: SplitRecipient[];
  split_rule_id: string;
  platform_id: string;
  merchant_id: string;
}

export interface CalculateSplitsInput {
  payment_id: string;
  platform_id: string;
  merchant_id: string;
  total_amount: number;
  currency: string;
  recipient_mapping: Record<RecipientType, string>; // Maps recipient_type to actual recipient_id
}
