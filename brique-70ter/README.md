# Sous-Brique 70ter — SIRA Auto-Learning Marketing Engine

## Vue d'ensemble

La Sous-Brique 70ter implémente un **moteur d'apprentissage automatique décentralisé** qui permet à SIRA d'évoluer en continu sans intervention humaine. Elle utilise l'apprentissage fédéré (Federated Learning) pour entraîner des modèles personnalisés par marchand tout en préservant la confidentialité des données.

### Innovations Clés

- 🧠 **Federated Learning**: Chaque marchand entraîne localement, seuls les poids remontent au modèle global
- 🌐 **Apprentissage Externe Autonome**: Crawler intelligent, APIs publiques, open datasets
- ⚙️  **Personnalisation Continue**: Modèle adapté à chaque business avec auto-tuning
- 🔐 **Privacy-First**: Les données marchandes ne quittent jamais leur environnement
- 📊 **Benchmarking Automatique**: Comparaison performance vs concurrents anonymisés
- 🤖 **Autonomie Totale**: Entraînement, déploiement, optimisation automatiques

---

## Architecture

### Composantes Principales

**1. Apprentissage Interne**
- Analyse des ventes, remboursements, comportements clients
- Détection automatique de patterns (abandons, pics saisonniers)
- Entraînement local sur données marchandes

**2. Apprentissage Externe Autonome**
- **Crawler intelligent**: Collecte online (sites concurrents, tendances, prix)
- **APIs publiques**: Stripe trends, Shopify data, economic indicators
- **Open datasets**: Saisonnalité, taux d'adoption paiements

**3. Federated Learning**
- Modèles locaux entraînés sur données privées
- Agrégation des poids (pas des données) dans modèle global
- Algorithme FedAvg (Federated Averaging)

**4. Personnalisation**
- Configuration per-merchant (fréquence, sources, privacy)
- Auto-déploiement basé sur confiance
- Fine-tuning continu

---

## Schéma SQL

### Tables Principales

**`marketing_ai_training_runs`** - Historique d'entraînement par marchand
```sql
CREATE TABLE marketing_ai_training_runs (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL,
    model_version TEXT NOT NULL,
    model_type TEXT NOT NULL, -- local, federated, personalized, external
    training_data JSONB NOT NULL,
    metrics JSONB NOT NULL, -- accuracy, uplift, confidence, etc.
    source_type TEXT NOT NULL, -- internal, external, federated, hybrid
    model_weights_hash TEXT,
    deployed BOOLEAN DEFAULT false,
    training_duration_ms INTEGER
);
```

**`marketing_ai_global_models`** - Modèles globaux fédérés
```sql
CREATE TABLE marketing_ai_global_models (
    id UUID PRIMARY KEY,
    version TEXT NOT NULL UNIQUE,
    aggregation_method TEXT NOT NULL DEFAULT 'federated_averaging',
    metrics JSONB NOT NULL,
    contributing_runs UUID[],
    model_weights_hash TEXT,
    deployed BOOLEAN DEFAULT false
);
```

**`marketing_ai_external_data`** - Données externes collectées
```sql
CREATE TABLE marketing_ai_external_data (
    id UUID PRIMARY KEY,
    source_type TEXT NOT NULL, -- crawler, api, dataset, benchmark
    source_name TEXT NOT NULL,
    data_category TEXT NOT NULL, -- pricing, seasonality, conversion_rates, etc.
    data_summary JSONB NOT NULL,
    quality_score NUMERIC(3,2),
    used_in_training BOOLEAN DEFAULT false
);
```

**`marketing_ai_merchant_configs`** - Configuration per-merchant
```sql
CREATE TABLE marketing_ai_merchant_configs (
    merchant_id UUID PRIMARY KEY,
    model_version TEXT NOT NULL,
    personalization_level TEXT NOT NULL DEFAULT 'medium',
    training_frequency TEXT NOT NULL DEFAULT 'weekly',
    auto_deploy BOOLEAN DEFAULT false,
    min_confidence NUMERIC(3,2) DEFAULT 0.80,
    data_sources JSONB DEFAULT '{"internal": true, "external": false, "federated": false}',
    privacy_level TEXT NOT NULL DEFAULT 'private'
);
```

**`marketing_ai_crawler_jobs`** - Queue de jobs crawler
```sql
CREATE TABLE marketing_ai_crawler_jobs (
    id UUID PRIMARY KEY,
    job_type TEXT NOT NULL,
    target_urls TEXT[],
    filters JSONB,
    status TEXT NOT NULL DEFAULT 'pending',
    progress JSONB,
    priority INTEGER DEFAULT 5
);
```

---

## API REST

### Endpoints Principaux

