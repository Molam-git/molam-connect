/**
 * Molam Connect - Merchant Dashboard Database Schema
 * Aggregates merchant transaction data for analytics and reporting
 */

-- Merchants table (basic info, linked to Molam ID)
CREATE TABLE IF NOT EXISTS merchants (
  merchant_id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  business_name VARCHAR(255),
  country VARCHAR(10) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchants_country ON merchants(country);
CREATE INDEX idx_merchants_status ON merchants(status);

-- Daily aggregates for merchant transactions
CREATE TABLE IF NOT EXISTS merchant_daily_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(merchant_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  currency VARCHAR(10) NOT NULL,

  -- Transaction counts
  total_transactions INTEGER NOT NULL DEFAULT 0,
  successful_transactions INTEGER NOT NULL DEFAULT 0,
  failed_transactions INTEGER NOT NULL DEFAULT 0,
  pending_transactions INTEGER NOT NULL DEFAULT 0,

  -- Revenue metrics
  total_revenue NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_fees NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_revenue NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Payment methods breakdown
  mobile_money_count INTEGER NOT NULL DEFAULT 0,
  mobile_money_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  card_count INTEGER NOT NULL DEFAULT 0,
  card_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  bank_transfer_count INTEGER NOT NULL DEFAULT 0,
  bank_transfer_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  qr_payment_count INTEGER NOT NULL DEFAULT 0,
  qr_payment_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Customer metrics
  unique_customers INTEGER NOT NULL DEFAULT 0,
  new_customers INTEGER NOT NULL DEFAULT 0,
  returning_customers INTEGER NOT NULL DEFAULT 0,

  -- Average metrics
  avg_transaction_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(merchant_id, date, currency)
);

CREATE INDEX idx_daily_aggregates_merchant ON merchant_daily_aggregates(merchant_id);
CREATE INDEX idx_daily_aggregates_date ON merchant_daily_aggregates(date DESC);
CREATE INDEX idx_daily_aggregates_merchant_date ON merchant_daily_aggregates(merchant_id, date DESC);

-- Hourly aggregates for real-time monitoring
CREATE TABLE IF NOT EXISTS merchant_hourly_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(merchant_id) ON DELETE CASCADE,
  hour_timestamp TIMESTAMPTZ NOT NULL,
  currency VARCHAR(10) NOT NULL,

  total_transactions INTEGER NOT NULL DEFAULT 0,
  successful_transactions INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC(18,2) NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(merchant_id, hour_timestamp, currency)
);

CREATE INDEX idx_hourly_aggregates_merchant ON merchant_hourly_aggregates(merchant_id);
CREATE INDEX idx_hourly_aggregates_timestamp ON merchant_hourly_aggregates(hour_timestamp DESC);

-- Top products/services for merchants
CREATE TABLE IF NOT EXISTS merchant_product_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(merchant_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  product_id VARCHAR(255),
  product_name VARCHAR(255) NOT NULL,

  transaction_count INTEGER NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(merchant_id, date, product_id)
);

CREATE INDEX idx_product_stats_merchant ON merchant_product_stats(merchant_id);
CREATE INDEX idx_product_stats_date ON merchant_product_stats(date DESC);

-- Customer analytics
CREATE TABLE IF NOT EXISTS merchant_customer_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(merchant_id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,

  first_transaction_at TIMESTAMPTZ NOT NULL,
  last_transaction_at TIMESTAMPTZ NOT NULL,
  total_transactions INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(merchant_id, customer_id)
);

CREATE INDEX idx_customer_stats_merchant ON merchant_customer_stats(merchant_id);
CREATE INDEX idx_customer_stats_last_transaction ON merchant_customer_stats(last_transaction_at DESC);

-- Transaction events log (for processing by aggregation worker)
CREATE TABLE IF NOT EXISTS transaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  transaction_id VARCHAR(255) NOT NULL,
  customer_id UUID,

  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('payment_created', 'payment_succeeded', 'payment_failed', 'payment_refunded')),

  amount NUMERIC(18,2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  fee NUMERIC(18,2) NOT NULL DEFAULT 0,

  payment_method VARCHAR(50),
  product_id VARCHAR(255),
  product_name VARCHAR(255),

  metadata JSONB,

  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(transaction_id, event_type)
);

CREATE INDEX idx_transaction_events_merchant ON transaction_events(merchant_id);
CREATE INDEX idx_transaction_events_processed ON transaction_events(processed, created_at) WHERE NOT processed;
CREATE INDEX idx_transaction_events_created ON transaction_events(created_at DESC);

-- Merchant API keys for authentication
CREATE TABLE IF NOT EXISTS merchant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(merchant_id) ON DELETE CASCADE,
  key_prefix VARCHAR(20) NOT NULL,
  key_hash TEXT NOT NULL,
  name VARCHAR(255),

  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(key_prefix)
);

CREATE INDEX idx_api_keys_merchant ON merchant_api_keys(merchant_id);
CREATE INDEX idx_api_keys_status ON merchant_api_keys(status) WHERE status = 'active';

-- Updated_at trigger for merchants
CREATE OR REPLACE FUNCTION update_merchants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER merchants_updated_at
  BEFORE UPDATE ON merchants
  FOR EACH ROW
  EXECUTE FUNCTION update_merchants_updated_at();

-- Updated_at trigger for daily aggregates
CREATE OR REPLACE FUNCTION update_daily_aggregates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_aggregates_updated_at
  BEFORE UPDATE ON merchant_daily_aggregates
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_aggregates_updated_at();

-- Function to mark transaction event as processed
CREATE OR REPLACE FUNCTION mark_event_processed(event_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE transaction_events
  SET processed = true, processed_at = now()
  WHERE id = event_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE merchants IS 'Merchant accounts linked to Molam ID';
COMMENT ON TABLE merchant_daily_aggregates IS 'Daily transaction aggregates per merchant';
COMMENT ON TABLE merchant_hourly_aggregates IS 'Hourly aggregates for real-time monitoring';
COMMENT ON TABLE transaction_events IS 'Raw transaction events to be processed by aggregation worker';
COMMENT ON TABLE merchant_api_keys IS 'API keys for merchant dashboard authentication';
