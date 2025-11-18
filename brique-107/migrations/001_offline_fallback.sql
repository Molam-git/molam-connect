-- =====================================================================
-- Brique 107: Offline Fallback (QR + USSD)
-- =====================================================================
-- Tables pour paiements offline via QR dynamique et USSD multi-pays
-- =====================================================================

-- QR Sessions - Paiements via QR codes dynamiques
CREATE TABLE IF NOT EXISTS qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID,
  user_id UUID,
  type TEXT NOT NULL CHECK (type IN ('payment_request', 'cash_in', 'agent_receipt', 'withdrawal')),
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'XOF',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scanned', 'completed', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL, -- signed payload data
  hmac TEXT NOT NULL, -- HMAC-SHA256 signature
  scanned_at TIMESTAMPTZ,
  scanned_by UUID,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qr_sessions_merchant ON qr_sessions(merchant_id);
CREATE INDEX idx_qr_sessions_user ON qr_sessions(user_id);
CREATE INDEX idx_qr_sessions_status ON qr_sessions(status);
CREATE INDEX idx_qr_sessions_expires ON qr_sessions(expires_at);
CREATE INDEX idx_qr_sessions_created ON qr_sessions(created_at DESC);

-- USSD Sessions - Sessions USSD multi-pays
CREATE TABLE IF NOT EXISTS ussd_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE, -- from USSD Gateway
  phone TEXT NOT NULL,
  country_code TEXT NOT NULL, -- SN, CI, ML, etc.
  language TEXT NOT NULL DEFAULT 'fr', -- fr, en, wo (wolof)
  state TEXT NOT NULL DEFAULT 'menu', -- FSM state
  data JSONB DEFAULT '{}', -- session context data
  pin_attempts INTEGER DEFAULT 0,
  pin_locked_until TIMESTAMPTZ,
  last_interaction TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ussd_sessions_session_id ON ussd_sessions(session_id);
CREATE INDEX idx_ussd_sessions_phone ON ussd_sessions(phone);
CREATE INDEX idx_ussd_sessions_country ON ussd_sessions(country_code);
CREATE INDEX idx_ussd_sessions_last_interaction ON ussd_sessions(last_interaction DESC);

-- USSD Menu Configurations - Textes multi-pays/multi-langues
CREATE TABLE IF NOT EXISTS ussd_menu_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  language TEXT NOT NULL,
  menu_key TEXT NOT NULL, -- 'main_menu', 'transfer_prompt', etc.
  text_content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(country_code, language, menu_key)
);

CREATE INDEX idx_ussd_menu_texts_country_lang ON ussd_menu_texts(country_code, language);
CREATE INDEX idx_ussd_menu_texts_key ON ussd_menu_texts(menu_key);

-- USSD Transactions - Historique des transactions USSD
CREATE TABLE IF NOT EXISTS ussd_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES ussd_sessions(id),
  phone TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('balance', 'transfer', 'recharge', 'withdrawal', 'pin_reset')),
  amount NUMERIC(18,2),
  currency TEXT DEFAULT 'XOF',
  recipient_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_ussd_transactions_session ON ussd_transactions(session_id);
CREATE INDEX idx_ussd_transactions_phone ON ussd_transactions(phone);
CREATE INDEX idx_ussd_transactions_status ON ussd_transactions(status);
CREATE INDEX idx_ussd_transactions_created ON ussd_transactions(created_at DESC);

