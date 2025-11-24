-- 002_wallet_transactions.sql
-- Brique 2: DB wallet_transactions (Ledger double-entry)

CREATE TABLE IF NOT EXISTS molam_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relation avec les wallets
    debit_wallet_id UUID NOT NULL REFERENCES molam_wallets(id) ON DELETE CASCADE,
    credit_wallet_id UUID NOT NULL REFERENCES molam_wallets(id) ON DELETE CASCADE,

    -- Montant et devise
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL, -- ISO 4217 (XOF, USD, EUR, etc.)

    -- Métadonnées
    txn_type TEXT NOT NULL CHECK (txn_type IN 
        ('recharge','withdraw','p2p','merchant_payment','bill','topup','refund','reward','commission')),
    status TEXT NOT NULL CHECK (status IN 
        ('pending','success','failed','cancelled')),
    reference TEXT UNIQUE NOT NULL, -- ex: PAY-20250908-XYZ

    -- Audit et conformité
    initiated_by UUID REFERENCES molam_users(id),
    module_origin TEXT NOT NULL CHECK (module_origin IN 
        ('pay','eats','shop','ads','talk','free')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,

    -- Sécurité et intégrité
    signature TEXT, -- HMAC/SHA256 signature
    sira_score INTEGER, -- Score de risque Sira
    metadata JSONB -- Métadonnées supplémentaires
);

-- Index pour performances
CREATE INDEX idx_wallet_txn_debit_wallet ON molam_wallet_transactions(debit_wallet_id);
CREATE INDEX idx_wallet_txn_credit_wallet ON molam_wallet_transactions(credit_wallet_id);
CREATE INDEX idx_wallet_txn_status ON molam_wallet_transactions(status);
CREATE INDEX idx_wallet_txn_type ON molam_wallet_transactions(txn_type);
CREATE INDEX idx_wallet_txn_reference ON molam_wallet_transactions(reference);
CREATE INDEX idx_wallet_txn_created_at ON molam_wallet_transactions(created_at);
CREATE INDEX idx_wallet_txn_module_origin ON molam_wallet_transactions(module_origin);

-- Index composite pour requêtes fréquentes
CREATE INDEX idx_wallet_txn_wallets_status ON molam_wallet_transactions(debit_wallet_id, credit_wallet_id, status);

-- Contrainte pour éviter les transactions circulaires
ALTER TABLE molam_wallet_transactions 
ADD CONSTRAINT no_self_transaction 
CHECK (debit_wallet_id != credit_wallet_id);

-- Commentaires pour documentation
COMMENT ON TABLE molam_wallet_transactions IS 'Ledger double-entry pour toutes les transactions financières Molam Pay';
COMMENT ON COLUMN molam_wallet_transactions.debit_wallet_id IS 'Wallet débité (source des fonds)';
COMMENT ON COLUMN molam_wallet_transactions.credit_wallet_id IS 'Wallet crédité (destination des fonds)';
COMMENT ON COLUMN molam_wallet_transactions.reference IS 'Référence unique métier de la transaction';
COMMENT ON COLUMN molam_wallet_transactions.signature IS 'Signature HMAC/SHA256 pour intégrité des données';