# Briques 137 & 138ter - Guide d'Intégration et Déploiement

## 📦 Briques Implémentées

### ✅ Brique 137 - Merchant Dashboard (Industriel)
**Localisation**: `brique-137/merchant-dashboard/`
**Port par défaut**: 3001
**Description**: Tableau de bord marchand avec KPIs temps réel, gestion des transactions, remboursements, disputes et payouts.

### ✅ Brique 138ter - Cooperative Failover Mesh (SIRA)
**Localisation**: `brique-138ter/cooperative-failover-mesh/`
**Port par défaut**: 3138
**Description**: Routage distribué avec prédictions SIRA, failover automatique et réconciliation inter-régions.

---

## 🚀 Démarrage Rapide

### 1. Configuration des Variables d'Environnement

#### Brique 137 - Merchant Dashboard

```bash
cd brique-137/merchant-dashboard
cp .env.example .env
```

Configurer les variables critiques dans `.env`:
```bash
# Database & Cache
DATABASE_URL=postgresql://user:password@localhost:5432/molam_connect
REDIS_URL=redis://localhost:6379

# Kafka (requis pour KPI temps réel)
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=merchant-dashboard
KAFKA_GROUP_ID=merchant-dashboard-consumer

# Authentication (Molam ID)
JWT_PUBLIC_KEY_URL=https://id.molam.io/.well-known/jwks.json
JWT_ISSUER=https://id.molam.io
JWT_AUDIENCE=molam-connect

# Integration avec Brique 136ter (Approvals)
RISK_AWARE_APPROVALS_URL=http://localhost:3136

# SIRA (pour anomaly detection)
SIRA_API_URL=http://localhost:8000

# S3 pour uploads (dispute evidence)
S3_BUCKET=molam-merchant-uploads
S3_REGION=eu-west-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

#### Brique 138ter - Cooperative Failover Mesh

```bash
cd brique-138ter/cooperative-failover-mesh
cp .env.example .env
```

Configurer les variables critiques dans `.env`:
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/molam_connect

# Kafka (requis pour mesh communication)
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=cooperative-failover-mesh
KAFKA_GROUP_ID=mesh-controller

# SIRA Integration
SIRA_API_URL=http://localhost:8000
SIRA_SIGNING_KEY=your-sira-signing-key-here
SIRA_FALLBACK_ENABLED=true

# Mesh Configuration
MESH_REGION=CEDEAO
ENABLE_CONTROLLER=true

# Policy Defaults
DEFAULT_POLICY_MODE=approval_required
DEFAULT_AUTO_CONFIDENCE_THRESHOLD=0.85
```

---

### 2. Migrations de Base de Données

Les deux briques partagent la même base de données PostgreSQL mais ont des schémas séparés.

```bash
# Brique 137 - Créer les tables merchant dashboard
cd brique-137/merchant-dashboard
npm run migrate

# Brique 138ter - Créer les tables mesh
cd brique-138ter/cooperative-failover-mesh
psql $DATABASE_URL -f migrations/2025_01_19_create_mesh_system.sql
```

**Tables créées par Brique 137** (8 tables):
- `merchant_dashboards` - Configuration tableau de bord
- `merchant_kpis_cache` - Cache KPIs avec TTL 2min
- `refunds` - Remboursements avec workflow approval
- `disputes` - Litiges avec preuves (evidence)
- `merchant_actions_audit` - Audit trail complet
- `merchant_alerts` - Alertes SIRA (anomalies)
- `merchant_webhooks` - Config webhooks
- `mv_merchant_tx_agg` - Vue matérialisée pour performance

**Tables créées par Brique 138ter** (8 tables):
- `mesh_regions` - Régions mesh (CEDEAO, EU, US, GLOBAL)
- `mesh_members` - Membres mesh (banks/PSP)
- `bank_health_predictions` - Prédictions SIRA signées
- `mesh_routing_proposals` - Propositions de routage
- `mesh_action_logs` - Log actions avec idempotency keys
- `mesh_policies` - Policies auto-failover
- `mesh_reconciliations` - Réconciliation cross-region
- `mesh_liquidity_pools` - Pools de liquidité mutualisés

