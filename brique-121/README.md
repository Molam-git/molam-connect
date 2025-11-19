# Brique 121 — Bank Connectors

## 🎯 Objectif

Fournir une **infrastructure industrielle complète** pour connecter Molam à des banques et PSP via plusieurs rails :
- REST APIs (modern PSPs)
- File-based (MT940/CSV)
- ISO20022 (pain.001 / camt.053)
- Rails locaux (RTGS, ACH)

## 📋 Fonctionnalités

### ✅ Livrables implémentés

- ✅ **Interface commune** `BankConnector` - Contrat TypeScript unifié
- ✅ **Connecteur REST Sandbox** - APIs JSON modernes avec HMAC/mTLS
- ✅ **Parser MT940** - Parsing SWIFT MT940 + CSV
- ✅ **Vault Integration** - Gestion sécurisée des secrets (HashiCorp Vault)
- ✅ **HSM Signing** - Signature cryptographique pour ISO20022
- ✅ **Circuit Breaker** - Protection contre les pannes en cascade
- ✅ **Retry Logic** - Exponential backoff avec jitter
- ✅ **Schéma Database** - Tables PostgreSQL complètes
- ✅ **Logger** - Audit trail et observabilité

### 🚧 À compléter

- ⏳ **MT940/SFTP Connector** - Polling SFTP et ingestion
- ⏳ **ISO20022 Connector** - Génération pain.001 et signature HSM
- ⏳ **Connector Manager** - Factory et loader
- ⏳ **Dispatcher Worker** - Orchestration des envois
- ⏳ **Prometheus Metrics** - Métriques d'observabilité
- ⏳ **Tests unitaires** - Coverage complète
- ⏳ **API Routes** - Endpoints de gestion
- ⏳ **K8s Manifests** - Déploiement production

---

## 🗂️ Architecture

### Structure des fichiers

```
brique-121/
├── database/
│   └── schema.sql                          # Schéma PostgreSQL complet
├── src/
│   ├── types.ts                            # Interfaces TypeScript
│   ├── connectors/
│   │   ├── rest-sandbox-connector.ts       # ✅ Connecteur REST
│   │   ├── mt940-connector.ts              # ⏳ À implémenter
│   │   ├── iso20022-connector.ts           # ⏳ À implémenter
│   │   ├── manager.ts                      # ⏳ Factory
│   │   └── logger.ts                       # ✅ Audit logger
│   ├── utils/
│   │   ├── vault.ts                        # ✅ HashiCorp Vault client
│   │   ├── hsm.ts                          # ✅ HSM signing utilities
│   │   ├── circuit-breaker.ts              # ✅ Circuit breaker + retry
│   │   └── mt940-parser.ts                 # ✅ MT940/CSV parser
│   ├── workers/
│   │   └── dispatcher.ts                   # ⏳ Dispatcher worker
│   └── routes/
│       └── connectors.ts                   # ⏳ API routes
├── tests/
│   ├── rest-connector.spec.ts              # ⏳ Tests
│   ├── mt940-connector.spec.ts
│   └── iso20022-connector.spec.ts
├── k8s/
│   ├── deployment.yaml                     # ⏳ K8s manifests
│   ├── service.yaml
│   └── vault-sidecar.yaml
└── README.md                                # 📄 Ce fichier
```

---

## 🔌 Interface BankConnector

Tous les connecteurs implémentent cette interface :

```typescript
interface BankConnector {
  name: string;
  type: 'rest' | 'mt940' | 'iso20022' | 'local' | 'csv' | 'camt053';

  init(config: ConnectorConfig): Promise<void>;
  sendPayment(slice: PayoutSlice, context?: ConnectorContext): Promise<BankSendResult>;
  getPaymentStatus(providerRef: string, context?: ConnectorContext): Promise<BankPaymentStatus>;
  uploadStatement(fileBuffer: Buffer, meta: StatementFileMetadata): Promise<{ imported_id: string }>;
  parseStatement(importedId: string): Promise<BankStatementLine[]>;
  healthcheck(context?: ConnectorContext): Promise<HealthCheckResult>;
  shutdown?(): Promise<void>;
}
```

---

## 🗄️ Schéma Database

### Tables principales

#### `bank_connectors_registry`
Registre des connecteurs configurés par banque.

