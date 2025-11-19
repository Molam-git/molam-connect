# Architecture — Brique 147 : A/B & Experiment Platform

## Vue d'ensemble

La Brique 147 est une **plateforme d'expérimentation A/B/n industrielle** intégrée avec SIRA (agent IA) pour l'optimisation automatique des variants via multi-armed bandit (Thompson Sampling).

## Composants principaux

### 1. Base de données (PostgreSQL)

**6 tables principales :**

```sql
experiments              # Métadonnées des expériences
├── experiment_variants  # Variants A/B/n avec config JSON
├── experiment_assignments  # User → Variant mappings (sticky)
├── experiment_metrics   # Events trackés (conversion, refund, churn)
├── experiment_audit_logs  # Audit trail immuable
└── experiment_bandit_state  # État Thompson Sampling (α, β)
```

**Flux de données :**
```
User Request → Assignment → Variant Selection (SIRA) → Tracking → Metrics → Bandit Update
```

### 2. Backend API (Node.js + TypeScript)

**Architecture en couches :**

```
┌─────────────────────────────────────────┐
│         Express Server (server.ts)      │
├─────────────────────────────────────────┤
│  Middleware: Auth (JWT) + RBAC          │
├─────────────────────────────────────────┤
│  Routes:                                │
│  - POST /api/experiments (create)       │
│  - GET /api/experiments (list)          │
│  - POST /:id/assign (SIRA decision)     │
│  - POST /:id/track (metrics)            │
│  - GET /:id/results (analytics)         │
│  - GET /:id/insights (SIRA stats)       │
├─────────────────────────────────────────┤
│  Services:                              │
│  - SIRA Service (Thompson Sampling)     │
│  - Database Pool (pg)                   │
└─────────────────────────────────────────┘
```

**Endpoints clés :**

| Méthode | Endpoint | Rôle requis | Description |
|---------|----------|-------------|-------------|
| POST | `/api/experiments` | ops_admin, marketing | Créer expérience |
| POST | `/:id/start` | ops_admin, marketing | Démarrer expérience |
| POST | `/:id/stop` | ops_admin, marketing | Arrêter expérience |
| POST | `/:id/assign` | pay_module, connect_module | Assigner user → variant |
| POST | `/:id/track` | (public) | Tracker metric |
| GET | `/:id/results` | ops_admin, marketing, data_science | Résultats |
| GET | `/:id/insights` | ops_admin, marketing, data_science | SIRA insights |

### 3. SIRA Integration (Thompson Sampling)

**Algorithme Multi-Armed Bandit :**

```typescript
// État pour chaque variant
interface BanditState {
  alpha: number;  // Succès + 1 (prior)
  beta: number;   // Échecs + 1 (prior)
  total_samples: number;
}

// Thompson Sampling
function selectVariant(states: BanditState[]): string {
  const samples = states.map(state => ({
    variant_id: state.variant_id,
    sample: betaSample(state.alpha, state.beta)  // Échantillonner Beta(α, β)
  }));

  return samples.reduce((max, curr) =>
    curr.sample > max.sample ? curr : max
  ).variant_id;
}

// Mise à jour après metric
function updateBandit(variant_id: string, isSuccess: boolean) {
  if (isSuccess) {
    alpha += 1;  // Conversion → incrémente α
  } else {
    beta += 1;   // Non-conversion → incrémente β
  }
  total_samples += 1;
}
```

**Fail-Fast Detection :**

```typescript
function shouldStopExperiment(
  experimentId: string,
  threshold: number = 0.95,  // 95% de probabilité
  minSamples: number = 100
): { shouldStop: boolean; reason?: string } {

  const states = getBanditStates(experimentId);
  const best = states[0];  // Variant avec meilleur taux

  for (const current of states.slice(1)) {
    if (current.total_samples < minSamples) continue;

    // Calculer P(current < best) via Monte Carlo
    const pWorse = calculateProbabilityWorse(
      current.alpha, current.beta,
      best.alpha, best.beta
    );

    if (pWorse > threshold) {
      return {
        shouldStop: true,
        reason: `Variant ${current.variant_id} is ${(pWorse * 100).toFixed(1)}% likely worse than best`
      };
    }
  }

  return { shouldStop: false };
}
```

