# BRIQUE 147 — A/B & Experiment Platform intégrée à SIRA

## Objectif

Plateforme d'expérimentation industrielle permettant à Molam (Pay, Connect, Wallet, Shop, Eats, Talk, Ads) de :

- **Définir des expériences A/B/n** : pricing, UI, parcours checkout, méthodes de paiement, promos
- **Attribuer dynamiquement** : par Molam ID, device, région, langue, devise
- **Collecter et mesurer** : conversion, rétention, churn, fraude détectée
- **Intégrer SIRA** pour :
  - Ajuster en temps réel les affectations (multi-armed bandit)
  - Stopper automatiquement une expérience si un variant est perdant (fail-fast)
  - Suggérer de nouvelles expériences basées sur les insights
- **Ops UI** : lancer, monitorer, arrêter des tests avec audit immuable
- **RBAC** : seuls les rôles `ops_admin`, `marketing`, `data_science` peuvent lancer ou modifier des expériences

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Ops UI    │─────▶│  Experiments │─────▶│    SIRA     │
│  (React)    │      │   API (Node) │      │  (AI Agent) │
└─────────────┘      └──────────────┘      └─────────────┘
                            │                      │
                            ▼                      ▼
                     ┌──────────────┐      ┌─────────────┐
                     │  PostgreSQL  │      │  Analytics  │
                     │  (Metadata)  │      │ (ClickHouse)│
                     └──────────────┘      └─────────────┘
```

## Fonctionnalités

### 1. Gestion des Expériences
- Création d'expériences avec ciblage (pays, langue, devise, min_txn)
- Définition de variants A/B/n avec configuration JSON
- Distribution du traffic par variant (%)
- Statuts : `draft`, `running`, `stopped`, `archived`

### 2. Attribution Dynamique
- Assignment utilisateur → variant via SIRA
- Cache des assignments (un user = un variant pour toute la durée)
- Support sticky sessions (même variant si l'user revient)

### 3. Collecte de Métriques
- Events trackés : `conversion`, `refund`, `churn`, `fraud_alert`, `click`, `view`
- Valeurs numériques (montant, durée, taux)
- Metadata JSON pour contexte enrichi

### 4. Intégration SIRA
- **Multi-armed bandit** (Thompson Sampling) pour optimisation automatique
- **Fail-fast** : arrêt automatique si variant perdant > seuil
- **Insights** : recommandations de nouvelles expériences
- **Real-time adjustment** : redistribution du traffic

### 5. Ops Dashboard
- Liste des expériences actives/archivées
- Création guidée d'expériences
- Visualisation des résultats par variant
- Audit logs immuables
- Contrôle start/stop avec RBAC

## Stack Technique

- **Backend** : Node.js 20, TypeScript 5.x, Express.js
- **Database** : PostgreSQL 15+
- **Frontend** : React 18, Tailwind CSS
- **Auth** : Molam ID JWT (RBAC)
- **AI** : SIRA agent pour optimisation (Thompson Sampling)
- **Monitoring** : Prometheus metrics

## Quick Start

### Local Development

```bash
# Install dependencies
cd brique-147-experiments
npm install
cd web && npm install

# Setup environment
cp .env.example .env
# Edit .env with your DATABASE_URL and MOLAM_ID_PUBLIC_KEY

# Run migrations
make migrate

# Start backend
npm run dev

# Start frontend (separate terminal)
cd web
npm run dev
```

### Docker Compose

```bash
# Start all services
make start

# View logs
make logs

# Stop services
make stop
```

Services:
- **Experiments API**: http://localhost:3010
- **Ops Dashboard**: http://localhost:3011
- **PostgreSQL**: localhost:5432

## API Endpoints

### Experiments

```
POST   /api/experiments          Create experiment (ops_admin, marketing)
GET    /api/experiments          List experiments
GET    /api/experiments/:id      Get experiment details
PATCH  /api/experiments/:id      Update experiment
POST   /api/experiments/:id/start   Start experiment
POST   /api/experiments/:id/stop    Stop experiment
```

### Assignments

```
POST   /api/experiments/:id/assign    Assign user to variant
GET    /api/experiments/:id/assignment/:molam_id   Get user assignment
```

### Metrics

```
POST   /api/experiments/:id/track     Track metric event
GET    /api/experiments/:id/results   Get experiment results
GET    /api/experiments/:id/insights  Get SIRA insights
```

## Example Usage

### 1. Create Experiment

```bash
curl -X POST http://localhost:3010/api/experiments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Checkout Button Color",
    "description": "Test blue vs green button",
    "targeting": {
      "country": ["SN", "FR"],
      "lang": ["fr"]
    },
    "variants": [
      {
        "name": "Control (Blue)",
        "config": { "button_color": "blue" },
        "traffic_share": 50,
        "is_control": true
      },
      {
        "name": "Green Button",
        "config": { "button_color": "green" },
        "traffic_share": 50
      }
    ]
  }'
