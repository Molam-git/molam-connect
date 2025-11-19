# 📂 Brique 121 — File Structure

## Arborescence complète du projet

```
brique-121/
│
├── 📚 DOCUMENTATION (Phase 1 - ✅ Complète)
│   ├── INDEX.md                            ← Point d'entrée documentation
│   ├── EXECUTIVE_SUMMARY.md                ← Vue business & ROI (pour management)
│   ├── README.md                           ← Documentation technique complète
│   ├── QUICKSTART.md                       ← Guide démarrage rapide avec exemples
│   ├── ARCHITECTURE.md                     ← Architecture détaillée avec diagrammes
│   ├── IMPLEMENTATION_SUMMARY.md           ← État d'avancement & métriques
│   ├── CHANGELOG.md                        ← Historique des versions
│   └── FILE_STRUCTURE.md                   ← Ce fichier
│
├── ⚙️ CONFIGURATION (Phase 1 - ✅ Complète)
│   ├── package.json                        ← Dependencies Node.js
│   ├── tsconfig.json                       ← Configuration TypeScript
│   ├── .env.example                        ← Template variables d'environnement
│   └── .gitignore                          ← Git ignore rules
│
├── 🗄️ DATABASE (Phase 1 - ✅ Complète)
│   └── database/
│       └── schema.sql                      ← Schéma PostgreSQL complet (320 lignes)
│           ├── bank_profiles
│           ├── bank_connectors_registry
│           ├── bank_statements_raw
│           ├── bank_statement_lines
│           ├── bank_connector_logs
│           ├── bank_connector_secrets
│           ├── payout_slices
│           └── treasury_accounts
│
├── 💻 SOURCE CODE (Phase 1 - ✅ 70% Complète)
│   └── src/
│       │
│       ├── index.ts                        ← Main exports (50 lignes)
│       │
│       ├── types.ts                        ← TypeScript interfaces (700 lignes)
│       │   ├── BankConnector interface
│       │   ├── PayoutSlice, BankSendResult
│       │   ├── BankStatementLine
│       │   ├── ConnectorConfig, ConnectorContext
│       │   ├── Error classes (ConnectorError, TimeoutError, etc.)
│       │   └── Type guards & utilities
│       │
│       ├── 🔌 CONNECTORS (Phase 1 - ✅ 33% Complète)
│       │   └── connectors/
│       │       ├── rest-sandbox-connector.ts    ← REST API connector (400 lignes) ✅
│       │       ├── mt940-connector.ts           ← MT940/SFTP connector ⏳ Phase 2
│       │       ├── iso20022-connector.ts        ← ISO20022 connector ⏳ Phase 2
│       │       ├── manager.ts                   ← Connector factory ⏳ Phase 2
│       │       └── logger.ts                    ← Audit logger (50 lignes) ✅
│       │
│       └── 🛠️ UTILITIES (Phase 1 - ✅ 100% Complète)
│           └── utils/
│               ├── vault.ts                ← HashiCorp Vault client (500 lignes)
│               │   ├── VaultClient avec AppRole auth
│               │   ├── Auto-renewal tokens
│               │   ├── Cache in-memory
│               │   ├── KV v2 support
│               │   ├── Dynamic secrets
│               │   ├── Transit encryption
│               │   └── resolveConnectorConfig()
│               │
│               ├── hsm.ts                  ← HSM signing utilities (400 lignes)
│               │   ├── HSMProvider interface
│               │   ├── MockHSMProvider
│               │   ├── AWSCloudHSMProvider (stub)
│               │   ├── HSMManager
│               │   ├── XML signing (ISO20022)
│               │   ├── HMAC signing
│               │   ├── mTLS certificate loading
│               │   └── Signature verification
│               │
│               ├── circuit-breaker.ts      ← Circuit breaker & retry (600 lignes)
│               │   ├── CircuitBreaker (CLOSED → OPEN → HALF_OPEN)
│               │   ├── RetryExecutor (exponential backoff + jitter)
│               │   ├── ResilientExecutor (combined)
│               │   ├── CircuitBreakerRegistry
│               │   └── Event-driven architecture
│               │
│               └── mt940-parser.ts         ← MT940 parser (500 lignes)
│                   ├── parseMT940() - SWIFT format
│                   ├── parseCSVStatement() - CSV format
│                   ├── validateMT940() - Balance validation
│                   ├── MT940Statement, MT940Transaction types
│                   └── Normalize to BankStatementLine[]
│
├── 🏃 WORKERS (Phase 2 - ⏳ À implémenter)
│   └── src/
│       └── workers/
│           └── dispatcher.ts               ← Dispatcher worker ⏳ Phase 2
│               ├── Poll payout_slices
│               ├── Load connector
│               ├── Execute payments
│               ├── Update statuses
│               └── DLQ management
│
├── 🌐 API ROUTES (Phase 2 - ⏳ À implémenter)
│   └── src/
│       └── routes/
│           └── connectors.ts               ← API routes ⏳ Phase 2
│               ├── GET /api/v1/connectors
│               ├── POST /api/v1/connectors
│               ├── PUT /api/v1/connectors/:id
│               ├── DELETE /api/v1/connectors/:id
│               └── POST /api/v1/connectors/:id/health
│
├── 📊 METRICS (Phase 2 - ⏳ À implémenter)
│   └── src/
│       └── metrics/
│           └── prometheus.ts               ← Prometheus metrics ⏳ Phase 2
│               ├── molam_bank_connector_requests_total
│               ├── molam_bank_connector_latency_seconds
│               ├── molam_bank_connector_circuit_state
│               └── /metrics endpoint
│
├── 🧪 TESTS (Phase 2 - ⏳ À implémenter)
│   └── tests/
│       ├── rest-connector.spec.ts          ⏳ Phase 2
│       ├── mt940-connector.spec.ts         ⏳ Phase 2
│       ├── iso20022-connector.spec.ts      ⏳ Phase 2
│       ├── circuit-breaker.spec.ts         ⏳ Phase 2
│       ├── mt940-parser.spec.ts            ⏳ Phase 2
│       ├── vault.spec.ts                   ⏳ Phase 2
│       └── integration/
│           └── e2e.spec.ts                 ⏳ Phase 2
│
├── 🐳 KUBERNETES (Phase 2 - ⏳ À implémenter)
│   └── k8s/
│       ├── namespace.yaml                  ⏳ Phase 2
│       ├── deployment.yaml                 ⏳ Phase 2
│       ├── service.yaml                    ⏳ Phase 2
│       ├── configmap.yaml                  ⏳ Phase 2
│       ├── secret.yaml                     ⏳ Phase 2
│       ├── vault-sidecar.yaml              ⏳ Phase 2
│       ├── rbac.yaml                       ⏳ Phase 2
│       └── hpa.yaml                        ⏳ Phase 2
│
├── 📜 SCRIPTS
│   └── scripts/
│       ├── setup.sh                        ← Script d'installation ✅
│       ├── vault-setup.sh                  ⏳ Phase 2
│       └── deploy.sh                       ⏳ Phase 2
│
└── 📦 BUILD OUTPUT (généré)
    └── dist/                               ← Compiled TypeScript (git ignored)
        ├── index.js
        ├── index.d.ts
        ├── types.js
        ├── types.d.ts
        ├── connectors/
        └── utils/
```

