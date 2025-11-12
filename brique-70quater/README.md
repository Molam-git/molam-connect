# Sous-Brique 70quater — Predictive Pricing Engine (IA)

## Vue d'ensemble

La Sous-Brique 70quater apporte l'intelligence de **pricing dynamique** aux marchands de Molam Connect. L'IA SIRA prédit le prix optimal pour chaque produit en analysant la demande, l'élasticité, les concurrents, et le risque de churn.

### Fonctionnalités Clés

- 💰 **Pricing Optimal**: Prix recommandé par produit basé sur élasticité de la demande
- 📊 **Prédiction d'Impact**: Uplift revenus, changement volume, risque churn, amélioration marge
- 🎯 **Pricing Dynamique**: Happy hours, peak pricing, flash sales
- 🏆 **Benchmark Concurrentiel**: Comparaison automatique avec le marché
- ⚡ **Application Instantanée**: Un clic → prix mis à jour
- 🔬 **Calcul d'Élasticité**: Mesure automatique de la sensibilité prix

---

## Architecture

### Composantes

**1. Pricing Engine**
- Calcul élasticité de la demande (historique ventes)
- Optimisation multi-facteurs (demande, concurrence, stock, saisonnalité)
- Prédiction impact revenus et churn

**2. Intelligence Concurrentielle**
- Collecte prix concurrents
- Positionnement marché
- Ajustements compétitifs

**3. Dynamic Pricing Rules**
- Happy hours (18h-22h vendredi/samedi)
- Peak pricing (forte demande)
- Clearance (surplus stock)
- Demand surge (stock faible)

---

## Schéma SQL

### `pricing_ai_recommendations`

Recommandations de prix AI avec prédictions d'impact.

```sql
CREATE TABLE pricing_ai_recommendations (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    current_price NUMERIC(12,2),
    suggested_price NUMERIC(12,2),
    price_change NUMERIC(12,2),
    price_change_pct NUMERIC(5,2),
    confidence NUMERIC(5,2), -- 0-1
    reason TEXT,
    predicted_impact JSONB,
    -- {
    --   "revenue_uplift_pct": 12.5,
    --   "volume_change_pct": -3.2,
    --   "churn_risk_pct": 1.5,
    --   "margin_improvement_pct": 8.3
    -- }
    status TEXT DEFAULT 'pending'
);
```

### `pricing_ai_results`

Tracking performance des prix appliqués.

```sql
CREATE TABLE pricing_ai_results (
    id UUID PRIMARY KEY,
    recommendation_id UUID,
    accepted BOOLEAN,
    applied_price NUMERIC(12,2),
    actual_impact JSONB,
    -- Mesure réelle après application
    accuracy NUMERIC(5,2)
    -- Précision prédiction vs réalité
);
```

### `pricing_elasticity`

Élasticité de la demande par produit.

```sql
CREATE TABLE pricing_elasticity (
    merchant_id UUID,
    product_id UUID,
    elasticity_coefficient NUMERIC(5,2),
    -- -1.5 = 10% prix ↑ → 15% demande ↓
    optimal_price_range JSONB,
    confidence NUMERIC(3,2),
    UNIQUE(merchant_id, product_id)
);
```

### `pricing_competitor_data`

Intelligence concurrentielle.

```sql
CREATE TABLE pricing_competitor_data (
    id UUID PRIMARY KEY,
    product_category TEXT,
    competitor_price NUMERIC(12,2),
    market_position TEXT, -- premium, mid-range, budget
    zone TEXT
);
```

### `pricing_dynamic_rules`

Règles de pricing dynamique.

```sql
CREATE TABLE pricing_dynamic_rules (
    id UUID PRIMARY KEY,
    merchant_id UUID,
    rule_type TEXT, -- happy_hour, peak_pricing, flash_sale
    price_adjustment JSONB, -- {"type": "percentage", "value": -15}
    schedule JSONB, -- {"days": ["friday"], "start_time": "18:00"}
    status TEXT DEFAULT 'active'
);
```

---

## API REST

### `POST /api/pricing/suggest`

Générer recommandation de prix AI.

**Body:**
```json
{
  "productId": "uuid",
  "zone": "CEDEAO"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "currentPrice": 10000,
    "suggestedPrice": 10500,
    "priceChange": 500,
    "priceChangePct": 5.0,
    "confidence": 0.87,
    "reason": "Période de forte demande saisonnière",
    "predictedImpact": {
      "revenueUpliftPct": 12.5,
      "revenueUpliftAmount": 5234.50,
      "volumeChangePct": -3.2,
      "churnRiskPct": 1.5,
      "marginImprovementPct": 8.3
    }
  }
}
```

