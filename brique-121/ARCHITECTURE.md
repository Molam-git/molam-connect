# 🏗️ Brique 121 — Architecture

## Vue d'ensemble

La Brique 121 fournit une **infrastructure industrielle de connecteurs bancaires** permettant à Molam Connect de s'interfacer avec différents types de banques et PSP via plusieurs protocoles.

---

## 📐 Architecture globale

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Molam Connect Platform                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Brique 121 - Bank Connectors               │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                              │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐           │  │
│  │  │    REST    │  │   MT940    │  │  ISO20022  │           │  │
│  │  │ Connector  │  │ Connector  │  │ Connector  │  ...      │  │
│  │  └────────────┘  └────────────┘  └────────────┘           │  │
│  │        ↑               ↑               ↑                    │  │
│  │        └───────────────┴───────────────┘                    │  │
│  │                        │                                    │  │
│  │           ┌────────────┴────────────┐                       │  │
│  │           │  Connector Manager      │                       │  │
│  │           │  - Factory Pattern      │                       │  │
│  │           │  - Priority Selection   │                       │  │
│  │           │  - Lifecycle Mgmt       │                       │  │
│  │           └────────────┬────────────┘                       │  │
│  │                        │                                    │  │
│  │           ┌────────────┴────────────┐                       │  │
│  │           │  Dispatcher Worker      │                       │  │
│  │           │  - Poll payout_slices   │                       │  │
│  │           │  - Execute payments     │                       │  │
│  │           │  - Update statuses      │                       │  │
│  │           └─────────────────────────┘                       │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Supporting Infrastructure                   │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                              │  │
│  │  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐   │  │
│  │  │ Circuit       │  │ Retry Logic   │  │ MT940        │   │  │
│  │  │ Breaker       │  │ (Exp Backoff) │  │ Parser       │   │  │
│  │  └───────────────┘  └───────────────┘  └──────────────┘   │  │
│  │                                                              │  │
│  │  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐   │  │
│  │  │ Vault Client  │  │ HSM Manager   │  │ Logger       │   │  │
│  │  │ (Secrets)     │  │ (Signing)     │  │ (Audit)      │   │  │
│  │  └───────────────┘  └───────────────┘  └──────────────┘   │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                    ↓         ↓          ↓          ↓
        ┌───────────────┬──────────────┬──────────┬────────────┐
        ↓               ↓              ↓          ↓            ↓
   PostgreSQL       Vault           Redis     S3          Banks/PSPs
   (Database)     (Secrets)       (Cache)  (Files)    (External APIs)
```

---

## 🔌 Architecture des Connecteurs

### Interface commune BankConnector

Tous les connecteurs implémentent la même interface :

```typescript
interface BankConnector {
  name: string;
  type: 'rest' | 'mt940' | 'iso20022' | 'local' | 'csv';

  // Lifecycle
  init(config: ConnectorConfig): Promise<void>;
  shutdown?(): Promise<void>;

  // Payment operations
  sendPayment(slice: PayoutSlice): Promise<BankSendResult>;
  getPaymentStatus(providerRef: string): Promise<BankPaymentStatus>;

  // Statement operations
  uploadStatement(file: Buffer, meta: Metadata): Promise<{ imported_id: string }>;
  parseStatement(importedId: string): Promise<BankStatementLine[]>;

  // Health
  healthcheck(): Promise<HealthCheckResult>;
}
```

### Flux de paiement typique

```
1. Dispatcher Worker poll payout_slices (status='pending')
              ↓
2. Load connector via Connector Manager
              ↓
3. Execute avec Circuit Breaker + Retry
              ↓
4. Connector.sendPayment() → Bank API
              ↓
5. Bank response avec provider_ref
              ↓
6. Update payout_slice (status='sent', provider_ref)
              ↓
7. Log execution dans bank_connector_logs
              ↓
8. [Later] Poll status via getPaymentStatus()
              ↓
9. Update status → 'settled'
```

---

## 🗄️ Architecture Database

### ERD (Entity Relationship Diagram)

```
┌─────────────────────┐
│   bank_profiles     │
│─────────────────────│
│ id (PK)             │
│ bank_name           │
│ swift_bic           │
│ supported_rails[]   │
└─────────────────────┘
          │
          │ 1:N
          ↓
┌────────────────────────────┐
│ bank_connectors_registry   │
│────────────────────────────│
│ id (PK)                    │
│ bank_profile_id (FK)       │
│ connector_type             │
│ config (JSONB)             │
│ circuit_breaker_state      │
│ failure_count              │
└────────────────────────────┘
          │
          │ 1:N
          ↓
