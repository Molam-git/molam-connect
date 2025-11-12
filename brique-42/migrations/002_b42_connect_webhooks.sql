/**
 * Brique 42 - Connect Payments
 * Migration 002: Webhooks Table
 *
 * Stores webhook endpoints for merchant accounts
 * Each account can have multiple webhook endpoints
 */

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Connect Webhooks table
CREATE TABLE IF NOT EXISTS connect_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_account_id UUID NOT NULL REFERENCES connect_accounts(id) ON DELETE CASCADE,

  -- Webhook configuration
  url TEXT NOT NULL,                                    -- Webhook endpoint URL
  secret TEXT NOT NULL,                                 -- Secret for HMAC signature
  enabled BOOLEAN NOT NULL DEFAULT true,                -- Can be disabled without deletion

  -- Event subscriptions (array of event types)
  events TEXT[] NOT NULL DEFAULT ARRAY[                 -- Events this webhook subscribes to
    'payment.intent.created',
    'payment.charge.authorized',
    'payment.charge.captured',
    'payment.intent.canceled',
    'payment.refund.succeeded',
    'payment.refund.failed'
  ],

  -- Metadata
  description TEXT,                                     -- Optional description
  metadata JSONB DEFAULT '{}'::jsonb,                   -- Custom metadata

  -- API version for webhook payload format
  api_version TEXT NOT NULL DEFAULT 'v1',               -- e.g. "v1", "v2"

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_triggered_at TIMESTAMPTZ,                        -- Last successful delivery

  -- Constraints
  CONSTRAINT webhook_url_not_empty CHECK (url <> ''),
  CONSTRAINT webhook_secret_not_empty CHECK (secret <> '')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhooks_account ON connect_webhooks(connect_account_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON connect_webhooks(connect_account_id, enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_webhooks_events ON connect_webhooks USING GIN(events);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_webhook_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_webhook_updated_at
  BEFORE UPDATE ON connect_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_timestamp();

-- Comments
COMMENT ON TABLE connect_webhooks IS 'Webhook endpoints for merchant accounts';
COMMENT ON COLUMN connect_webhooks.secret IS 'Secret key for HMAC-SHA256 signature verification';
COMMENT ON COLUMN connect_webhooks.events IS 'Array of event types this webhook subscribes to';
COMMENT ON COLUMN connect_webhooks.api_version IS 'API version for payload format compatibility';