---

### 3. Installation des Dépendances

Les dépendances sont déjà installées, mais si besoin:

```bash
# Brique 137
cd brique-137/merchant-dashboard
npm install --include=dev

# Brique 138ter
cd brique-138ter/cooperative-failover-mesh
npm install --include=dev
```

---

### 4. Build des Projets TypeScript

Les projets sont déjà compilés, mais pour rebuild:

```bash
# Brique 137
cd brique-137/merchant-dashboard
npm run build

# Brique 138ter
cd brique-138ter/cooperative-failover-mesh
npm run build
```

---

### 5. Démarrage des Services

#### Mode Développement (avec hot reload)

```bash
# Terminal 1 - Merchant Dashboard
cd brique-137/merchant-dashboard
npm run dev

# Terminal 2 - Merchant Dashboard KPI Worker (Kafka consumer)
cd brique-137/merchant-dashboard
npm run worker

# Terminal 3 - Mesh Controller
cd brique-138ter/cooperative-failover-mesh
npm run dev
```

#### Mode Production

```bash
# Brique 137
cd brique-137/merchant-dashboard
npm start

# Brique 137 Worker (dans un process séparé)
cd brique-137/merchant-dashboard
npm run worker

# Brique 138ter
cd brique-138ter/cooperative-failover-mesh
npm start
```

---

## 📡 Points d'Accès API

### Brique 137 - Merchant Dashboard

**Base URL**: `http://localhost:3001/api/merchant`

| Endpoint | Method | Description | RBAC Required |
|----------|--------|-------------|---------------|
| `/summary` | GET | KPIs résumé (sales, refunds, fees, net revenue) | merchant_admin, merchant_accountant |
| `/transactions` | GET | Liste paginée transactions avec filtres | merchant_admin, merchant_accountant, merchant_support |
| `/refund` | POST | Créer remboursement (avec approval si > threshold) | merchant_admin |
| `/payouts` | GET | Liste payouts (upcoming, history) | merchant_admin, merchant_accountant |
| `/disputes` | GET | Liste disputes | merchant_admin, merchant_support |
| `/disputes/:id/evidence` | POST | Upload evidence (KYC, receipt) | merchant_admin, merchant_support |
| `/settings/payout-schedule` | PUT | Configurer cadence payouts | merchant_admin |
| `/alerts` | GET | Alertes SIRA (anomalies) | merchant_admin |
| `/export` | GET | Export CSV/PDF avec signed S3 URL | merchant_admin, merchant_accountant |

**Exemples cURL**:

```bash
# Obtenir KPIs MTD (Month-To-Date)
curl -H "Authorization: Bearer $JWT_TOKEN" \
  "http://localhost:3001/api/merchant/summary?period=mtd&currency=XOF"

# Liste transactions avec filtres
curl -H "Authorization: Bearer $JWT_TOKEN" \
  "http://localhost:3001/api/merchant/transactions?status=succeeded&currency=XOF&limit=50&offset=0"

# Créer un remboursement
curl -X POST -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"txn_id":"tx_123","amount":50000,"currency":"XOF","reason":"duplicate_charge"}' \
  http://localhost:3001/api/merchant/refund
```

### Brique 138ter - Cooperative Failover Mesh

**Base URL**: `http://localhost:3138/api/mesh`

