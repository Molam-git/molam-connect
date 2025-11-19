// ============================================================================
// Brique 122 — Statement Reconciliation Types
// ============================================================================

export interface BankStatementLine {
  id: string;
  raw_statement_id?: string;
  bank_profile_id: string;

  // Transaction details
  statement_date: string;
  value_date?: string;
  booking_date?: string;
  amount: number;
  currency: string;
  debit_credit?: 'debit' | 'credit';

  // Description & references
  description?: string;
  reference?: string;
  bank_reference?: string;
  counterparty_name?: string;
  counterparty_account?: string;
  counterparty_bank?: string;
  transaction_code?: string;

  // Reconciliation
  reconciliation_status: ReconciliationStatus;
  matched_payout_slice_id?: string;
  matched_payout_id?: string;
  matched_ledger_entry_id?: string;
  match_confidence?: number;
  match_method?: MatchMethod;
  match_timestamp?: Date;
  matched_by?: string;

  // Anomaly
  anomaly_score?: number;
  anomaly_type?: AnomalyType;
  anomaly_details?: any;
  requires_manual_review: boolean;

  // Duplicate
  duplicate_of?: string;
  is_duplicate: boolean;

  // Metadata
  raw?: any;
  metadata?: Record<string, any>;
  notes?: string;

  created_at: Date;
  updated_at: Date;
  reconciled_at?: Date;
}

export type ReconciliationStatus =
  | 'unmatched'
  | 'matched'
  | 'partial_match'
  | 'duplicate'
  | 'anomaly'
  | 'manual_review'
  | 'ignored'
  | 'error';

export type MatchMethod =
  | 'exact'
  | 'fuzzy'
  | 'probabilistic'
  | 'manual';

export type AnomalyType =
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'duplicate'
  | 'missing_reference'
  | 'unexpected_payment'
  | 'suspicious_pattern';

export interface PayoutSlice {
  id: string;
  parent_payout_id: string;
  treasury_account_id: string;
  slice_amount: number;
  currency: string;
  status: string;
  provider_ref?: string;
  reference_code?: string;
  created_at: Date;
  sent_at?: Date;
}

export interface MatchCandidate {
  slice: PayoutSlice;
  confidence: number;
  match_reasons: string[];
  differences: string[];
}

export interface ReconciliationResult {
  matched: boolean;
  confidence: number;
  method: MatchMethod;
  matched_slice_id?: string;
  candidates: MatchCandidate[];
  anomalies: string[];
  requires_review: boolean;
}

export interface ReconciliationRule {
  id: string;
  bank_profile_id?: string;
  rule_name: string;
  rule_type: 'exact' | 'fuzzy' | 'pattern' | 'ml';
  priority: number;
  conditions: RuleConditions;
  actions: RuleActions;
  enabled: boolean;
}

export interface RuleConditions {
  amount_tolerance?: number;
  require_reference?: boolean;
  currency_match?: boolean;
  date_range_days?: number;
  reference_pattern?: string;
  counterparty_match?: boolean;
}

export interface RuleActions {
  auto_match?: boolean;
  confidence?: number;
  notify_ops?: boolean;
  create_exception?: boolean;
}

export interface ReconciliationException {
  id: string;
  statement_line_id: string;
  exception_type: ExceptionType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  suggested_action?: string;
  suggested_match_id?: string;
  suggested_match_confidence?: number;
  status: 'open' | 'investigating' | 'resolved' | 'ignored';
  assigned_to?: string;
  resolution_notes?: string;
  resolved_at?: Date;
  metadata?: Record<string, any>;
  created_at: Date;
}

export type ExceptionType =
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'duplicate'
  | 'missing_reference'
  | 'multiple_matches'
  | 'no_match'
  | 'anomaly'
  | 'other';

export interface ReconciliationAudit {
  id: string;
  statement_line_id: string;
  action: string;
  previous_status?: string;
  new_status?: string;
  previous_matched_slice_id?: string;
  new_matched_slice_id?: string;
  match_confidence?: number;
  match_method?: string;
  reason?: string;
  performed_by?: string;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface ReconciliationMetrics {
  id: string;
  bank_profile_id: string;
  metric_date: string;

  // Volume
  total_lines_ingested: number;
  total_lines_matched: number;
  total_lines_unmatched: number;
  total_lines_anomaly: number;
  total_lines_duplicate: number;

  // Amount
  total_amount_matched: number;
  total_amount_unmatched: number;

  // Performance
  avg_reconciliation_time_ms?: number;
  avg_match_confidence?: number;

  // Match methods
  matches_exact: number;
  matches_fuzzy: number;
  matches_probabilistic: number;
  matches_manual: number;

  // Anomalies
  anomalies_amount: number;
  anomalies_currency: number;
  anomalies_duplicate: number;
  anomalies_missing_ref: number;
}

export interface WebhookEvent {
  event_type: string;
  payload: any;
  timestamp: Date;
}

export interface WebhookDelivery {
  id: string;
  event_type: string;
  payload: any;
  webhook_url: string;
  http_method: string;
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  attempts: number;
  max_attempts: number;
  last_attempt_at?: Date;
  response_status?: number;
  response_body?: string;
  error_message?: string;
  next_retry_at?: Date;
  delivered_at?: Date;
  created_at: Date;
}

export interface SIRARequest {
  type: 'reconciliation.anomaly' | 'reconciliation.fraud_check';
  data: {
    line?: BankStatementLine;
    candidates?: MatchCandidate[];
    context?: any;
  };
}

export interface SIRAResponse {
  score: number; // 0-100
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  factors: Array<{
    factor: string;
    score: number;
    weight: number;
  }>;
  recommended_action: string;
  suggestions?: string[];
}

export interface ReconciliationConfig {
  batch_size: number;
  max_retry_attempts: number;
  retry_delay_ms: number;
  enable_fuzzy_matching: boolean;
  enable_sira_scoring: boolean;
  enable_auto_matching: boolean;
  auto_match_confidence_threshold: number;
  anomaly_score_threshold: number;
  duplicate_detection_enabled: boolean;
  webhook_enabled: boolean;
  metrics_enabled: boolean;
}

export interface MatchingOptions {
  amount_tolerance: number;
  date_range_days: number;
  require_reference: boolean;
  enable_fuzzy_reference: boolean;
  fuzzy_threshold: number;
  max_candidates: number;
}

// ============================================================================
// End of types
// ============================================================================