-- Agent Operations - Operations agent (cash-in/cash-out)
CREATE TABLE IF NOT EXISTS agent_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('cash_in', 'cash_out', 'qr_payment')),
  customer_phone TEXT,
  customer_id UUID,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'XOF',
  commission NUMERIC(18,2) DEFAULT 0,
  qr_session_id UUID REFERENCES qr_sessions(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
  agent_float_before NUMERIC(18,2),
  agent_float_after NUMERIC(18,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_operations_agent ON agent_operations(agent_id);
CREATE INDEX idx_agent_operations_customer ON agent_operations(customer_phone);
CREATE INDEX idx_agent_operations_qr ON agent_operations(qr_session_id);
CREATE INDEX idx_agent_operations_status ON agent_operations(status);
CREATE INDEX idx_agent_operations_created ON agent_operations(created_at DESC);

-- USSD PIN Management - Gestion des PINs USSD
CREATE TABLE IF NOT EXISTS ussd_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL, -- Argon2 hash
  salt TEXT NOT NULL,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_changed TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ussd_pins_phone ON ussd_pins(phone);

-- Metrics - Statistiques offline
CREATE TABLE IF NOT EXISTS offline_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL CHECK (metric_type IN ('qr_generated', 'qr_scanned', 'qr_completed', 'ussd_session', 'ussd_transaction', 'agent_operation')),
  country_code TEXT,
  channel TEXT, -- 'qr', 'ussd', 'agent'
  value NUMERIC(18,2),
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_offline_metrics_type ON offline_metrics(metric_type);
CREATE INDEX idx_offline_metrics_country ON offline_metrics(country_code);
CREATE INDEX idx_offline_metrics_channel ON offline_metrics(channel);
CREATE INDEX idx_offline_metrics_recorded ON offline_metrics(recorded_at DESC);

-- Insert default USSD menu texts (French for Senegal)
INSERT INTO ussd_menu_texts (country_code, language, menu_key, text_content) VALUES
('SN', 'fr', 'main_menu', 'Bienvenue sur Molam\n1. Solde\n2. Recharger\n3. Transfert\n4. Retrait\n99. Reset PIN'),
('SN', 'fr', 'balance_prompt', 'Votre solde est: {balance} {currency}'),
('SN', 'fr', 'transfer_recipient', 'Entrez le numero du destinataire:'),
('SN', 'fr', 'transfer_amount', 'Entrez le montant:'),
('SN', 'fr', 'transfer_confirm', 'Confirmer transfert de {amount} {currency} vers {recipient}?\n1. Oui\n2. Non'),
('SN', 'fr', 'pin_prompt', 'Entrez votre PIN:'),
('SN', 'fr', 'pin_invalid', 'PIN incorrect. Tentatives restantes: {attempts}'),
('SN', 'fr', 'pin_locked', 'Compte verrouille. Reessayez dans {minutes} minutes.'),
('SN', 'fr', 'success_message', 'Operation reussie!'),
('SN', 'fr', 'error_message', 'Erreur: {error}')
ON CONFLICT (country_code, language, menu_key) DO NOTHING;

-- Insert default USSD menu texts (English for Senegal)
INSERT INTO ussd_menu_texts (country_code, language, menu_key, text_content) VALUES
('SN', 'en', 'main_menu', 'Welcome to Molam\n1. Balance\n2. Recharge\n3. Transfer\n4. Withdraw\n99. Reset PIN'),
('SN', 'en', 'balance_prompt', 'Your balance is: {balance} {currency}'),
('SN', 'en', 'transfer_recipient', 'Enter recipient number:'),
('SN', 'en', 'transfer_amount', 'Enter amount:'),
('SN', 'en', 'transfer_confirm', 'Confirm transfer of {amount} {currency} to {recipient}?\n1. Yes\n2. No'),
('SN', 'en', 'pin_prompt', 'Enter your PIN:'),
('SN', 'en', 'pin_invalid', 'Invalid PIN. Attempts remaining: {attempts}'),
('SN', 'en', 'pin_locked', 'Account locked. Try again in {minutes} minutes.'),
('SN', 'en', 'success_message', 'Operation successful!'),
('SN', 'en', 'error_message', 'Error: {error}')
ON CONFLICT (country_code, language, menu_key) DO NOTHING;

-- Comments
COMMENT ON TABLE qr_sessions IS 'QR code sessions for offline payments';
COMMENT ON TABLE ussd_sessions IS 'USSD session management with FSM';
COMMENT ON TABLE ussd_menu_texts IS 'Multilingual USSD menu texts';
COMMENT ON TABLE ussd_transactions IS 'USSD transaction history';
COMMENT ON TABLE agent_operations IS 'Agent cash-in/cash-out operations';
COMMENT ON TABLE ussd_pins IS 'USSD PIN management with Argon2';
COMMENT ON TABLE offline_metrics IS 'Offline channel metrics';