| Endpoint | Method | Description | Purpose |
|----------|--------|-------------|---------|
| `/regions` | GET | Liste régions mesh | Voir topologie |
| `/members` | GET | Liste membres mesh par région | Voir banks disponibles |
| `/members` | POST | Ajouter membre (requires compliance approval) | Ops |
| `/predictions` | GET | Prédictions santé banques | Monitoring |
| `/predictions/generate` | POST | Générer prédiction SIRA pour une banque | Ops/SIRA |
| `/proposals` | GET | Propositions routage | Review |
| `/proposals/generate` | POST | Générer proposition routage | Ops/SIRA |
| `/proposals/:id/simulate` | POST | Simuler impact proposition | Testing |
| `/proposals/:id/approve` | POST | Approuver et appliquer atomiquement | Ops |
| `/proposals/:id/reject` | POST | Rejeter proposition | Ops |
| `/proposals/:id/rollback` | POST | Rollback routing (< 24h) | Ops |
| `/actions` | GET | Historique actions mesh | Audit |
| `/reconciliations` | GET | Réconciliations cross-region | Treasury |
| `/policies` | GET | Policies auto-failover | Config |
| `/policies` | POST | Créer policy | Ops |

**Exemples cURL**:

```bash
# Générer prédiction santé pour une banque
curl -X POST -H "Content-Type: application/json" \
  -d '{"bank_profile_id":"bp_123","mesh_region_id":"region_cedeao"}' \
  http://localhost:3138/api/mesh/predictions/generate

# Générer proposition de routage
curl -X POST -H "Content-Type: application/json" \
  -d '{"currency":"XOF","mesh_region_id":"region_cedeao","min_amount":0,"max_amount":1000000}' \
  http://localhost:3138/api/mesh/proposals/generate

# Simuler impact
curl -X POST http://localhost:3138/api/mesh/proposals/{proposal_id}/simulate

# Approuver et appliquer
curl -X POST http://localhost:3138/api/mesh/proposals/{proposal_id}/approve
```

---

## 🔄 Workflows Principaux

### Workflow 1: Merchant Dashboard - KPIs Temps Réel

```
1. Transaction created → Kafka topic: wallet_txn_created
2. KPI Worker (src/workers/kpiWorker.ts) consomme l'event
3. Worker incrémente merchant_kpis_cache (atomic UPDATE)
4. Worker détecte anomalies (sales > 3x previous period)
5. Si anomalie → créer alert dans merchant_alerts
6. Dashboard API (/summary) lit cache avec TTL 2min
7. Toutes les 5 min: REFRESH MATERIALIZED VIEW mv_merchant_tx_agg
```

**Kafka Topics consommés par Brique 137**:
- `wallet_txn_created`
- `wallet_txn_succeeded`
- `refund_created`
- `payout_created`
- `dispute_created`

### Workflow 2: Merchant Dashboard - Refund avec Approval

```
1. Marchand clique "Refund" dans dashboard
2. POST /api/merchant/refund {txn_id, amount, reason}
3. Backend vérifie: amount >= REFUND_APPROVAL_THRESHOLD ?
4. Si OUI → Créer approval request via Brique 136ter
5. Attendre approval (multi-sig si configuré)
6. Si approved → créer refund record, mettre à jour ledger
7. Publier webhook: merchant.refund.created
8. Audit log: merchant_actions_audit
```

### Workflow 3: Mesh - Auto-Failover SIRA-Driven

```
1. Health Monitor → publie bank_health_log via Kafka (mesh.health)
2. SIRA Prediction Engine consomme health signals
3. SIRA génère health_prediction (score 0-100, confidence)
4. Signe prédiction avec JWT, publie sur mesh.predictions
5. Routing Proposal Generator analyse prédictions
6. Génère routing_proposal (primary → secondary → tertiary)
7. Publie sur mesh.proposals
8. Mesh Controller consomme proposal
9. Vérifie policy: auto_confidence_threshold atteint ?
10. Si OUI et mode=auto → applyRoutingAtomically()
11. Si mode=approval_required → attendre approval Ops
12. Atomic update: FOR UPDATE lock sur payouts, update treasury_account_id
13. Créer reconciliation records, publish sur mesh.actions
```

---

## 🐳 Déploiement Kubernetes

### Brique 137 - Merchant Dashboard