```sql
CREATE TABLE bank_connectors_registry (
  id UUID PRIMARY KEY,
  bank_profile_id UUID NOT NULL,
  connector_type TEXT CHECK (connector_type IN ('rest', 'mt940', 'iso20022', 'local', 'csv', 'camt053')),
  config JSONB NOT NULL,
  priority INT DEFAULT 100,
  status TEXT DEFAULT 'active',
  circuit_breaker_state TEXT DEFAULT 'closed',
  failure_count INT DEFAULT 0,
  ...
);
```

#### `bank_statements_raw`
Fichiers bruts de relevés bancaires (MT940, CSV, XML).

```sql
CREATE TABLE bank_statements_raw (
  id UUID PRIMARY KEY,
  bank_profile_id UUID NOT NULL,
  file_name TEXT,
  file_s3_key TEXT,
  file_hash TEXT,
  parsed JSONB,
  status TEXT CHECK (status IN ('uploaded', 'parsing', 'parsed', 'failed', 'archived')),
  ...
);
```

#### `bank_statement_lines`
Lignes de relevé normalisées pour la réconciliation.

```sql
CREATE TABLE bank_statement_lines (
  id UUID PRIMARY KEY,
  bank_profile_id UUID NOT NULL,
  statement_date DATE NOT NULL,
  value_date DATE NOT NULL,
  amount NUMERIC(20,2) NOT NULL,
  currency TEXT NOT NULL,
  debit_credit TEXT CHECK (debit_credit IN ('debit', 'credit')),
  description TEXT,
  reference TEXT,
  reconciliation_status TEXT DEFAULT 'unmatched',
  matched_payout_id UUID,
  ...
);
```

#### `bank_connector_logs`
Logs d'exécution pour observabilité et debugging.

```sql
CREATE TABLE bank_connector_logs (
  id UUID PRIMARY KEY,
  connector_id UUID NOT NULL,
  operation TEXT NOT NULL,
  trace_id TEXT,
  status TEXT CHECK (status IN ('success', 'failed', 'timeout', 'circuit_open')),
  duration_ms INT,
  error_message TEXT,
  ...
);
```

---

## 🔐 Sécurité & Conformité

### Vault Integration

Tous les secrets sont stockés dans HashiCorp Vault :

```typescript
// Configuration avec références Vault
{
  "connector_type": "rest",
  "config": {
    "endpoint": "https://sandbox-bank.example/api/v1",
    "vault_secret_key": "vault:bank/sandbox/api_key",
    "vault_hmac_key": "vault:bank/sandbox/hmac",
    "vault_cert_path": "vault:bank/sandbox/mtls_cert"
  }
}
```

Le client Vault résout automatiquement :

```typescript
import { getVaultSecret, resolveConnectorConfig } from './utils/vault';

// Résolution automatique
const config = await resolveConnectorConfig(rawConfig);
// config.api_key contient maintenant la valeur du secret
```

### HSM Signing

Signature des messages ISO20022 avec HSM (Hardware Security Module) :

```typescript
import { signXmlWithHSM, signPain001 } from './utils/hsm';

const signedXml = await signPain001(pain001Xml, 'signing-key-id');
```

### mTLS

Support des certificats client mTLS :

```typescript
import { loadMTLSCertificates } from './utils/hsm';

const mtls = await loadMTLSCertificates('vault:bank/prod/mtls');
// { cert, key, ca }
```

### HMAC Signing

Signature HMAC pour les requêtes REST :

```typescript
import { signWithHMAC, verifyHMAC } from './utils/hsm';

const signature = signWithHMAC(payload, hmacKey);
headers['X-Signature'] = signature;
```

---

## 🔄 Circuit Breaker & Retry Logic

### Circuit Breaker

Protège contre les pannes en cascade :

```typescript
import { CircuitBreaker } from './utils/circuit-breaker';

const breaker = new CircuitBreaker({
  failure_threshold: 5,      // Open après 5 échecs
  success_threshold: 2,      // Close après 2 succès
  timeout_ms: 60000,         // 1 minute en état OPEN
  half_open_max_calls: 3     // Max 3 appels en HALF_OPEN
});

// États : CLOSED → OPEN → HALF_OPEN → CLOSED
await breaker.execute(async () => {
  return await dangerousOperation();
});
```

### Retry avec Exponential Backoff

