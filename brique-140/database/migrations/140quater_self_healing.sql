/**
 * SOUS-BRIQUE 140quater — Self-Healing SDKs
 * Registre de patches auto-correctifs
 */

-- Registre de patches auto-correctifs avec crowdsourcing
CREATE TABLE IF NOT EXISTS sdk_self_healing_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sdk_language TEXT NOT NULL CHECK (sdk_language IN ('node','php','python','woocommerce','shopify')),
  error_signature TEXT NOT NULL,
  patch_code TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  version TEXT DEFAULT '1.0.0',
  active BOOLEAN DEFAULT true,
  rollback_code TEXT,
  source TEXT DEFAULT 'sira' CHECK (source IN ('sira','ops','crowd','ai')),
  crowd_votes INT DEFAULT 0,
  sandbox_tested BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Historique des patches appliqués
CREATE TABLE IF NOT EXISTS sdk_patch_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patch_id UUID NOT NULL REFERENCES sdk_self_healing_registry(id),
  developer_id UUID NOT NULL,
  sdk_language TEXT NOT NULL,
  error_encountered TEXT NOT NULL,
  patch_applied BOOLEAN DEFAULT true,
  success BOOLEAN,
  rollback_triggered BOOLEAN DEFAULT false,
  context JSONB NOT NULL DEFAULT '{}',
  applied_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour recherche rapide de patches
CREATE INDEX IF NOT EXISTS idx_self_healing_signature
  ON sdk_self_healing_registry(sdk_language, error_signature)
  WHERE active = true;

-- Index pour stats par développeur
CREATE INDEX IF NOT EXISTS idx_patch_applications_dev
  ON sdk_patch_applications(developer_id, applied_at DESC);

-- Index pour monitoring
CREATE INDEX IF NOT EXISTS idx_patch_applications_success
  ON sdk_patch_applications(success, applied_at DESC);

-- Journalisation complète des patches appliqués (crowdsourcing)
CREATE TABLE IF NOT EXISTS sdk_patch_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sdk_language TEXT NOT NULL,
  error_signature TEXT NOT NULL,
  patch_applied TEXT NOT NULL,
  rollback_available BOOLEAN DEFAULT false,
  rollback_triggered BOOLEAN DEFAULT false,
  success BOOLEAN,
  execution_time_ms INT,
  context JSONB DEFAULT '{}',
  applied_at TIMESTAMPTZ DEFAULT now(),
  applied_by TEXT DEFAULT 'auto'
);

-- Index pour analytics crowdsourcing
CREATE INDEX IF NOT EXISTS idx_patch_journal_signature
  ON sdk_patch_journal(error_signature, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_patch_journal_success
  ON sdk_patch_journal(success, applied_at DESC)
  WHERE success = false;

-- Table pour crowdsourcing de patches (propositions communautaires)
CREATE TABLE IF NOT EXISTS sdk_crowd_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sdk_language TEXT NOT NULL,
  error_signature TEXT NOT NULL,
  proposed_patch_code TEXT NOT NULL,
  proposed_rollback_code TEXT,
  description TEXT,
  proposer_id UUID,
  votes_up INT DEFAULT 0,
  votes_down INT DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','testing')),
  sandbox_results JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
);

-- Index pour modération crowd patches
CREATE INDEX IF NOT EXISTS idx_crowd_patches_status
  ON sdk_crowd_patches(status, votes_up DESC);

-- Table pour mode sandbox/simulation
CREATE TABLE IF NOT EXISTS sdk_sandbox_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patch_id UUID REFERENCES sdk_self_healing_registry(id),
  crowd_patch_id UUID REFERENCES sdk_crowd_patches(id),
  test_scenario TEXT NOT NULL,
  expected_result TEXT,
  actual_result TEXT,
  success BOOLEAN,
  execution_time_ms INT,
  error_message TEXT,
  tested_at TIMESTAMPTZ DEFAULT now(),
  tested_by UUID
);

-- Index pour sandbox testing
CREATE INDEX IF NOT EXISTS idx_sandbox_tests_patch
  ON sdk_sandbox_tests(patch_id, tested_at DESC);

CREATE INDEX IF NOT EXISTS idx_sandbox_tests_crowd
  ON sdk_sandbox_tests(crowd_patch_id, tested_at DESC);

-- Patches par défaut avec rollback : clé API manquante
INSERT INTO sdk_self_healing_registry(sdk_language, error_signature, patch_code, rollback_code, description, severity, source, sandbox_tested)
VALUES (
  'node',
  '401',
  'this.apiKey = process.env.MOLAM_API_KEY || "ak_test_fallback";
console.warn("⚡ Molam SDK: Clé API manquante, utilisation de la clé de test");',
  'this.apiKey = this.originalApiKey || "";',
  'Correction clé API manquante : injection clé fallback',
  'high',
  'sira',
  true
);