**Insights statistiques :**

```typescript
function getExperimentInsights(experimentId: string) {
  const states = getBanditStates(experimentId);

  return states.map(state => {
    const mean = state.alpha / (state.alpha + state.beta);
    const variance = (state.alpha * state.beta) /
                    ((state.alpha + state.beta)^2 * (state.alpha + state.beta + 1));
    const stdDev = Math.sqrt(variance);

    return {
      variant: state.variant_name,
      conversion_rate: mean,
      samples: state.total_samples,
      confidence_interval: {
        lower: Math.max(0, mean - 1.96 * stdDev),  // 95% CI
        upper: Math.min(1, mean + 1.96 * stdDev)
      }
    };
  });
}
```

### 4. Frontend Dashboard (React + Tailwind)

**Architecture des composants :**

```
App.tsx
├── ExperimentsList.tsx          # Liste + filtres (draft, running, stopped)
├── CreateExperiment.tsx         # Formulaire création avec variants
└── ExperimentDetails.tsx        # Résultats + graphiques + SIRA insights
    ├── BarChart (Recharts)      # Conversion rate par variant
    ├── VariantsTable            # Performance détaillée
    └── SiraInsights             # Intervalles de confiance
```

**Flux utilisateur :**

```
1. Ops se connecte (JWT Molam ID)
   ↓
2. Liste des expériences (statut: draft, running, stopped)
   ↓
3. Créer nouvelle expérience
   - Nom, description
   - Targeting (pays, langue, min_txn)
   - Variants A/B/n avec config JSON
   ↓
4. Démarrer expérience → status = "running"
   ↓
5. SIRA initialise bandit state (α=1, β=1)
   ↓
6. Users assignés dynamiquement via Thompson Sampling
   ↓
7. Metrics trackées → SIRA update bandit
   ↓
8. Consulter résultats + insights SIRA
   - Conversion rate par variant
   - Intervalles de confiance (95%)
   - Recommendation statistique
   ↓
9. Arrêter expérience si décision claire
```

## Flux de données complet