#### `POST /api/ai-training/train`
Entraîner un modèle local pour le marchand.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "modelVersion": "v1.0-local",
    "metrics": {
      "accuracy": 0.87,
      "predictedUplift": 12.5,
      "confidence": 0.92
    }
  }
}
```

#### `POST /api/ai-training/train-personalized`
Entraîner un modèle personnalisé (utilise la config marchand).

#### `POST /api/ai-training/aggregate`
Agréger les modèles locaux en modèle global fédéré (Ops only).

**Body:**
```json
{
  "minContributors": 5
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "version": "v1234567890-global",
    "metrics": {
      "avg_accuracy": 0.85,
      "contributing_merchants": 45,
      "total_data_points": 125000
    }
  }
}
```

#### `GET /api/ai-training/runs`
Récupérer l'historique d'entraînement du marchand.

#### `GET /api/ai-training/config`
Récupérer la configuration AI du marchand.

**Response:**
```json
{
  "success": true,
  "data": {
    "personalizationLevel": "medium",
    "trainingFrequency": "weekly",
    "autoDeploy": true,
    "minConfidence": 0.80,
    "dataSources": {
      "internal": true,
      "external": true,
      "federated": false
    },
    "privacyLevel": "private"
  }
}
```

#### `PUT /api/ai-training/config`
Mettre à jour la configuration.

#### `POST /api/ai-training/crawler-job`
Créer un job de crawling (Ops only).

**Body:**
```json
{
  "jobType": "competitor_pricing",
  "targetUrls": ["https://competitor1.com", "https://competitor2.com"],
  "filters": {"industry": "e-commerce"},
  "priority": 5
}
```

#### `POST /api/ai-training/:id/deploy`
Déployer un modèle entraîné.

---

## Worker Automatisé

Le worker s'exécute **toutes les 24 heures** pour:

1. **Entraîner les modèles** des marchands dont la fréquence d'entraînement est due
2. **Agréger les modèles fédérés** si suffisamment de nouveaux entraînements
3. **Traiter les jobs crawler** en attente
4. **Auto-déployer** les modèles si confiance >= seuil

### Exécution Manuelle

```bash
npm run worker
```

### Configuration CRON

```bash
0 2 * * * cd /path/to/brique-70ter && npm run worker
```

---

## Interface Utilisateur

**Page:** `AIMonitor.tsx`

### Sections

**1. Configuration**
- Niveau de personnalisation
- Fréquence d'entraînement
- Déploiement automatique
- Sources de données activées
- Dernier entraînement

**2. Historique d'entraînement**
- Table avec tous les training runs
- Métriques: Accuracy, Uplift prédit, Confiance
- Statut: Déployé / Non déployé
- Action: Déployer manuellement

**3. Actions**
- Bouton "Entraîner modèle"
- Déploiement manuel des modèles

---

## Exemples d'Utilisation

### 1. Configuration et Entraînement

```typescript
// Mettre à jour la config
await fetch('/api/ai-training/config', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    personalizationLevel: 'high',
    trainingFrequency: 'daily',
    autoDeploy: true,
    minConfidence: 0.85,
    dataSources: {
      internal: true,
      external: true,
      federated: true,
    },
  }),
});

// Entraîner modèle personnalisé
const response = await fetch('/api/ai-training/train-personalized', {
  method: 'POST',
});

const data = await response.json();
console.log('Accuracy:', data.data.metrics.accuracy);
console.log('Predicted Uplift:', data.data.metrics.predictedUplift);
```

### 2. Agrégation Fédérée (Ops)

```typescript
const response = await fetch('/api/ai-training/aggregate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-User-Role': 'ops',
  },
  body: JSON.stringify({
    minContributors: 10,
  }),
});

const globalModel = await response.json();
console.log('Global Model:', globalModel.data.version);
console.log('Contributors:', globalModel.data.metrics.contributing_merchants);
```

### 3. Créer Job Crawler (Ops)

```typescript
await fetch('/api/ai-training/crawler-job', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-User-Role': 'ops',
  },
  body: JSON.stringify({
    jobType: 'discount_analysis',
    targetUrls: [
      'https://competitor-a.com/promotions',
      'https://competitor-b.com/offers',
    ],
    filters: {
      industry: 'e-commerce',
      country: 'FR',
    },
    priority: 3,
  }),
});
```

---

## Superpouvoirs SIRA

### 1. **Autonomie Complète**
- Collecte données (crawler + APIs)
- Entraîne modèles automatiquement
- Déploie en production si performance valide
- Améliore en continu

### 2. **Privacy-First**
- Données marchandes restent locales
- Seuls les poids de modèle remontent
- Agrégation anonymisée
- Niveaux de privacy configurables

### 3. **Économie de Coûts**
- Entraînement décentralisé = moins de compute central
- Cache intelligent des données externes
- Pas de transfer massif de données

### 4. **Amélioration Continue**
- Plus de marchands = modèle global plus puissant
- Chaque marchand bénéficie de l'intelligence collective
- Benchmarking automatique vs marché

### 5. **Anti-Emplois Inutiles**
- Ops interviennent uniquement sur alertes critiques
- Crawler contrôlé mais autonome
- Auto-tuning sans intervention

---

## Installation

```bash
# 1. Installer dépendances
cd brique-70ter
npm install

# 2. Configurer env
cp .env.example .env

# 3. Migrations SQL
psql -U postgres -d molam_connect -f migrations/001_create_ai_learning_tables.sql

# 4. Build
npm run build

# 5. Lancer serveur
npm start

# 6. (Optionnel) Lancer worker
npm run worker
```

---

## Intégration

- **Brique 68 (RBAC)**: Permissions `ai.training.view`, `ai.training.manage`, `ai.crawler.create`
- **Brique 70bis**: Utilise les recommandations AI pour affiner les suggestions

---

## Roadmap

### v1.1 (Q2 2025)
- [ ] TensorFlow.js réel pour training
- [ ] Puppeteer pour crawler avancé
- [ ] APIs externes réelles (Stripe, Shopify)

### v2.0 (Q3 2025)
- [ ] Transfer Learning depuis modèles pré-entraînés
- [ ] Multi-modal training (text + images)
- [ ] Reinforcement Learning pour stratégies marketing

---

## Licence

© 2025 Molam Connect. Tous droits réservés.
