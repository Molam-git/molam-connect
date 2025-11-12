// Core Analytics Types

export interface TransactionEvent {
  id: string;
  type: 'payment' | 'refund' | 'chargeback' | 'payout';
  amount: number;
  currency: string;
  fee_molam?: number;
  fee_partner?: number;
  merchant_id: string;
  agent_id?: string;
  product_id?: string;
  country?: string;
  city?: string;
  region?: string;
  payment_method?: string;
  status: 'succeeded' | 'failed' | 'pending' | 'refunded';
  occurred_at: string; // ISO timestamp
  metadata?: Record<string, any>;
}

export interface HourlyAggregate {
  hour: Date;
  hour_date: Date;
  region: string;
  country: string;
  merchant_id?: string;
  agent_id?: string;
  product_id?: string;
  payment_method?: string;
  currency: string;
  gross_volume_local: number;
  gross_volume_usd: number;
  net_revenue_local: number;
  net_revenue_usd: number;
  fees_molam_local: number;
  fees_molam_usd: number;
  fees_partner_local: number;
  fees_partner_usd: number;
  refunds_local: number;
  refunds_usd: number;
  chargebacks_local: number;
  chargebacks_usd: number;
  tx_count: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
}

export interface DailyAggregate extends Omit<HourlyAggregate, 'hour' | 'hour_date'> {
  day: Date;
}

export interface FXRate {
  as_of_date: Date;
  base_currency: string;
  quote_currency: string;
  rate: number;
  source: string;
}

export interface Alert {
  id: string;
  source: 'sira' | 'rule' | 'manual';
  alert_type: 'anomaly' | 'threshold' | 'pattern';
  merchant_id?: string;
  region?: string;
  country?: string;
  product_id?: string;
  severity: 'info' | 'warn' | 'critical';
  metric: string;
  current_value?: number;
  threshold_value?: number;
  deviation_percent?: number;
  title: string;
  description?: string;
  payload?: Record<string, any>;
  recommended_action?: string;
  auto_action_taken: boolean;
  status: 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'closed' | 'false_positive';
  acknowledged_by?: string;
  acknowledged_at?: Date;
  resolved_by?: string;
  resolved_at?: Date;
  resolution_notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  merchant_id?: string;
  region?: string;
  country?: string;
  metric: string;
  comparator: '>' | '<' | '>=' | '<=' | '=' | '!=';
  threshold: number;
  window_minutes: number;
  severity: 'info' | 'warn' | 'critical';
  notify_channels?: string[];
  webhook_url?: string;
  auto_actions?: Record<string, any>;
  is_active: boolean;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AnalyticsSummary {
  period: {
    from: string;
    to: string;
    granularity: 'hour' | 'day';
  };
  kpis: {
    gross_volume: number;
    net_revenue: number;
    fees_collected: number;
    refunds: number;
    chargebacks: number;
    tx_count: number;
    success_rate: number;
  };
  by_region?: Record<string, any>;
  by_country?: Record<string, any>;
  by_merchant?: Record<string, any>;
}

export interface TimeseriesDataPoint {
  t: Date | string;
  v: number;
}

export interface TopMerchant {
  merchant_id: string;
  merchant_name?: string;
  gross: number;
  net: number;
  fees: number;
  tx_count: number;
}