┌────────────────────────────┐
│ bank_connector_logs        │
│────────────────────────────│
│ id (PK)                    │
│ connector_id (FK)          │
│ operation                  │
│ trace_id                   │
│ status                     │
│ duration_ms                │
└────────────────────────────┘

┌────────────────────────────┐
│ bank_statements_raw        │
│────────────────────────────│
│ id (PK)                    │
│ bank_profile_id (FK)       │
│ file_s3_key                │
│ file_hash (dedup)          │
│ parsed (JSONB)             │
│ status                     │
└────────────────────────────┘
          │
          │ 1:N
          ↓
┌────────────────────────────┐
│ bank_statement_lines       │
│────────────────────────────│
│ id (PK)                    │
│ raw_statement_id (FK)      │
│ bank_profile_id (FK)       │
│ statement_date             │
│ amount                     │
│ reference                  │
│ reconciliation_status      │
│ matched_payout_id (FK)     │
└────────────────────────────┘

┌────────────────────────────┐
│ payout_slices              │
│────────────────────────────│
│ id (PK)                    │
│ parent_payout_id           │
│ treasury_account_id (FK)   │
│ slice_amount               │
│ status                     │
│ provider_ref               │
│ connector_id (FK)          │
│ idempotency_key (UNIQUE)   │
└────────────────────────────┘
```

### Indexes clés

```sql
-- Performance critiques
CREATE INDEX idx_ps_status ON payout_slices(status);
CREATE INDEX idx_bsl_reconciliation ON bank_statement_lines(reconciliation_status);
CREATE INDEX idx_bcl_trace ON bank_connector_logs(trace_id);
CREATE INDEX idx_bsr_hash ON bank_statements_raw(file_hash);
```

---

## 🔐 Architecture Sécurité

### Vault Integration

```
┌─────────────────────────────────────────────┐
│              Application Pod                │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │    Vault Sidecar Container           │  │
│  │  - Agent Injector                    │  │
│  │  - Auto-auth with AppRole            │  │
│  │  - Token renewal                     │  │
│  │  - Secrets injection                 │  │
│  └──────────────────────────────────────┘  │
│              ↓ (shared volume)             │
│  ┌──────────────────────────────────────┐  │
│  │    Main Application Container        │  │
│  │  - VaultClient                       │  │
│  │  - Read secrets from /vault/secrets  │  │
│  │  - resolveConnectorConfig()          │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
              ↓
    ┌────────────────┐
    │   Vault HA     │
    │   Cluster      │
    └────────────────┘
```

### Secrets Hierarchy

```
secret/
├── bank/
│   ├── sandbox/
│   │   ├── api_key
│   │   ├── hmac
│   │   └── mtls_cert (cert, key, ca)
│   ├── prod/
│   │   ├── citibank/
│   │   │   ├── api_key
│   │   │   ├── hmac
│   │   │   └── mtls_cert
│   │   └── bgfi/
│   │       ├── sftp_password
│   │       └── iso20022_cert
│   └── hsm/
│       ├── signing_key_id
│       └── encryption_key_id
└── ops/
    ├── database/
    │   ├── username (dynamic)
    │   └── password (dynamic)
    └── pagerduty/
        └── api_key
```

### HSM Signing Flow

```
┌──────────────────┐
│  Connector       │
│  (ISO20022)      │
└────────┬─────────┘
         │ 1. Generate pain.001 XML
         ↓
┌──────────────────┐
│  HSM Manager     │
└────────┬─────────┘
         │ 2. signXmlWithHSM()
         ↓
┌──────────────────┐
│  AWS CloudHSM    │
│  or Mock HSM     │
└────────┬─────────┘
         │ 3. Return signature
         ↓
┌──────────────────┐
│  Signed XML      │
│  + Signature     │
└──────────────────┘
```

---

## 🔄 Circuit Breaker Architecture

### État Machine

```
          ┌─────────┐
    ┌─────│ CLOSED  │◄────┐
    │     └─────────┘     │
    │                     │
    │ Failures ≥          │ Successes ≥
    │ threshold           │ threshold
    │                     │
    ↓                     │
┌─────────┐          ┌────────────┐
│  OPEN   │─────────→│ HALF_OPEN  │
└─────────┘          └────────────┘
  timeout              test calls
