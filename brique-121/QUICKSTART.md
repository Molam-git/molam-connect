# 🚀 Brique 121 — Quick Start Guide

## Installation rapide (5 minutes)

### 1. Setup Database

```bash
# Créer le schéma PostgreSQL
psql $DATABASE_URL -f brique-121/database/schema.sql

# Vérifier les tables
psql $DATABASE_URL -c "\dt bank_*"
```

**Tables créées** :
- ✅ `bank_profiles` - Profils de banques
- ✅ `bank_connectors_registry` - Registre des connecteurs
- ✅ `bank_statements_raw` - Fichiers bruts
- ✅ `bank_statement_lines` - Lignes normalisées
- ✅ `bank_connector_logs` - Logs d'exécution

### 2. Setup Vault (Development)

```bash
# Lancer Vault en mode dev
vault server -dev &

export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='root'

# Créer des secrets de test
vault kv put secret/bank/sandbox/api_key value="test-key-123"
vault kv put secret/bank/sandbox/hmac value="hmac-secret-xyz"

# Vérifier
vault kv get secret/bank/sandbox/api_key
```

### 3. Configuration Connecteur

```sql
-- Insérer un connecteur REST sandbox
INSERT INTO bank_connectors_registry (bank_profile_id, connector_type, config, status)
VALUES (
  (SELECT id FROM bank_profiles WHERE bank_code = 'SBOX001' LIMIT 1),
  'rest',
  '{
    "endpoint": "https://sandbox-api.example.com/v1",
    "vault_secret_key": "vault:bank/sandbox/api_key",
    "vault_hmac_key": "vault:bank/sandbox/hmac",
    "timeout_ms": 15000
  }'::jsonb,
  'active'
);
```

### 4. Test du Connecteur

```typescript
import { RestSandboxConnector } from './brique-121/src/connectors/rest-sandbox-connector';
import { initVaultClient } from './brique-121/src/utils/vault';

// Initialiser Vault
initVaultClient({
  address: 'http://127.0.0.1:8200',
  token: 'root'
});

// Créer un connecteur
const connector = new RestSandboxConnector();
await connector.init({
  endpoint: 'https://sandbox-api.example.com/v1',
  vault_secret_key: 'vault:bank/sandbox/api_key',
  vault_hmac_key: 'vault:bank/sandbox/hmac'
});

// Health check
const health = await connector.healthcheck();
console.log('✅ Connector healthy:', health.healthy);

// Envoyer un paiement de test
const result = await connector.sendPayment({
  id: 'test-slice-001',
  parent_payout_id: 'test-payout-001',
  slice_amount: 1000.00,
  currency: 'XOF',
  beneficiary: {
    name: 'Test Beneficiary',
    bank_account: {
      account_number: '1234567890',
      bank_name: 'Test Bank'
    }
  },
  idempotency_key: 'test-payout-001-attempt-0'
});

console.log('✅ Payment sent:', result);
```

---

## 📋 Exemples d'utilisation

### Exemple 1 : Parser un fichier MT940

```typescript
import { parseMT940 } from './brique-121/src/utils/mt940-parser';
import fs from 'fs';

// Lire fichier MT940
const mt940Content = fs.readFileSync('./statement.mt940', 'utf8');

// Parser
const lines = parseMT940(mt940Content);

console.log(`✅ Parsed ${lines.length} transactions`);

// Insérer dans la DB
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

for (const line of lines) {
  await pool.query(
    `INSERT INTO bank_statement_lines
     (bank_profile_id, statement_date, value_date, amount, currency, debit_credit, description, reference)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      'bank-profile-uuid',
      line.statement_date,
      line.value_date,
      line.amount,
      line.currency,
      line.debit_credit,
      line.description,
      line.reference
    ]
  );
}

console.log('✅ Imported to database');
```

### Exemple 2 : Circuit Breaker

```typescript
import { CircuitBreaker } from './brique-121/src/utils/circuit-breaker';

const breaker = new CircuitBreaker({
  failure_threshold: 3,
  success_threshold: 2,
  timeout_ms: 30000,
  half_open_max_calls: 2
});

// Écouter les événements
breaker.on('open', () => {
  console.log('🔴 Circuit OPEN - service failing');
});