```

### 2. Start Experiment

```bash
curl -X POST http://localhost:3010/api/experiments/{id}/start \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Assign User to Variant

```bash
curl -X POST http://localhost:3010/api/experiments/{id}/assign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "molam_id": "user_123"
  }'
```

### 4. Track Conversion

```bash
curl -X POST http://localhost:3010/api/experiments/{id}/track \
  -H "Content-Type: application/json" \
  -d '{
    "variant_id": "{variant_id}",
    "molam_id": "user_123",
    "event_type": "conversion",
    "value": 49.99,
    "metadata": {
      "source": "web",
      "page": "checkout"
    }
  }'
```

### 5. Get Results

```bash
curl http://localhost:3010/api/experiments/{id}/results \
  -H "Authorization: Bearer $TOKEN"
```

## SIRA Integration

### Multi-Armed Bandit (Thompson Sampling)

SIRA maintains a **Beta distribution** for each variant:
- **α (alpha)** : successes (conversions) + 1
- **β (beta)** : failures (non-conversions) + 1

For each assignment request:
1. Sample from Beta(α, β) for each variant
2. Select variant with highest sample
3. Return selected variant ID

As metrics arrive:
- **Conversion** → increment α
- **Non-conversion** → increment β

This approach balances **exploration** (trying all variants) with **exploitation** (favoring winning variants).

### Fail-Fast Auto-Stop

SIRA monitors variant performance using probability calculations:

```
P(variant is worse than best) > 95% for 100+ samples → auto-stop recommendation
```

When threshold is exceeded:
- Notification logged to console
- Recommendation available via `/insights` endpoint
- Ops team can manually stop via dashboard

### Statistical Insights

SIRA provides:
- **Conversion rate** with 95% confidence intervals
- **Thompson Sampling state** (α, β, total samples)
- **Recommendations** based on statistical significance

Example insight:
```json
{
  "insights": [
    {
      "variant": "Green Button",
      "conversion_rate": 0.0847,
      "samples": 1000,
      "confidence_interval": {
        "lower": 0.0712,
        "upper": 0.0982
      }
    }
  ],
  "recommendation": "Variant 'Green Button' is currently leading with 8.47% conversion"
}
```

## RBAC Roles

- `ops_admin` : Full access (create, start, stop, delete experiments)
- `marketing` : Create and manage experiments, view results
- `data_science` : View all data, export metrics, access insights
- `pay_module`, `connect_module` : Assign users, track metrics (service-to-service)

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/molam

# Server
PORT=3010
NODE_ENV=development
CORS_ORIGIN=http://localhost:3011

# Molam ID Authentication
MOLAM_ID_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."

# SIRA Integration (optional)
SIRA_URL=http://localhost:4000
```

## Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# All tests
npm run test
```

## Database Schema

**6 tables:**

1. **experiments** : Experiment metadata
2. **experiment_variants** : A/B/n variants configuration
3. **experiment_assignments** : User → variant mappings
4. **experiment_metrics** : Event tracking
5. **experiment_audit_logs** : Immutable audit trail
6. **experiment_bandit_state** : SIRA Thompson Sampling state (α, β)

See [database/migrations/147_experiments.sql](database/migrations/147_experiments.sql) for complete schema.

## Production Considerations

1. **Scale** : Use read replicas for analytics queries
2. **Caching** : Redis for assignment cache (reduce DB load)
3. **Rate limiting** : Protect assignment endpoint
4. **Backup** : Daily snapshots of experiments table
5. **SIRA SLA** : < 100ms P95 for decision latency

## Monitoring

### Prometheus Metrics

```
experiments_total{status}                    Total experiments by status
experiment_assignments_total{experiment_id}  Assignment counter
experiment_metrics_total{experiment_id,event_type}  Metric events
sira_decisions_latency_seconds              SIRA decision latency
```

### Grafana Dashboard

Create dashboard with:
- Active experiments overview
- Variant performance comparison
- Conversion funnel by variant
- SIRA bandit evolution (α, β over time)

## Security

- All endpoints require Molam ID JWT
- RBAC enforced at route level
- Audit logs for all mutations
- Immutable experiment history
- No PII in experiment configs

## Support

- **Team** : Molam Platform Engineering
- **Slack** : #molam-experiments
- **Docs** : https://docs.molam.io/experiments

## License

Proprietary - Molam Connect