```bash
cd brique-137/merchant-dashboard

# Build Docker image
docker build -t molam-merchant-dashboard:latest .

# Deploy to K8s
kubectl apply -f k8s/deployment.yaml
```

**Configuration HPA**:
- Min replicas: 5
- Max replicas: 20
- Target CPU: 70%
- Target Memory: 80%

**Health Probes**:
- Liveness: `/health`
- Readiness: `/ready`

**Prometheus Metrics**:
- `molam_merchant_kpi_updates_total`
- `molam_merchant_refund_requests_total`
- `molam_merchant_webhook_delivery_duration_seconds`
- `molam_merchant_dashboard_requests_total`

### Brique 138ter - Cooperative Failover Mesh

```bash
cd brique-138ter/cooperative-failover-mesh

# Build Docker image
docker build -t molam-mesh-controller:latest .

# Deploy to K8s
kubectl apply -f k8s/deployment.yaml
```

**Configuration HPA**:
- Min replicas: 3
- Max replicas: 10
- Target CPU: 70%
- Target Memory: 80%

**Prometheus Metrics**:
- `molam_mesh_failover_applied_total`
- `molam_mesh_prediction_confidence`
- `molam_mesh_crossborder_volume_total`
- `molam_mesh_routing_latency_seconds`

---

## 🔐 Sécurité et RBAC

### Brique 137 - Merchant Dashboard

**JWT Authentication** (Molam ID):
- Algorithme: RS256
- Issuer: `https://id.molam.io`
- Audience: `molam-connect`
- Claims requis: `sub` (user_id), `merchant_id`, `roles`

**Rôles RBAC**:
- `merchant_admin`: Toutes opérations (refunds, payouts, config)
- `merchant_accountant`: Lecture KPIs, transactions, exports
- `merchant_support`: Gestion disputes, upload evidence

**Opérations sensibles** (require 2FA ou multi-sig):
- Refund > threshold (configuré via `REFUND_APPROVAL_THRESHOLD`)
- Modification payout schedule
- Webhook endpoint changes

### Brique 138ter - Mesh

**Signatures SIRA**:
- Toutes prédictions signées avec JWT HS256
- Vérification signature obligatoire avant apply routing
- Signing key stocké dans secret K8s

**Multi-sig pour Mesh Actions**:
- Approval mesh members (compliance + ops requis)
- Approval routing proposals si `policy.mode = 'approval_required'`
- Rollback operations (< 24h window)

---

## 📊 Monitoring et Observabilité

### Logs Structurés (Winston)

Les deux briques utilisent Winston avec format JSON:

```json
{
  "timestamp": "2025-01-19T12:34:56.789Z",
  "level": "info",
  "service": "merchant-dashboard",
  "message": "KPI updated",
  "metadata": {
    "merchant_id": "mer_123",
    "period": "today",
    "kpi_key": "sales",
    "value": 1500000,
    "currency": "XOF"
  }
}
```

### Grafana Dashboards

Créer dashboards avec métriques:

**Brique 137**:
- KPI update rate (par merchant)
- Refund request success rate
- Webhook delivery latency (p50, p95, p99)
- Cache hit rate
- Materialized view refresh duration

**Brique 138ter**:
- Prediction confidence distribution
- Routing proposal application rate
- Cross-region transfer volume
- Failover events per region
- Reconciliation processing time

---

## 🧪 Tests

### Brique 137

```bash
cd brique-137/merchant-dashboard

# Run all tests
npm test

# Watch mode
npm run test:watch
```

**Tests inclus**:
- `__tests__/kpiHelpers.test.ts` - KPI computation logic
- `__tests__/merchantService.test.ts` - Business logic
- `__tests__/routes.test.ts` - API endpoints

### Brique 138ter

```bash
cd brique-138ter/cooperative-failover-mesh

# Tests unitaires à créer
npm test
```

---

## 🔧 Troubleshooting

### Problème: KPIs pas à jour dans dashboard