```typescript
import { RetryExecutor } from './utils/circuit-breaker';

const retry = new RetryExecutor({
  max_attempts: 3,
  initial_delay_ms: 1000,
  max_delay_ms: 30000,
  backoff_multiplier: 2,
  jitter: true                // +/- 10% random jitter
});

await retry.execute(async () => {
  return await unreliableOperation();
});
```

### ResilientExecutor (combiné)

```typescript
import { createResilientExecutor } from './utils/circuit-breaker';

const executor = createResilientExecutor('connector-name');

// Circuit breaker + retry automatique
await executor.execute(async () => {
  return await bankAPI.sendPayment(payment);
});
```

---

## 📊 Parser MT940

### Parsing SWIFT MT940

```typescript
import { parseMT940 } from './utils/mt940-parser';

const mt940Content = `
:20:REFERENCE123
:25:FR7612345678901234567890123
:28C:00001/001
:60F:C230515EUR100000,00
:61:2305151505DR123,45NTRFNONREF//1234567890
:86:Payment for invoice INV-001
:62F:C230515EUR99876,55
`;

const lines = parseMT940(mt940Content);
// [
//   {
//     statement_date: '2023-05-15',
//     value_date: '2023-05-15',
//     amount: -123.45,
//     currency: 'EUR',
//     debit_credit: 'debit',
//     description: 'Payment for invoice INV-001',
//     reference: 'NONREF',
//     ...
//   }
// ]
```

### Parsing CSV

```typescript
import { parseCSVStatement } from './utils/mt940-parser';

const csvContent = `
Date,Description,Amount,Currency,Reference
2023-05-15,"Payment from client",1500.00,XOF,INV-001
2023-05-16,"Bank fees",-25.00,XOF,FEE-001
`;

const lines = parseCSVStatement(csvContent, 'XOF');
```

---

## 🚀 REST Sandbox Connector

### Configuration

```json
{
  "bank_profile_id": "uuid-of-bank",
  "connector_type": "rest",
  "priority": 10,
  "config": {
    "endpoint": "https://sandbox-bank.example/api/v1",
    "vault_secret_key": "vault:bank/sandbox/api_key",
    "vault_hmac_key": "vault:bank/sandbox/hmac",
    "timeout_ms": 15000,
    "retry_attempts": 3
  }
}
```

### Utilisation

```typescript
import { RestSandboxConnector } from './connectors/rest-sandbox-connector';

const connector = new RestSandboxConnector();
await connector.init(config);

// Envoyer un paiement
const result = await connector.sendPayment({
  id: 'slice-123',
  parent_payout_id: 'payout-456',
  slice_amount: 1000.00,
  currency: 'XOF',
  beneficiary: {
    name: 'Aminata Diallo',
    bank_account: {
      iban: 'SN08SN0100152000048500019761',
      bank_name: 'CBAO Senegal'
    }
  },
  idempotency_key: 'payout-456-attempt-0'
});

// { status: 'sent', provider_ref: 'TXN123456' }

// Vérifier le statut
const status = await connector.getPaymentStatus('TXN123456');
// { status: 'completed', settlement_date: '2023-05-16' }

// Health check
const health = await connector.healthcheck();
// { healthy: true, latency_ms: 45 }
```

---

## 📈 Observabilité

### Logs structurés

Tous les appels sont loggés dans `bank_connector_logs` :

```sql
SELECT
  operation,
  status,
  duration_ms,
  error_message,
  trace_id
FROM bank_connector_logs
WHERE connector_id = 'uuid'
ORDER BY created_at DESC
LIMIT 100;
```

### Métriques Prometheus (à implémenter)

```
molam_bank_connector_requests_total{connector="rest-sandbox",operation="sendPayment"} 1250
molam_bank_connector_success_total{connector="rest-sandbox"} 1180
molam_bank_connector_failures_total{connector="rest-sandbox"} 70
molam_bank_connector_latency_seconds{connector="rest-sandbox",quantile="0.95"} 0.245
molam_bank_connector_circuit_breaker_state{connector="rest-sandbox"} 0  # 0=closed, 1=open, 2=half_open
```

### Tracing

Chaque opération reçoit un `trace_id` pour le tracing distribué :