---

## 📊 Statistiques détaillées

### Fichiers par catégorie

| Catégorie | Fichiers | Lignes | Status |
|-----------|----------|--------|--------|
| **Documentation** | 8 | 4,500+ | ✅ 100% |
| **Configuration** | 4 | 250 | ✅ 100% |
| **Database** | 1 | 320 | ✅ 100% |
| **Source Code** | | | |
| → Types | 1 | 700 | ✅ 100% |
| → Connectors | 2 | 450 | ✅ 50% (1/2) |
| → Utils | 4 | 2,000 | ✅ 100% |
| **Scripts** | 1 | 100 | ✅ 100% |
| **Tests** | 0 | 0 | ⏳ 0% |
| **K8s** | 0 | 0 | ⏳ 0% |
| **TOTAL PHASE 1** | **21** | **8,320** | **✅ 70%** |

### Répartition du code (Phase 1)

```
Documentation    : 4,500 lignes (54%)
TypeScript Code  : 3,150 lignes (38%)
SQL Schema       : 320 lignes (4%)
Configuration    : 250 lignes (3%)
Scripts          : 100 lignes (1%)
```

### Fichiers critiques (Top 10)

| Rank | Fichier | Lignes | Priorité |
|------|---------|--------|----------|
| 1 | README.md | 900 | ⭐⭐⭐ |
| 2 | ARCHITECTURE.md | 800 | ⭐⭐⭐ |
| 3 | IMPLEMENTATION_SUMMARY.md | 800 | ⭐⭐ |
| 4 | types.ts | 700 | ⭐⭐⭐ |
| 5 | QUICKSTART.md | 700 | ⭐⭐⭐ |
| 6 | EXECUTIVE_SUMMARY.md | 600 | ⭐⭐ |
| 7 | circuit-breaker.ts | 600 | ⭐⭐⭐ |
| 8 | vault.ts | 500 | ⭐⭐⭐ |
| 9 | mt940-parser.ts | 500 | ⭐⭐ |
| 10 | hsm.ts | 400 | ⭐⭐ |

