-- =====================================================================
-- Brique 117-bis: Doc Playground Interactif
-- =====================================================================
-- Playground pour exécuter du code API en temps réel
-- =====================================================================

-- Table des sessions playground
CREATE TABLE IF NOT EXISTS playground_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_type TEXT NOT NULL DEFAULT 'developer',
    tenant_id UUID,
    created_by UUID,
    title TEXT,
    description TEXT,
    request_json JSONB NOT NULL,
    response_json JSONB,
    sira_suggestions JSONB,
    status TEXT NOT NULL DEFAULT 'draft',
    share_key TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT valid_status CHECK (status IN ('draft', 'run', 'saved', 'shared'))
);

-- Index pour performance
CREATE INDEX idx_playground_sessions_created ON playground_sessions(created_by, created_at DESC);
CREATE INDEX idx_playground_sessions_share ON playground_sessions(share_key) WHERE share_key IS NOT NULL;

-- Table des snippets de code générés
CREATE TABLE IF NOT EXISTS playground_snippets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES playground_sessions(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT valid_language CHECK (language IN ('node', 'php', 'python', 'curl', 'browser'))
);

-- Index pour snippets
CREATE INDEX idx_playground_snippets_session ON playground_snippets(session_id);

-- Table d'audit des actions playground
CREATE TABLE IF NOT EXISTS playground_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES playground_sessions(id) ON DELETE SET NULL,
    actor UUID,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour audit
CREATE INDEX idx_playground_audit_logs_session ON playground_audit_logs(session_id, created_at DESC);
CREATE INDEX idx_playground_audit_logs_actor ON playground_audit_logs(actor, created_at DESC);

-- Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_playground_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER playground_sessions_updated
    BEFORE UPDATE ON playground_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_playground_session_timestamp();

-- Fonction pour générer une clé de partage
CREATE OR REPLACE FUNCTION generate_share_key()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Vue des sessions publiques partagées
CREATE OR REPLACE VIEW playground_public_sessions AS
SELECT
    id,
    title,
    description,
    request_json,
    response_json,
    share_key,
    created_at
FROM playground_sessions
WHERE status = 'shared'
  AND share_key IS NOT NULL;

-- Commentaires
COMMENT ON TABLE playground_sessions IS 'Sessions de code exécuté dans le playground interactif';
COMMENT ON TABLE playground_snippets IS 'Snippets de code générés dans différents langages';
COMMENT ON TABLE playground_audit_logs IS 'Logs d''audit des actions playground';

-- Données de test
INSERT INTO playground_sessions (tenant_type, title, request_json, status) VALUES
(
    'developer',
    'Créer un paiement XOF',
    '{"method": "POST", "path": "/v1/payments", "body": {"amount": 5000, "currency": "XOF", "method": "wallet"}}'::jsonb,
    'saved'
),
(
    'developer',
    'Récupérer un paiement',
    '{"method": "GET", "path": "/v1/payments/pay_123", "body": null}'::jsonb,
    'saved'
)
ON CONFLICT DO NOTHING;