```

### Métriques par Connector

```sql
-- Circuit breaker stats
SELECT
  bcr.connector_type,
  bcr.circuit_breaker_state,
  bcr.failure_count,
  COUNT(bcl.id) FILTER (WHERE bcl.status = 'success') as successes_1h,
  COUNT(bcl.id) FILTER (WHERE bcl.status = 'failed') as failures_1h,
  AVG(bcl.duration_ms) as avg_latency_ms
FROM bank_connectors_registry bcr
LEFT JOIN bank_connector_logs bcl
  ON bcl.connector_id = bcr.id
  AND bcl.created_at > now() - interval '1 hour'
GROUP BY bcr.id, bcr.connector_type, bcr.circuit_breaker_state, bcr.failure_count;
```

---

## 📊 Observability Architecture

### Métriques Prometheus (à implémenter)

```
molam_bank_connector_requests_total{connector, operation, status}
molam_bank_connector_latency_seconds{connector, quantile}
molam_bank_connector_circuit_state{connector}
molam_bank_statement_lines_unmatched{bank_profile}
molam_payout_slices_pending{currency}
```

### Logs structurés

```json
{
  "timestamp": "2025-11-18T10:30:45.123Z",
  "level": "info",
  "connector_id": "uuid",
  "connector_type": "rest",
  "operation": "sendPayment",
  "trace_id": "trace-uuid",
  "duration_ms": 245,
  "status": "success",
  "provider_ref": "TXN123456",
  "payout_slice_id": "slice-uuid"
}
```

### Tracing distribué

```
Trace: payment-flow-trace-uuid
├─ Span: dispatcher.pollSlices (10ms)
├─ Span: manager.loadConnector (5ms)
├─ Span: connector.sendPayment (245ms)
│  ├─ Span: vault.getSecret (15ms)
│  ├─ Span: hmac.sign (2ms)
│  ├─ Span: http.post (220ms)
│  └─ Span: log.execution (3ms)
└─ Span: db.updateSlice (8ms)
```

---

## 🚀 Deployment Architecture

### Kubernetes

```
┌──────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Namespace: bank-connectors-prod                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────┐    │  │
│  │  │  Deployment: connector-worker (3 pods)   │    │  │
│  │  │                                          │    │  │
│  │  │  ┌────────────────────────────────────┐ │    │  │
│  │  │  │  Pod 1                             │ │    │  │
│  │  │  │  - App Container                   │ │    │  │
│  │  │  │  - Vault Sidecar                   │ │    │  │
│  │  │  │  Resources: 512Mi RAM, 500m CPU    │ │    │  │
│  │  │  └────────────────────────────────────┘ │    │  │
│  │  │                                          │    │  │
│  │  │  ┌────────────────────────────────────┐ │    │  │
│  │  │  │  Pod 2 (same)                      │ │    │  │
│  │  │  └────────────────────────────────────┘ │    │  │
│  │  │                                          │    │  │
│  │  │  ┌────────────────────────────────────┐ │    │  │
│  │  │  │  Pod 3 (same)                      │ │    │  │
│  │  │  └────────────────────────────────────┘ │    │  │
│  │  │                                          │    │  │
│  │  └──────────────────────────────────────────┘    │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────┐    │  │
│  │  │  Service: connector-metrics              │    │  │
│  │  │  - Port 9090 → Prometheus scraping       │    │  │
│  │  └──────────────────────────────────────────┘    │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────┐    │  │
│  │  │  ConfigMap: connector-config             │    │  │
│  │  │  - Non-sensitive config                  │    │  │
│  │  └──────────────────────────────────────────┘    │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────┐    │  │
│  │  │  Secret: vault-approle                   │    │  │
│  │  │  - VAULT_ROLE_ID                         │    │  │
│  │  │  - VAULT_SECRET_ID                       │    │  │
│  │  └──────────────────────────────────────────┘    │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────┐    │  │
│  │  │  HPA: Horizontal Pod Autoscaler          │    │  │
│  │  │  - Min: 3, Max: 10                       │    │  │
│  │  │  - CPU: 70%                              │    │  │
│  │  └──────────────────────────────────────────┘    │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Infrastructure externe

```
┌─────────────────────────────────────────────┐
│           AWS / Cloud Infrastructure        │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐  ┌──────────────┐        │
│  │   RDS PG     │  │   Vault HA   │        │
│  │  Multi-AZ    │  │   Cluster    │        │
│  └──────────────┘  └──────────────┘        │
│                                             │
│  ┌──────────────┐  ┌──────────────┐        │
│  │  Redis       │  │  S3 Bucket   │        │
│  │  Cluster     │  │  (Statements)│        │
│  └──────────────┘  └──────────────┘        │
│                                             │
│  ┌──────────────┐  ┌──────────────┐        │
│  │  CloudHSM    │  │  CloudWatch  │        │
│  │              │  │  Logs        │        │
│  └──────────────┘  └──────────────┘        │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### 1. Envoi de paiement

```
User/API Request
      ↓