breaker.on('closed', () => {
  console.log('🟢 Circuit CLOSED - service recovered');
});

breaker.on('state-change', (from, to) => {
  console.log(`Circuit state: ${from} → ${to}`);
});

// Exécuter avec protection
try {
  await breaker.execute(async () => {
    return await unreliableBankAPI.sendPayment(payment);
  });
} catch (error) {
  if (error.code === 'CIRCUIT_OPEN') {
    console.log('❌ Circuit breaker is open - rejecting fast');
  }
}
```

### Exemple 3 : Retry avec Exponential Backoff

```typescript
import { RetryExecutor } from './brique-121/src/utils/circuit-breaker';

const retry = new RetryExecutor({
  max_attempts: 5,
  initial_delay_ms: 1000,
  max_delay_ms: 30000,
  backoff_multiplier: 2,
  jitter: true
});

await retry.execute(
  async () => {
    return await bankAPI.getPaymentStatus(providerRef);
  },
  (error, attempt) => {
    // Custom retry logic
    if (error.code === 'NOT_FOUND') return false; // Ne pas retry
    if (attempt >= 3) return false; // Max 3 attempts
    return true;
  }
);
```

### Exemple 4 : Resilient Executor (combiné)

```typescript
import { createResilientExecutor } from './brique-121/src/utils/circuit-breaker';

const executor = createResilientExecutor('bank-connector-rest');

// Circuit breaker + retry automatique
const result = await executor.execute(async () => {
  return await connector.sendPayment(slice);
});

// Statistiques
const stats = executor.getCircuitBreaker().getStats();
console.log('Circuit state:', stats.state);
console.log('Failure count:', stats.failureCount);
```

### Exemple 5 : Signature HMAC

```typescript
import { signWithHMAC, verifyHMAC } from './brique-121/src/utils/hsm';

const payload = JSON.stringify({
  amount: 1000,
  currency: 'XOF',
  beneficiary: '...'
});

const hmacKey = 'your-secret-key';

// Signer
const signature = signWithHMAC(payload, hmacKey, 'sha256');

// Headers HTTP
headers['X-Signature'] = signature;
headers['X-Signature-Algorithm'] = 'HMAC-SHA256';

// Vérifier (côté serveur)
const isValid = verifyHMAC(payload, receivedSignature, hmacKey, 'sha256');
if (!isValid) {
  throw new Error('Invalid signature');
}
```

### Exemple 6 : Réconciliation automatique

```sql
-- Trouver les lignes non réconciliées
SELECT
  bsl.id,
  bsl.amount,
  bsl.currency,
  bsl.reference,
  bsl.description,
  bsl.statement_date
FROM bank_statement_lines bsl
WHERE bsl.reconciliation_status = 'unmatched'
  AND bsl.bank_profile_id = 'bank-uuid'
ORDER BY bsl.statement_date DESC;

-- Matcher avec un payout
UPDATE bank_statement_lines
SET
  reconciliation_status = 'matched',
  matched_payout_id = 'payout-uuid',
  matched_slice_id = 'slice-uuid',
  matched_at = now()
WHERE
  id = 'statement-line-uuid'
  AND reconciliation_status = 'unmatched';

-- Mettre à jour le statut du payout
UPDATE payout_slices
SET
  status = 'settled',
  settled_at = now()
WHERE id = 'slice-uuid';
```

---

## 🔍 Debugging

### Voir les logs de connecteur

```sql
-- Derniers appels
SELECT
  bcl.created_at,
  bcl.operation,
  bcl.status,
  bcl.duration_ms,
  bcl.error_message,
  bcl.trace_id
FROM bank_connector_logs bcl
JOIN bank_connectors_registry bcr ON bcl.connector_id = bcr.id
WHERE bcr.connector_type = 'rest'
ORDER BY bcl.created_at DESC
LIMIT 50;

-- Taux de succès par connecteur
SELECT
  bcr.id,
  bcr.connector_type,
  COUNT(*) as total_calls,
  SUM(CASE WHEN bcl.status = 'success' THEN 1 ELSE 0 END) as successes,
  SUM(CASE WHEN bcl.status = 'failed' THEN 1 ELSE 0 END) as failures,
  AVG(bcl.duration_ms) as avg_duration_ms