```typescript
const context: ConnectorContext = {
  trace_id: crypto.randomUUID(),
  connector_id: 'connector-uuid',
  operation: 'sendPayment',
  timestamp: new Date()
};

await connector.sendPayment(slice, context);
```

---

## 🧪 Tests

### Tests unitaires (à implémenter)

```bash
npm test brique-121
```

Structure des tests :

```typescript
// tests/rest-connector.spec.ts
describe('REST Sandbox Connector', () => {
  it('should send payment and return provider_ref', async () => {
    const connector = new RestSandboxConnector();
    await connector.init(mockConfig);

    const result = await connector.sendPayment(mockSlice);

    expect(result.status).toBe('sent');
    expect(result.provider_ref).toBeDefined();
  });

  it('should respect idempotency', async () => {
    // Test double envoi avec même idempotency_key
  });

  it('should handle timeout gracefully', async () => {
    // Test timeout avec retry
  });
});
```

---

## 🔧 Configuration par environnement

### Development

```env
# Vault (local dev)
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=dev-only-token

# HSM (mock)
HSM_TYPE=mock
HSM_KEY_ID=default-signing-key

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/molam_connect
```

### Production

```env
# Vault (prod)
VAULT_ADDR=https://vault.molam.internal
VAULT_ROLE_ID=<from-k8s-secret>
VAULT_SECRET_ID=<from-k8s-secret>
VAULT_NAMESPACE=molam-production

# HSM (AWS CloudHSM)
HSM_TYPE=aws_cloudhsm
HSM_ENDPOINT=https://cloudhsm.us-east-1.amazonaws.com
HSM_KEY_ID=prod-signing-key-2024

# Database (RDS)
DATABASE_URL=postgresql://molam:***@rds.amazonaws.com:5432/molam_production
```

---

## 📦 Déploiement

### Installation locale

```bash
cd brique-121

# Installer les dépendances (si package.json existe)
npm install

# Créer le schéma database
psql $DATABASE_URL < database/schema.sql

# Lancer Vault en dev mode
vault server -dev

# Insérer des secrets de test
vault kv put secret/bank/sandbox/api_key value="test-key-123"
vault kv put secret/bank/sandbox/hmac value="hmac-secret-456"
```

### Kubernetes (à implémenter)

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bank-connector-worker
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: worker
        image: molam/bank-connector:1.0.0
        env:
        - name: VAULT_ADDR
          value: "https://vault.molam.internal"
        - name: VAULT_ROLE_ID
          valueFrom:
            secretKeyRef:
              name: vault-creds
              key: role_id
      - name: vault-sidecar
        image: vault:1.15
        # Vault agent pour injection de secrets
```

---

## 🛠️ Prochaines étapes

### Phase 1 (Sprint 1)
- [ ] Implémenter MT940/SFTP Connector
- [ ] Implémenter ISO20022 Connector
- [ ] Créer Connector Manager (factory)
- [ ] Implémenter Dispatcher Worker

### Phase 2 (Sprint 2)
- [ ] Ajouter métriques Prometheus
- [ ] Créer API routes de gestion
- [ ] Tests unitaires (80% coverage)
- [ ] Tests d'intégration E2E

### Phase 3 (Sprint 3)
- [ ] Déploiement Kubernetes
- [ ] Runbook opérationnel
- [ ] Monitoring & alerting
- [ ] Documentation produit

---

## 📚 Références

### Standards
- **MT940**: SWIFT Customer Statement Message
- **ISO20022**: Universal Financial Industry Message Scheme
  - pain.001: Customer Credit Transfer Initiation
  - camt.053: Bank to Customer Statement
- **mTLS**: Mutual TLS Authentication
- **HMAC**: Hash-based Message Authentication Code

### Technologies
- **HashiCorp Vault**: Secrets management
- **PostgreSQL**: Database
- **TypeScript**: Type-safe development
- **Node.js**: Runtime
- **Kubernetes**: Container orchestration

---

## 🤝 Support

Pour toute question ou problème :
- 📧 Email: tech@molam.sn
- 📖 Docs: [Internal Confluence](https://molam.atlassian.net)
- 🐛 Issues: [GitHub Issues](https://github.com/molam/molam-connect/issues)

---

## ⚖️ License

Proprietary - Molam Financial Technology © 2024

---

**Status**: 🚧 En développement - Phase 1 complétée à 60%

**Dernière mise à jour**: 2025-11-18