Create payout (B120ter)
      ↓
Split into payout_slices
      ↓
payout_slices.status = 'pending'
      ↓
Dispatcher Worker polls
      ↓
Load connector for treasury_account.bank_profile_id
      ↓
Connector.sendPayment() via Circuit Breaker + Retry
      ↓
Bank API responds
      ↓
Update payout_slices (status='sent', provider_ref)
      ↓
Log to bank_connector_logs
      ↓
[Later] Poll status → Update to 'settled'
      ↓
Trigger webhook to merchant
```

### 2. Ingestion de relevé bancaire

```
SFTP Server (Bank)
      ↓
MT940 Connector polls
      ↓
Download file → S3
      ↓
Insert bank_statements_raw (file_s3_key, file_hash)
      ↓
Parse MT940 → BankStatementLine[]
      ↓
Insert bank_statement_lines (reconciliation_status='unmatched')
      ↓
Archive/move file on SFTP
      ↓
[Auto-reconciliation]
Match reference with payout_slices.reference_code
      ↓
Update bank_statement_lines.matched_payout_id
      ↓
Update payout_slices.status = 'settled'
      ↓
Trigger settlement webhook
```

---

## 🎯 Décisions d'architecture

### 1. Interface commune BankConnector
**Pourquoi ?**
- Uniformité : Tous les connecteurs ont la même API
- Testabilité : Mock facile pour les tests
- Extensibilité : Ajouter de nouveaux connecteurs sans changer le core
- Maintenance : Code découplé et modulaire

### 2. Circuit Breaker + Retry
**Pourquoi ?**
- Resilience : Protection contre pannes en cascade
- Performance : Fail fast quand le service est down
- Observabilité : Métriques sur la santé des connecteurs
- Coût : Évite les appels inutiles pendant les pannes

### 3. Vault pour secrets
**Pourquoi ?**
- Sécurité : Jamais de secrets en DB ou logs
- Rotation : Rotation automatique des secrets
- Audit : Logs d'accès complets
- Compliance : Répond aux exigences PCI DSS, ISO27001

### 4. HSM pour signatures
**Pourquoi ?**
- Sécurité : Clés privées jamais exposées
- Compliance : Requis pour ISO20022 par certaines banques
- Non-répudiation : Signatures cryptographiques vérifiables
- Audit : Traçabilité complète

### 5. Idempotency keys
**Pourquoi ?**
- Reliability : Évite les paiements dupliqués
- Retry safety : Peut retry sans risque
- Reconciliation : Mapping 1:1 payout → transaction
- Compliance : Audit trail clair

### 6. Normalized statement lines
**Pourquoi ?**
- Reconciliation : Format unifié pour matcher
- Multi-source : Support MT940, CSV, camt.053, etc.
- Performance : Indexes sur reference, amount, date
- Analytics : Queries faciles pour reporting

---

## 📐 Design Patterns

### 1. Factory Pattern
- **Manager.ts** : Crée le bon connector selon le type
- Avantage : Découplage, easy extension

### 2. Strategy Pattern
- **BankConnector interface** : Chaque connector = stratégie différente
- Avantage : Swap connectors à runtime

### 3. Circuit Breaker Pattern
- Protection contre cascading failures
- Avantage : Fail fast, économie de ressources

### 4. Retry Pattern
- Exponential backoff avec jitter
- Avantage : Resilience transient errors

### 5. Repository Pattern
- DB access via clean interfaces
- Avantage : Testabilité, découplage

### 6. Observer Pattern
- Circuit breaker events (open, closed, etc.)
- Avantage : Observabilité, alerting

---

## 🔮 Évolution future

### Phase 3 (post-MVP)
- **Machine Learning** : Predict payment failures
- **Smart routing** : Route vers meilleur connector
- **Auto-reconciliation ML** : Match fuzzy references
- **Fraud detection** : Intégration avec SIRA
- **Multi-region** : Deploy régional pour latency
- **GraphQL API** : Query flexible pour dashboards

---

**Version**: 1.0.0-beta
**Dernière mise à jour**: 2025-11-18
**Équipe**: Molam Backend Engineering