### `POST /api/pricing/apply`

Appliquer recommandation.

**Body:**
```json
{
  "recommendationId": "uuid",
  "accepted": true,
  "appliedPrice": 10500
}
```

### `GET /api/pricing/recommendations`

Liste recommandations.

**Query:**
- `status`: pending, applied, rejected

---

## Logique AI Pricing

### Facteurs d'Optimisation

**1. Demande (30%)**
- Ventes > 50 unités/mois → +15% prix max
- Ventes < 10 unités/mois → -10% prix

**2. Concurrence (25%)**
- Prix +15% au-dessus marché → -5%
- Prix -15% en-dessous marché → +5%

**3. Stock (20%)**
- Stock < 10 unités → +10% (surge pricing)
- Stock > 100 unités → -8% (clearance)

**4. Saisonnalité (25%)**
- Nov/Dec (Black Friday, Noël) → +8%
- Autres mois → baseline

### Calcul Élasticité

```typescript
elasticity = (% change quantity) / (% change price)

// Exemple:
// Prix: 100 → 110 (+10%)
// Ventes: 50 → 42 (-16%)
// Elasticity = -16% / 10% = -1.6 (élastique)
```

**Interprétation:**
- **< -1.5**: Très élastique (clients sensibles au prix)
- **-1.5 à -0.5**: Modérément élastique
- **> -0.5**: Inélastique (clients peu sensibles)

### Prédiction Churn

```typescript
churnRisk = baseRate * (1 + (priceIncrease% / 10) * |elasticity|)

// Exemple:
// Base: 5%
// Augmentation: +10%
// Elasticity: -1.5
// Churn = 5% * (1 + (10/10) * 1.5) = 12.5%
```

---

## Exemples d'Utilisation

### Cas 1: Produit Populaire

**Situation:**
- Produit: Smartphone
- Prix actuel: 150,000 FCFA
- Ventes: 80 unités/mois
- Stock: 8 unités
- Saisonnalité: Décembre

**Recommandation SIRA:**
- Prix suggéré: **165,000 FCFA (+10%)**
- Confiance: 89%
- Raison: "Stock faible + forte demande saisonnière"
- Impact prévu:
  - Revenus: +15.2% (+1,824,000 FCFA)
  - Volume: -5% (-4 unités)
  - Churn: 2.1%
  - Marge: +7%

### Cas 2: Produit en Surstock

**Situation:**
- Produit: Chaussures sport
- Prix actuel: 25,000 FCFA
- Ventes: 5 unités/mois
- Stock: 150 unités

**Recommandation SIRA:**
- Prix suggéré: **22,500 FCFA (-10%)**
- Confiance: 82%
- Raison: "Surplus de stock → promotion clearance"
- Impact prévu:
  - Revenus: +8.5%
  - Volume: +25% (+6 unités)
  - Churn: 0%
  - Marge: -10%

### Cas 3: Prix Non-Compétitif

**Situation:**
- Produit: T-shirt
- Prix actuel: 8,000 FCFA
- Prix concurrent moyen: 6,500 FCFA
- Différence: +23%

**Recommandation SIRA:**
- Prix suggéré: **7,200 FCFA (-10%)**
- Confiance: 91%
- Raison: "Prix supérieur aux concurrents (+23%)"
- Impact prévu:
  - Revenus: +12%
  - Volume: +28%
  - Churn: 0%

---

## Installation

```bash
# 1. Installer dépendances
cd brique-70quater
npm install

# 2. Migrations SQL
psql -U postgres -d molam_connect -f migrations/001_create_pricing_ai_tables.sql

# 3. Lancer serveur
npm start
```

---

## Roadmap

### v1.1 (Q2 2025)
- [ ] Machine Learning réel (TensorFlow.js)
- [ ] Optimisation multi-objectifs (revenus + marge + volume)
- [ ] Pricing par segment client

### v2.0 (Q3 2025)
- [ ] Reinforcement Learning pour stratégies long-terme
- [ ] A/B testing automatique de prix
- [ ] Intégration temps réel avec stock

---

## Superpouvoirs SIRA Pricing

✅ **Pricing Dynamique** - Chaque produit a son prix optimal
✅ **Impact Chiffré** - Revenus, volume, churn prédits avec confiance
✅ **Benchmarking Auto** - Comparaison concurrents + marché
✅ **Application Facile** - 1 clic → prix mis à jour
✅ **Protection Churn** - Alerte risque client avant application
✅ **Elasticité Intelligente** - Adapte stratégie selon sensibilité prix

---

© 2025 Molam Connect. Tous droits réservés.