### Scenario : Test "Bouton bleu vs vert"

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. OPS crée expérience "Checkout Button Color"                 │
│    - Variant A: Control (blue) - 50%                           │
│    - Variant B: Green button - 50%                             │
│    - Targeting: {country: ["SN","FR"], lang: ["fr"]}          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. OPS démarre expérience                                       │
│    POST /api/experiments/{id}/start                            │
│    → status = "running"                                         │
│    → SIRA initialise: α=1, β=1 pour A et B                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. User arrive sur checkout (Pay module)                        │
│    POST /api/experiments/{id}/assign                           │
│    body: { molam_id: "user-123" }                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. SIRA decision (Thompson Sampling)                            │
│    - Sample Beta(1, 1) pour A → 0.47                           │
│    - Sample Beta(1, 1) pour B → 0.63                           │
│    → Variant B selected (plus haut sample)                     │
│    → Retourne variant_id de B                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Assignment créé en DB                                        │
│    INSERT INTO experiment_assignments                           │
│    (experiment_id, variant_id, molam_id)                       │
│    VALUES (exp_id, variant_B_id, "user-123")                   │
│    → User voit bouton VERT                                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. User convertit (paye)                                        │
│    POST /api/experiments/{id}/track                            │
│    body: {                                                      │
│      variant_id: variant_B_id,                                 │
│      molam_id: "user-123",                                     │
│      event_type: "conversion",                                 │
│      value: 49.99                                              │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. SIRA update bandit state                                     │
│    UPDATE experiment_bandit_state                               │
│    SET alpha = alpha + 1,  -- Succès → α++                     │
│        total_samples = total_samples + 1                        │
│    WHERE variant_id = variant_B_id                             │
│    → Variant B: α=2, β=1 (67% conversion rate estimated)       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. Après 1000 assignments                                       │
│    - Variant A (blue): α=45, β=955 → 4.5% conversion          │
│    - Variant B (green): α=85, β=915 → 8.5% conversion         │
│    → SIRA détecte: P(A < B) > 95%                              │
│    → Recommendation: Stop variant A, green button wins         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. OPS consulte insights                                        │
│    GET /api/experiments/{id}/insights                          │
│    Response: {                                                  │
│      "insights": [                                             │
│        {                                                        │
│          "variant": "Green Button",                            │
│          "conversion_rate": 0.0847,                            │
│          "samples": 1000,                                      │
│          "confidence_interval": {                              │
│            "lower": 0.0712,                                    │
│            "upper": 0.0982                                     │
│          }                                                      │
│        }                                                        │
│      ],                                                         │
│      "recommendation": "Variant 'Green Button' leading..."     │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. OPS arrête expérience                                       │
│     POST /api/experiments/{id}/stop                            │
│     → status = "stopped"                                        │
│     → Déploie bouton vert en production pour tous              │
└─────────────────────────────────────────────────────────────────┘
```

## Sécurité & RBAC

### Rôles et permissions

| Rôle | Permissions |
|------|-------------|
| `ops_admin` | Create, Start, Stop, Delete experiments |
| `marketing` | Create, Start, Stop experiments, View results |
| `data_science` | View all data, Export metrics, Access insights |
| `pay_module` | Assign users, Track metrics (service-to-service) |
| `connect_module` | Assign users, Track metrics (service-to-service) |

### Audit trail

Toutes les mutations sont loggées :

```sql
INSERT INTO experiment_audit_logs (experiment_id, actor, action, details)
VALUES (
  'exp-uuid',
  'user-uuid',
  'started',
  '{"start_date": "2025-01-19T10:00:00Z"}'
);
```

## Performance & Scalabilité

### Optimisations

1. **Index DB** : Sur experiment_id, molam_id, variant_id, event_type
2. **Assignment cache** : Redis (optionnel) pour réduire charge DB
3. **Batch metrics** : Grouper tracking events toutes les 5s
4. **Read replicas** : Pour analytics queries
5. **SIRA latency** : < 100ms P95 (Thompson Sampling rapide)

### Métriques Prometheus

```
experiments_total{status="running"}              # Expériences actives
experiment_assignments_total{experiment_id}      # Assignments par expérience
experiment_metrics_total{experiment_id,event_type}  # Events trackés
sira_decisions_latency_seconds                   # Latence SIRA
```

## Déploiement

### Docker Compose (dev)

```bash
docker-compose up -d
```

Services :
- PostgreSQL (5432)
- Experiments API (3010)
- Ops Dashboard (3011)

### Kubernetes (production)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: molam-experiments-api
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: api
        image: molam/experiments-api:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: molam-experiments
              key: database-url
```

## Cas d'usage

### 1. Test pricing (Discount vs Loyalty Points)

```json
{
  "name": "Premium User Pricing Strategy",
  "targeting": {
    "user_segment": "premium",
    "min_txn": 10
  },
  "variants": [
    {
      "name": "Control (No offer)",
      "config": {},
      "is_control": true
    },
    {
      "name": "5% Discount",
      "config": { "discount_percent": 5 }
    },
    {
      "name": "Loyalty Points",
      "config": { "points_multiplier": 2 }
    }
  ]
}
```

### 2. Test UI (Checkout flow)

```json
{
  "name": "Checkout Button Color",
  "targeting": { "country": ["SN", "FR"] },
  "variants": [
    {
      "name": "Blue Button",
      "config": { "button_color": "#0A84FF" },
      "is_control": true
    },
    {
      "name": "Green Button",
      "config": { "button_color": "#34C759" }
    }
  ]
}
```

### 3. Test méthode de paiement

```json
{
  "name": "Payment Method Priority",
  "targeting": { "country": ["SN"], "device": "mobile" },
  "variants": [
    {
      "name": "Mobile Money First",
      "config": { "priority": ["mobile_money", "card", "bank"] }
    },
    {
      "name": "Card First",
      "config": { "priority": ["card", "mobile_money", "bank"] }
    }
  ]
}
```

## Maintenance

### Opérations courantes

```bash
# Migrations
make migrate

# Tests
make test

# Backup DB
pg_dump $DATABASE_URL > backup.sql

# Archiver vieilles expériences
UPDATE experiments SET status = 'archived'
WHERE end_date < now() - INTERVAL '90 days';
```

## Support

- **Documentation** : [README.md](README.md)
- **Slack** : #molam-experiments
- **Équipe** : Molam Platform Engineering