---

## 🎯 Fichiers par phase

### Phase 1 (✅ Complétée)

**Documentation** :
- ✅ INDEX.md
- ✅ EXECUTIVE_SUMMARY.md
- ✅ README.md
- ✅ QUICKSTART.md
- ✅ ARCHITECTURE.md
- ✅ IMPLEMENTATION_SUMMARY.md
- ✅ CHANGELOG.md
- ✅ FILE_STRUCTURE.md

**Configuration** :
- ✅ package.json
- ✅ tsconfig.json
- ✅ .env.example
- ✅ .gitignore

**Database** :
- ✅ database/schema.sql

**Code** :
- ✅ src/index.ts
- ✅ src/types.ts
- ✅ src/connectors/rest-sandbox-connector.ts
- ✅ src/connectors/logger.ts
- ✅ src/utils/vault.ts
- ✅ src/utils/hsm.ts
- ✅ src/utils/circuit-breaker.ts
- ✅ src/utils/mt940-parser.ts

**Scripts** :
- ✅ scripts/setup.sh

**Total Phase 1** : **21 fichiers, 8,320 lignes**

---

### Phase 2 (⏳ À faire)

**Code** :
- ⏳ src/connectors/mt940-connector.ts (300 lignes)
- ⏳ src/connectors/iso20022-connector.ts (400 lignes)
- ⏳ src/connectors/manager.ts (200 lignes)
- ⏳ src/workers/dispatcher.ts (300 lignes)
- ⏳ src/routes/connectors.ts (250 lignes)
- ⏳ src/metrics/prometheus.ts (150 lignes)

**Tests** :
- ⏳ tests/rest-connector.spec.ts (150 lignes)
- ⏳ tests/mt940-connector.spec.ts (150 lignes)
- ⏳ tests/iso20022-connector.spec.ts (150 lignes)
- ⏳ tests/circuit-breaker.spec.ts (100 lignes)
- ⏳ tests/mt940-parser.spec.ts (100 lignes)
- ⏳ tests/vault.spec.ts (100 lignes)
- ⏳ tests/integration/e2e.spec.ts (150 lignes)

**K8s** :
- ⏳ k8s/namespace.yaml (20 lignes)
- ⏳ k8s/deployment.yaml (100 lignes)
- ⏳ k8s/service.yaml (30 lignes)
- ⏳ k8s/configmap.yaml (50 lignes)
- ⏳ k8s/secret.yaml (20 lignes)
- ⏳ k8s/vault-sidecar.yaml (80 lignes)
- ⏳ k8s/rbac.yaml (50 lignes)
- ⏳ k8s/hpa.yaml (30 lignes)

**Scripts** :
- ⏳ scripts/vault-setup.sh (100 lignes)
- ⏳ scripts/deploy.sh (150 lignes)

**Documentation** :
- ⏳ RUNBOOK.md (600 lignes)

**Total Phase 2** : **22 fichiers, 3,380 lignes**

---

## 🔍 Navigation rapide

### Par fonctionnalité