FROM bank_connector_logs bcl
JOIN bank_connectors_registry bcr ON bcl.connector_id = bcr.id
WHERE bcl.created_at > now() - interval '1 hour'
GROUP BY bcr.id, bcr.connector_type;
```

### Vérifier l'état du circuit breaker

```sql
SELECT
  id,
  connector_type,
  circuit_breaker_state,
  failure_count,
  last_failure,
  status
FROM bank_connectors_registry
WHERE status = 'active';
```

### Reset un circuit breaker bloqué

```sql
UPDATE bank_connectors_registry
SET
  circuit_breaker_state = 'closed',
  failure_count = 0,
  last_failure = NULL,
  updated_at = now()
WHERE id = 'connector-uuid';
```

---

## 📊 Métriques & Monitoring

### Queries utiles

```sql
-- Transactions non réconciliées par banque
SELECT
  bp.bank_name,
  COUNT(*) as unmatched_count,
  SUM(bsl.amount) as total_amount
FROM bank_statement_lines bsl
JOIN bank_profiles bp ON bsl.bank_profile_id = bp.id
WHERE bsl.reconciliation_status = 'unmatched'
  AND bsl.statement_date > now() - interval '7 days'
GROUP BY bp.bank_name
ORDER BY unmatched_count DESC;

-- Connecteurs avec taux d'échec élevé
SELECT
  bcr.connector_type,
  bcr.status,
  bcr.failure_count,
  bcr.last_health_check,
  bcr.health_status
FROM bank_connectors_registry bcr
WHERE bcr.failure_count > 3
  OR bcr.circuit_breaker_state = 'open';

-- Payout slices en attente d'envoi
SELECT
  ps.id,
  ps.slice_amount,
  ps.currency,
  ps.status,
  ps.attempts,
  ps.last_error,
  ps.created_at
FROM payout_slices ps
WHERE ps.status = 'pending'
  AND ps.created_at > now() - interval '1 hour'
ORDER BY ps.created_at ASC;
```

---

## 🛠️ Troubleshooting

### Problème : Circuit breaker toujours OPEN

**Solution** :
```sql
-- Vérifier les logs récents
SELECT * FROM bank_connector_logs
WHERE connector_id = 'uuid'
ORDER BY created_at DESC
LIMIT 20;

-- Reset manuel
UPDATE bank_connectors_registry
SET circuit_breaker_state = 'closed', failure_count = 0
WHERE id = 'uuid';
```

### Problème : Secrets Vault non résolus

**Solution** :
```bash
# Vérifier la connexion Vault
vault status

# Tester la lecture
vault kv get secret/bank/sandbox/api_key

# Vérifier les permissions
vault token lookup

# Re-login si nécessaire
vault login $VAULT_TOKEN
```

### Problème : MT940 parsing failed

**Solution** :
```typescript
import { parseMT940, validateMT940 } from './utils/mt940-parser';

const statement = parseStatement(mt940Text);
const validation = validateMT940(statement);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}
```

---

## 📝 Checklist de production

Avant de déployer en production :

- [ ] Schéma DB créé et migrations testées
- [ ] Vault configuré avec secrets prod
- [ ] HSM configuré (AWS CloudHSM ou équivalent)
- [ ] Certificats mTLS installés dans Vault
- [ ] Circuit breakers configurés par connecteur
- [ ] Retry policies ajustées par banque
- [ ] Logs et métriques activés
- [ ] Alertes configurées (PagerDuty/Slack)
- [ ] Tests d'intégration passés avec chaque banque
- [ ] Runbook opérationnel documenté
- [ ] Accès Kubernetes et namespaces configurés
- [ ] Backup et disaster recovery testés

---

## 🎓 Prochaines étapes

1. **Implémenter les connecteurs manquants** :
   - MT940/SFTP Connector
   - ISO20022 Connector
   - Connector Manager

2. **Ajouter l'observabilité** :
   - Prometheus metrics
   - Grafana dashboards
   - OpenTelemetry tracing

3. **Tests et QA** :
   - Tests unitaires (80% coverage)
   - Tests d'intégration E2E
   - Load testing

4. **Déploiement** :
   - CI/CD pipeline
   - Kubernetes manifests
   - Helm charts

---

**Besoin d'aide ?** Consultez le [README.md](./README.md) complet ou contactez l'équipe Tech.