**Solution**:
1. Vérifier KPI Worker tourne: `ps aux | grep kpiWorker`
2. Check Kafka connection: logs contain "Kafka connected"
3. Vérifier TTL cache: `SELECT * FROM merchant_kpis_cache WHERE computed_at > now() - interval '5 minutes'`
4. Refresh materialized view manuellement: `REFRESH MATERIALIZED VIEW mv_merchant_tx_agg`

### Problème: Mesh routing pas appliqué

**Solution**:
1. Vérifier policy mode: `SELECT * FROM mesh_policies WHERE mesh_region_id = ...`
2. Check confidence threshold: doit être >= `DEFAULT_AUTO_CONFIDENCE_THRESHOLD`
3. Vérifier idempotency key pas déjà utilisé: `SELECT * FROM mesh_action_logs WHERE idempotency_key = ...`
4. Check FOR UPDATE locks: `SELECT * FROM pg_locks WHERE locktype = 'tuple'`

### Problème: Webhook delivery failures

**Solution**:
1. Check merchant webhook config: `SELECT * FROM merchant_webhooks WHERE merchant_id = ...`
2. Vérifier endpoint accessible: `curl -X POST merchant_webhook_url`
3. Check signature HMAC: logs should show "Webhook delivered" avec status 200
4. Retry policy: max 3 retries avec exponential backoff

---

## 📚 Documentation Complète

- **Brique 137 README**: [brique-137/merchant-dashboard/README.md](brique-137/merchant-dashboard/README.md)
- **Brique 138ter README**: [brique-138ter/cooperative-failover-mesh/README.md](brique-138ter/cooperative-failover-mesh/README.md)

---

## ✅ Checklist Déploiement Production

### Avant Déploiement

- [ ] Migrations DB exécutées (Brique 137 + 138ter)
- [ ] Variables d'environnement configurées (JWT keys, S3 credentials, Kafka brokers)
- [ ] Kafka topics créés (`wallet_txn_*`, `mesh.*`)
- [ ] Redis accessible et configuré
- [ ] S3 bucket créé pour merchant uploads
- [ ] SIRA API endpoint accessible
- [ ] Brique 136ter (Risk Aware Approvals) déployée
- [ ] Grafana dashboards créés
- [ ] Alerting configuré (PagerDuty, Slack)

### Après Déploiement

- [ ] Health checks passent (liveness + readiness)
- [ ] Prometheus metrics scrapées
- [ ] KPI Worker consomme events Kafka
- [ ] Mesh Controller reçoit health signals
- [ ] Test refund flow complet (avec approval)
- [ ] Test mesh failover flow (simulation)
- [ ] Vérifier logs structured dans CloudWatch/DataDog
- [ ] Tester rollback mesh (< 24h window)
- [ ] Configurer alertes Grafana (KPI anomalies, mesh confidence < threshold)

---

## 🎯 Prochaines Étapes

### Améliorations Futures Brique 137

1. **Multi-devise avancée**: Support dynamic FX rates from external provider (Fixer.io, Open Exchange Rates)
2. **Export amélioré**: Support Excel (.xlsx) en plus de CSV/PDF
3. **Notifications push**: WebSocket pour KPI updates temps réel côté frontend
4. **Disputes automation**: Auto-respond disputes avec evidence AI-validée
5. **Reconciliation automatique**: Match bank statements avec merchant payouts

### Améliorations Futures Brique 138ter

1. **ML-based routing**: Remplacer heuristiques fallback par modèle ML entraîné
2. **Multi-region mesh federation**: CEDEAO ↔ EU ↔ US routing automatique
3. **Liquidity pools optimization**: Algorithme optimal allocation inter-banks
4. **Predictive liquidity needs**: Anticiper besoins float par bank/currency/day
5. **Smart contract settlements**: Blockchain-based reconciliation pour cross-border

---

**Document généré le**: 2025-11-21
**Briques version**: 1.0.0
**Auteur**: Claude Code (Anthropic)