**Authentification & Sécurité** :
- [src/utils/vault.ts](src/utils/vault.ts) - Vault secrets management
- [src/utils/hsm.ts](src/utils/hsm.ts) - HSM signing
- [database/schema.sql](database/schema.sql) - bank_connector_secrets table

**Connecteurs** :
- [src/connectors/rest-sandbox-connector.ts](src/connectors/rest-sandbox-connector.ts) - REST API
- ⏳ src/connectors/mt940-connector.ts - MT940/SFTP
- ⏳ src/connectors/iso20022-connector.ts - ISO20022

**Resilience** :
- [src/utils/circuit-breaker.ts](src/utils/circuit-breaker.ts) - Circuit breaker + retry

**Parsing** :
- [src/utils/mt940-parser.ts](src/utils/mt940-parser.ts) - MT940/CSV parser

**Observability** :
- [src/connectors/logger.ts](src/connectors/logger.ts) - Audit logger
- ⏳ src/metrics/prometheus.ts - Metrics

**Infrastructure** :
- [database/schema.sql](database/schema.sql) - Database schema
- ⏳ k8s/ - Kubernetes manifests

---

## 📏 Métriques de qualité

### Complexité du code

| Fichier | Lignes | Fonctions | Complexité |
|---------|--------|-----------|------------|
| circuit-breaker.ts | 600 | 25 | Moyenne |
| vault.ts | 500 | 18 | Moyenne |
| mt940-parser.ts | 500 | 12 | Faible |
| hsm.ts | 400 | 15 | Faible |
| rest-sandbox-connector.ts | 400 | 10 | Faible |
| types.ts | 700 | 0 (types only) | N/A |

### Couverture documentation

- ✅ README.md : Complète (900 lignes)
- ✅ Inline comments : Moyenne
- ✅ JSDoc : Partielle
- ✅ Architecture : Excellente (800 lignes)
- ⏳ API docs : À générer (Phase 2)

### Qualité TypeScript

- ✅ Strict mode : Activé
- ✅ No implicit any : Oui
- ✅ Strict null checks : Oui
- ✅ ESLint : Configuré
- ✅ Prettier : Configuré

---

## 🎨 Conventions de nommage

### Fichiers

- **Kebab-case** : `rest-sandbox-connector.ts`
- **PascalCase** : Classes uniquement (`RestSandboxConnector`)
- **UPPERCASE** : Documentation (`README.md`)

### Code

- **Interfaces** : `PascalCase` (ex: `BankConnector`)
- **Types** : `PascalCase` (ex: `PayoutSlice`)
- **Fonctions** : `camelCase` (ex: `sendPayment`)
- **Variables** : `camelCase` (ex: `providerRef`)
- **Constantes** : `UPPER_SNAKE_CASE` (ex: `DEFAULT_RETRY_POLICY`)

### Database

- **Tables** : `snake_case` (ex: `bank_connectors_registry`)
- **Colonnes** : `snake_case` (ex: `created_at`)
- **Indexes** : `idx_<table>_<col>` (ex: `idx_ps_status`)

---

## 🔑 Fichiers clés à connaître

### Pour commencer
1. [INDEX.md](INDEX.md) - Point d'entrée
2. [README.md](README.md) - Documentation complète
3. [QUICKSTART.md](QUICKSTART.md) - Guide pratique

### Pour comprendre
4. [ARCHITECTURE.md](ARCHITECTURE.md) - Architecture détaillée
5. [src/types.ts](src/types.ts) - Types & contrats
6. [database/schema.sql](database/schema.sql) - Data model

### Pour développer
7. [src/connectors/rest-sandbox-connector.ts](src/connectors/rest-sandbox-connector.ts) - Exemple complet
8. [src/utils/circuit-breaker.ts](src/utils/circuit-breaker.ts) - Resilience patterns
9. [scripts/setup.sh](scripts/setup.sh) - Setup automation

### Pour déployer (Phase 2)
10. ⏳ k8s/deployment.yaml - K8s config
11. ⏳ RUNBOOK.md - Ops playbooks

---

**Dernière mise à jour** : 2025-11-18
**Version** : 1.0.0-beta
**Maintenu par** : Molam Backend Engineering