INSERT INTO sdk_self_healing_registry(sdk_language, error_signature, patch_code, rollback_code, description, severity, source, sandbox_tested)
VALUES (
  'php',
  '401',
  '$this->apiKey = getenv("MOLAM_API_KEY") ?: "ak_test_fallback";
error_log("⚡ Molam SDK: Clé API manquante, utilisation de la clé de test");',
  '$this->apiKey = $this->originalApiKey ?? "";',
  'Correction clé API manquante : injection clé fallback',
  'high',
  'sira',
  true
);

INSERT INTO sdk_self_healing_registry(sdk_language, error_signature, patch_code, rollback_code, description, severity, source, sandbox_tested)
VALUES (
  'python',
  '401',
  'self.api_key = os.getenv("MOLAM_API_KEY") or "ak_test_fallback"
print("⚡ Molam SDK: Clé API manquante, utilisation de la clé de test")',
  'self.api_key = getattr(self, "original_api_key", "")',
  'Correction clé API manquante : injection clé fallback',
  'high',
  'sira',
  true
);

-- Patches timeout
INSERT INTO sdk_self_healing_registry(sdk_language, error_signature, patch_code, rollback_code, description, severity, source, sandbox_tested)
VALUES (
  'node',
  'timeout',
  'this.timeout = 15000;
console.warn("⚡ Molam SDK: Timeout augmenté à 15s");',
  'this.timeout = this.originalTimeout || 10000;',
  'Augmentation automatique du timeout',
  'medium',
  'sira',
  true
);

-- Patches devise invalide
INSERT INTO sdk_self_healing_registry(sdk_language, error_signature, patch_code, rollback_code, description, severity, source, sandbox_tested)
VALUES (
  'node',
  'invalid_currency',
  'const validCurrencies = ["XOF","XAF","NGN","GHS","KES","USD","EUR"];
if (!validCurrencies.includes(currency)) {
  currency = "XOF";
  console.warn("⚡ Molam SDK: Devise invalide, utilisation de XOF par défaut");
}',
  'currency = this.originalCurrency;',
  'Correction devise invalide vers XOF',
  'medium',
  'sira',
  true
);

-- Patches HMAC signature
INSERT INTO sdk_self_healing_registry(sdk_language, error_signature, patch_code, rollback_code, description, severity, source, sandbox_tested)
VALUES (
  'node',
  'signature',
  'const crypto = require("crypto");
const signature = crypto.createHmac("sha256", this.secretKey).update(JSON.stringify(body)).digest("hex");
headers["X-API-Key"] = `${this.keyId}:${signature}`;
console.warn("⚡ Molam SDK: Signature HMAC recalculée");',
  'delete headers["X-API-Key"];',
  'Recalcul automatique de la signature HMAC',
  'high',
  'sira',
  true
);

-- Patches rate limiting
INSERT INTO sdk_self_healing_registry(sdk_language, error_signature, patch_code, rollback_code, description, severity, source, sandbox_tested)
VALUES (
  'node',
  '429',
  'const retryAfter = parseInt(error.headers?.["retry-after"] || "5");
console.warn(`⚡ Molam SDK: Rate limit atteint, retry dans ${retryAfter}s`);
await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
return this.request(endpoint, opts);',
  'throw error;',
  'Retry automatique après rate limit',
  'medium',
  'sira',
  true
);

-- Patches WooCommerce spécifiques
INSERT INTO sdk_self_healing_registry(sdk_language, error_signature, patch_code, rollback_code, description, severity, source, sandbox_tested)
VALUES (
  'woocommerce',
  'missing_api_key',
  '$api_key = get_option("molam_api_key");
if (empty($api_key)) {
  update_option("molam_api_key", "ak_test_fallback");
  error_log("⚡ WooCommerce Molam: Clé API configurée automatiquement");
}',
  'delete_option("molam_api_key");',
  'Configuration automatique clé API WooCommerce',
  'high',
  'ops',
  true
);

-- Patches Shopify spécifiques
INSERT INTO sdk_self_healing_registry(sdk_language, error_signature, patch_code, rollback_code, description, severity, source, sandbox_tested)
VALUES (
  'shopify',
  'webhook_verification_failed',
  'const shopify_secret = process.env.SHOPIFY_SECRET;
if (!shopify_secret) {
  console.warn("⚡ Shopify Molam: Webhook verification skipped (dev mode)");
  return true;
}',
  'return false;',
  'Skip webhook verification en mode dev Shopify',
  'medium',
  'ops',
  false
);
