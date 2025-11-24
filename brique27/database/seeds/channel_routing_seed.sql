-- Default channel routing
INSERT INTO channel_routing (event_type, primary_channel, fallback_channel, ops_webhook) VALUES
('wallet.cashin.self.succeeded', 'push', 'sms', false),
('wallet.cashin.other.succeeded', 'sms', 'push', false),
('wallet.cashout.succeeded', 'push', 'sms', false),
('wallet.p2p.succeeded', 'push', 'sms', false),
('wallet.refund.succeeded', 'push', 'sms', false),
('wallet.invoice.paid', 'push', 'sms', false),
('wallet.topup.carrier.paid', 'push', 'sms', false),
('agent.settlement.generated', 'email', 'sms', false),
('agent.settlement.paid', 'email', 'sms', false),
('risk.alert', 'webhook', 'email', true)
ON CONFLICT (event_type) DO UPDATE SET
  primary_channel = EXCLUDED.primary_channel,
  fallback_channel = EXCLUDED.fallback_channel,
  ops_webhook = EXCLUDED.ops_webhook;

-- Example country-specific routing
INSERT INTO channel_routing_zones (country, event_type, primary_channel, fallback_channel, updated_by) VALUES
('SN', 'wallet.p2p.succeeded', 'sms', 'push', 1),
('ML', 'wallet.p2p.succeeded', 'sms', 'push', 1),
('CI', 'wallet.p2p.succeeded', 'sms', 'push', 1),
('FR', 'wallet.p2p.succeeded', 'push', 'email', 1),
('US', 'wallet.p2p.succeeded', 'push', 'sms', 1),
('IN', 'wallet.p2p.succeeded', 'sms', 'email', 1),
('BR', 'wallet.p2p.succeeded', 'sms', 'email', 1)
ON CONFLICT (country, event_type) DO UPDATE SET
  primary_channel = EXCLUDED.primary_channel,
  fallback_channel = EXCLUDED.fallback_channel,
  updated_by = EXCLUDED.updated_by,
  updated_at = now();