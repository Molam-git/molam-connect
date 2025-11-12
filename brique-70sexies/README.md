# Brique 70sexies - AI Social Ads Generator (Sira Social Engine)

## 📋 Vue d'ensemble

**Génération autonome de publicités sur les réseaux sociaux avec IA**

La Brique 70sexies est un moteur de génération de publicités sociales propulsé par IA qui crée, optimise et lance automatiquement des campagnes sur Facebook, Instagram, TikTok, LinkedIn et Twitter/X.

### 🎯 Fonctionnalités principales

- ✅ **Génération automatique de visuels IA** - DALL-E 3, Midjourney, Stable Diffusion
- ✅ **Copywriting multi-plateforme** - Slogans optimisés pour chaque réseau social
- ✅ **Ciblage d'audience intelligent** - Âge, pays, intérêts, comportements
- ✅ **Optimisation de budget** - Recommandations basées sur CPM/CPC/ROAS
- ✅ **Support 5 plateformes** - Facebook, Instagram, TikTok, LinkedIn, Twitter/X
- ✅ **3 formats publicitaires** - Image, Vidéo, Carrousel
- ✅ **Suivi temps réel** - Impressions, clics, conversions, ROI
- ✅ **Recommandations IA** - Optimisation continue des campagnes

---

## 🏗️ Architecture

```
brique-70sexies/
├── migrations/
│   └── 001_create_social_ads_tables.sql     # Schéma PostgreSQL
├── src/
│   ├── db.ts                                # Pool PostgreSQL
│   ├── server.ts                            # Serveur Express
│   ├── services/
│   │   ├── adEngine.ts                      # Moteur principal
│   │   ├── copywritingService.ts            # Génération de copy
│   │   ├── visualGenerator.ts               # Génération visuelle IA
│   │   └── targetingOptimizer.ts            # Optimisation ciblage
│   └── routes/
│       └── socialAds.ts                     # API REST
├── web/
│   └── src/
│       └── pages/
│           └── SocialAdsAI.tsx              # Dashboard React
├── tests/
│   └── adEngine.test.ts                     # Tests complets
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📊 Schéma de base de données

### Table: `ai_social_ads`
Publicités générées par l'IA.

```sql
CREATE TABLE ai_social_ads (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL,
    platform TEXT NOT NULL,          -- facebook, instagram, tiktok, linkedin, twitter
    campaign_name TEXT NOT NULL,
    objective TEXT NOT NULL,          -- awareness, traffic, engagement, conversions, app_installs
    title TEXT NOT NULL,
    copy_text TEXT NOT NULL,
    cta_button TEXT,
    media_url TEXT,                   -- URL du visuel généré (S3/Minio)
    media_type TEXT,                  -- image, video, carousel
    targeting JSONB NOT NULL,         -- {countries, age_min, age_max, gender, interests}
    audience_size_estimate INTEGER,
    budget NUMERIC(12,2) NOT NULL,
    currency TEXT NOT NULL,
    performance JSONB,                -- {impressions, clicks, conversions, revenue, ctr, roas}
    status TEXT,                      -- draft, pending_review, approved, running, paused, completed
    ai_confidence_score NUMERIC(3,2), -- 0.00 to 1.00
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

### Table: `ai_social_ad_creatives`
Visuels générés par IA (images, vidéos).

```sql
CREATE TABLE ai_social_ad_creatives (
    id UUID PRIMARY KEY,
    ad_id UUID NOT NULL REFERENCES ai_social_ads(id),
    creative_type TEXT NOT NULL,      -- image, video, carousel_item
    url TEXT NOT NULL,                -- S3/Minio URL
    width INTEGER,
    height INTEGER,
    file_size_bytes BIGINT,
    format TEXT,                      -- jpg, png, mp4
    generation_prompt TEXT,           -- AI prompt utilisé
    generation_model TEXT,            -- dalle-3, midjourney, stable-diffusion
    performance_score NUMERIC(3,2),
    created_at TIMESTAMPTZ
);
```

### Table: `ai_social_ad_performance`
Métriques de performance en série temporelle.

```sql
CREATE TABLE ai_social_ad_performance (
    id UUID PRIMARY KEY,
    ad_id UUID NOT NULL REFERENCES ai_social_ads(id),
    date DATE NOT NULL,
    hour INTEGER,
    impressions INTEGER,
    clicks INTEGER,
    ctr NUMERIC(5,2),
    conversions INTEGER,
    conversion_rate NUMERIC(5,2),
    spend NUMERIC(12,2),
    revenue NUMERIC(12,2),
    roas NUMERIC(8,2),
    cost_per_click NUMERIC(8,2),
    likes INTEGER,
    shares INTEGER,
    comments INTEGER
);
```

### Table: `ai_social_ad_recommendations`
Recommandations IA pour optimisation.

```sql
CREATE TABLE ai_social_ad_recommendations (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL,
    ad_id UUID,
    recommendation_type TEXT,         -- increase_budget, change_creative, adjust_targeting
    title TEXT,
    description TEXT,
    priority TEXT,                    -- low, medium, high, urgent
    estimated_impact JSONB,
    status TEXT                       -- pending, applied, dismissed, expired
);
```

---

## 🚀 Installation

### Prérequis

- Node.js 18+
- PostgreSQL 14+
- npm ou yarn

### Étapes

```bash
cd brique-70sexies

# Installer les dépendances
npm install

# Configuration de la base de données
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=molam_connect
export DB_USER=postgres
export DB_PASSWORD=your_password

# Exécuter les migrations
psql -U postgres -d molam_connect -f migrations/001_create_social_ads_tables.sql

# Compiler TypeScript
npm run build

# Démarrer le serveur
npm start
```

Le serveur démarre sur `http://localhost:3076`

---

## 📡 API Reference

### Base URL
```
http://localhost:3076/api/social-ads
```

### Endpoints

#### 1. Générer une publicité
```http
POST /api/social-ads/generate
Content-Type: application/json

{
  "merchantId": "uuid",
  "platform": "facebook",
  "objective": "conversions",
  "productName": "iPhone 15 Pro",
  "productCategory": "tech",
  "budget": 50,
  "currency": "USD",
  "format": "image",
  "desiredConversions": 10,
  "avgOrderValue": 800
}
```

**Response:**
```json
{
  "success": true,
  "ad": {
    "id": "uuid",
    "platform": "facebook",
    "campaign_name": "facebook - iPhone 15 Pro - conversions",
    "title": "Découvrez iPhone 15 Pro - Qualité Premium",
    "copy_text": "Nouveau chez nous : iPhone 15 Pro. 15% de réduction...",
    "cta_button": "shop_now",
    "media_url": "https://cdn.molam.com/ai-generated/dalle3/abc123.jpg",
    "targeting": {
      "countries": ["SN", "FR"],
      "ageMin": 18,
      "ageMax": 45,
      "interests": ["Technology", "Gadgets", "Electronics"]
    },
    "budget": 50,
    "ai_confidence_score": 0.87,
    "status": "draft"
  }
}
```

#### 2. Lister les publicités
```http
GET /api/social-ads?merchantId=uuid&platform=facebook&status=running&limit=50
```

#### 3. Obtenir une publicité
```http
GET /api/social-ads/:id
```

#### 4. Démarrer une publicité
```http
POST /api/social-ads/:id/start
```

#### 5. Mettre en pause
```http
POST /api/social-ads/:id/pause
```

#### 6. Tracker la performance
```http
POST /api/social-ads/:id/track
Content-Type: application/json

{
  "date": "2024-06-15",
  "impressions": 5000,
  "clicks": 120,
  "conversions": 8,
  "spend": 45.50,
  "revenue": 640.00,
  "likes": 85,
  "shares": 12,
  "comments": 23
}
```

#### 7. Obtenir le rapport de performance
```http
GET /api/social-ads/:id/report?days=7
```

**Response:**
```json
{
  "success": true,
  "report": {
    "adId": "uuid",
    "platform": "facebook",
    "status": "running",
    "budget": 50,
    "totals": {
      "impressions": 25000,
      "clicks": 450,
      "conversions": 35,
      "spend": 180.50,
      "revenue": 2800.00,
      "ctr": "1.80%",
      "roas": "15.51"
    },
    "timeline": [...]
  }
}
```

#### 8. Générer des recommandations
```http
POST /api/social-ads/:id/recommendations
```

---

## 🎨 Plateformes supportées

### 1. Facebook

**Forces:**
- Large audience (3B+ utilisateurs)
- Ciblage précis
- Bon pour B2C et B2B

**Dimensions:**
- Feed: 1200×630px
- Story: 1080×1920px

**Budget min:** $5/jour
**CTR moyen:** 1.5%
**CPC moyen:** $1.20

**Copywriting:**
- Titre: 40 caractères max
- Body: 125 caractères max
- CTA: shop_now, learn_more, sign_up

### 2. Instagram

**Forces:**
- Audience jeune (18-34 ans)
- Très visuel
- Engagement élevé

**Dimensions:**
- Feed: 1080×1080px
- Story: 1080×1920px
- Reel: 1080×1920px

**Budget min:** $5/jour
**CTR moyen:** 1.8%
**CPC moyen:** $0.90

**Copywriting:**
- 5 hashtags optimaux
- Emojis recommandés
- CTA: shop_now, visit_profile

### 3. TikTok

**Forces:**
- Audience Gen Z (16-30 ans)
- Contenu viral
- CPM bas

**Dimensions:**
- Vidéo: 1080×1920px

**Budget min:** $20/jour
**CTR moyen:** 2.5%
**CPC moyen:** $0.50

**Copywriting:**
- Ton trendy obligatoire
- 5 hashtags #fyp #viral
- Max 150 caractères

### 4. LinkedIn

**Forces:**
- Audience professionnelle
- Excellent pour B2B
- Haute qualité leads

**Dimensions:**
- Feed: 1200×627px

**Budget min:** $10/jour
**CTR moyen:** 0.8%
**CPC moyen:** $5.50

**Copywriting:**
- Ton professionnel
- Max 150 caractères
- CTA: learn_more, contact_us

### 5. Twitter/X

**Forces:**
- Actualité en temps réel
- Conversations directes
- Audience engagée

**Dimensions:**
- Feed: 1200×675px

**Budget min:** $5/jour
**CTR moyen:** 1.2%
**CPC moyen:** $0.75

**Copywriting:**
- 280 caractères max
- 2 hashtags
- CTA: shop_now, learn_more

---

## 🖼️ Génération de visuels IA

### Modèles supportés

#### DALL-E 3 (OpenAI)
- **Forces:** Photoréaliste, texte dans l'image
- **Coût:** $0.04/image
- **Recommandé pour:** Facebook, LinkedIn

#### Midjourney v6
- **Forces:** Artistique, esthétique
- **Coût:** $0.02/image
- **Recommandé pour:** Instagram, TikTok

#### Stable Diffusion XL
- **Forces:** Rapide, personnalisable
- **Coût:** $0.01/image
- **Recommandé pour:** Carrousel, tests A/B

### Exemples de prompts générés

**E-commerce Mode:**
```
Professional commercial advertisement for Sneakers Nike Air Max.
Fashion photography, styled product shot, lifestyle context.
Modern, clean, minimalist design with bold typography.
Color palette: #FF6B6B, #4ECDC4, #45B7D1.
Aspect ratio 1200:630.
High quality, 4K resolution, commercial photography.
```

**Tech TikTok:**
```
15-second video advertisement for iPhone 15 Pro.
Product category: tech.
Style: vibrant.
Dynamic camera movement, product showcase, lifestyle scenes.
Platform: tiktok.
Aspect ratio: 9:16 (vertical).
```

---

## 🎯 Ciblage d'audience

### Ciblage par catégorie

**Fashion:**
- Âge: 18-45
- Intérêts: Fashion & Beauty, Shopping, Clothing, Trends
- Placements: Instagram > Facebook > TikTok

**Tech:**
- Âge: 22-50
- Intérêts: Technology, Gadgets, Innovation, Software
- Placements: Facebook > LinkedIn > Twitter

**Beauty:**
- Âge: 18-40
- Genre: Principalement féminin
- Intérêts: Beauty, Cosmetics, Skincare, Wellness
- Placements: Instagram > TikTok > Facebook

**B2B/SaaS:**
- Âge: 25-55
- Job Titles: CEO, Manager, Director
- Intérêts: Business, Entrepreneurship
- Placements: LinkedIn > Twitter > Facebook

### Optimisation automatique

Le système ajuste automatiquement:
1. **Taille d'audience** selon le budget
2. **Tranche d'âge** selon la plateforme (TikTok: 16-35, LinkedIn: 22-60)
3. **Intérêts** selon les données clients existantes
4. **Géolocalisation** selon les performances

---

## 💰 Budget et ROI

### Benchmarks par plateforme

| Plateforme | CPM | CPC | CTR | Conv Rate | ROAS moyen |
|------------|-----|-----|-----|-----------|------------|
| Facebook | $12.50 | $1.20 | 1.5% | 2.5% | 4-6x |
| Instagram | $8.50 | $0.90 | 1.8% | 2.0% | 3-5x |
| TikTok | $10.00 | $0.50 | 2.5% | 1.5% | 5-8x |
| LinkedIn | $30.00 | $5.50 | 0.8% | 3.5% | 3-4x |
| Twitter | $6.50 | $0.75 | 1.2% | 1.8% | 2-4x |

### Calculateur de budget

**Exemple:**
- Objectif: 20 conversions
- AOV (Average Order Value): $50
- Plateforme: Facebook

**Calcul:**
1. Clicks requis = 20 / 0.025 = 800 clicks
2. Impressions requises = 800 / 0.015 = 53,333 impressions
3. Budget = (53,333 / 1000) × $12.50 = **$667**
4. Budget journalier sur 14 jours = **$48/jour**
5. Revenu attendu = 20 × $50 = **$1,000**
6. ROAS = $1,000 / $667 = **1.50x**

---

## 🧠 Score de confiance IA

Le système calcule un score de confiance (0.00 à 1.00) basé sur:

### Composantes du score

1. **Qualité du copy (25%)**
   - Respect des limites de caractères
   - Présence d'emojis (0-3)
   - Présence de CTA
   - Hashtags appropriés

2. **Qualité du visuel (30%)**
   - Qualité du prompt
   - Modèle IA utilisé
   - Respect des dimensions

3. **Qualité du ciblage (30%)**
   - Ratio audience/budget
   - Spécificité des intérêts
   - Tranche d'âge appropriée
   - Géolocalisation

4. **Adéquation du budget (15%)**
   - Budget ≥ budget minimum
   - Budget vs objectifs

### Interprétation

- **0.90-1.00:** Excellente - Très haute probabilité de succès
- **0.75-0.89:** Bonne - Bonne probabilité de succès
- **0.60-0.74:** Moyenne - Optimisations recommandées
- **<0.60:** Faible - Révision nécessaire

---

## 📈 Recommandations IA

Le système génère automatiquement des recommandations:

### Types de recommandations

#### 1. Change Creative (CTR < 1.0%)
```json
{
  "type": "change_creative",
  "title": "Taux de clic faible",
  "description": "Votre CTR (0.8%) est inférieur à la moyenne. Essayez un nouveau visuel ou slogan.",
  "priority": "high",
  "estimatedImpact": {
    "metric": "clicks",
    "increase_pct": 30,
    "confidence": 0.75
  }
}
```

#### 2. Increase Budget (CTR > 2.0%)
```json
{
  "type": "increase_budget",
  "title": "Performance excellente",
  "description": "Votre annonce performe bien (CTR 2.5%). Augmentez le budget pour maximiser les résultats.",
  "priority": "medium",
  "estimatedImpact": {
    "metric": "conversions",
    "increase_pct": 50,
    "confidence": 0.85
  }
}
```

#### 3. Adjust Targeting
```json
{
  "type": "adjust_targeting",
  "title": "Ciblage à optimiser",
  "description": "Dépenses élevées mais peu de conversions. Affinez votre audience.",
  "priority": "urgent",
  "estimatedImpact": {
    "metric": "cost_per_conversion",
    "decrease_pct": 40,
    "confidence": 0.70
  }
}
```

---

## 🧪 Tests

### Exécuter les tests

```bash
# Tous les tests
npm test

# Tests avec coverage
npm test -- --coverage

# Tests spécifiques
npm test -- adEngine.test.ts
```

### Couverture

- ✅ Génération de copy (tous tones, toutes plateformes)
- ✅ Génération de visuels (image, video, carousel)
- ✅ Optimisation de ciblage
- ✅ Recommandations de budget
- ✅ Score de confiance IA

---

## 🎯 Cas d'usage

### 1. E-commerce: Lancement de produit

```javascript
const ad = await generateSocialAd({
  merchantId: 'store-123',
  platform: 'instagram',
  objective: 'conversions',
  productName: 'Nike Air Max 2024',
  productCategory: 'fashion',
  budget: 100,
  format: 'carousel',
  desiredConversions: 25
});

// Résultat: Carrousel de 3 images + ciblage mode 18-35 ans
```

### 2. SaaS B2B: Lead Generation

```javascript
const ad = await generateSocialAd({
  merchantId: 'saas-456',
  platform: 'linkedin',
  objective: 'traffic',
  productName: 'CRM Platform Pro',
  productCategory: 'tech',
  budget: 75,
  format: 'image',
  desiredConversions: 15
});

// Résultat: Copy professionnel + ciblage managers/CEOs
```

### 3. TikTok Viral: Produit tendance

```javascript
const ad = await generateSocialAd({
  merchantId: 'viral-789',
  platform: 'tiktok',
  objective: 'awareness',
  productName: 'Viral Beauty Gadget',
  productCategory: 'beauty',
  budget: 100,
  format: 'video',
  desiredConversions: 50
});

// Résultat: Vidéo 15s + copy viral + hashtags #fyp
```

---

## 🔧 Configuration avancée

### Variables d'environnement

```bash
# Base de données
DB_HOST=localhost
DB_PORT=5432
DB_NAME=molam_connect
DB_USER=postgres
DB_PASSWORD=your_password

# Serveur
PORT=3076
NODE_ENV=production

# IA (optionnel)
OPENAI_API_KEY=sk-...
STABILITY_AI_KEY=...
MIDJOURNEY_API_KEY=...

# Stockage
S3_BUCKET=molam-ai-creatives
S3_REGION=us-east-1
```

---

## 🚨 Limites et quotas

### Limites par plateforme

| Plateforme | Images/jour | Campagnes/jour | Budget min/jour |
|------------|-------------|----------------|-----------------|
| Facebook | 1000 | 50 | $5 |
| Instagram | 1000 | 50 | $5 |
| TikTok | 500 | 20 | $20 |
| LinkedIn | 200 | 20 | $10 |
| Twitter | 500 | 30 | $5 |

### Quotas IA

- **DALL-E 3:** 50 images/minute
- **Midjourney:** 200 images/heure
- **Stable Diffusion:** Illimité (self-hosted)

---

## 🛣️ Roadmap

### Q3 2024
- [ ] Intégration Meta Business API (Facebook/Instagram native)
- [ ] Intégration TikTok Ads API
- [ ] Intégration LinkedIn Campaign Manager API
- [ ] A/B testing automatique sur créatives

### Q4 2024
- [ ] Génération vidéo avancée (Runway ML)
- [ ] Optimisation dynamique de budgets
- [ ] Lookalike audiences automatiques
- [ ] Retargeting intelligent

### 2025
- [ ] Support YouTube Ads
- [ ] Support Snapchat Ads
- [ ] Support Pinterest Ads
- [ ] Machine learning prédictif pour ROAS

---

## 📚 Ressources

### Documentation connexe

- [Brique 70quinquies - AI Campaign Generator](../brique-70quinquies/README.md)
- [Brique 70quater - Predictive Pricing](../brique-70quater/README.md)
- [Brique 70ter - Auto-Learning Engine](../brique-70ter/README.md)

### APIs de plateformes

- [Meta Business API](https://developers.facebook.com/docs/marketing-apis)
- [TikTok Marketing API](https://ads.tiktok.com/marketing_api/docs)
- [LinkedIn Marketing Developer Platform](https://docs.microsoft.com/en-us/linkedin/marketing/)
- [Twitter Ads API](https://developer.twitter.com/en/docs/twitter-ads-api)

---

## 👥 Support

- 📧 Email: support@molam.com
- 💬 Slack: #brique-70sexies
- 📖 Wiki: https://docs.molam.com/briques/70sexies

---

## 📄 Licence

Copyright © 2024 MoLam Connect. Tous droits réservés.

---

**Généré avec ❤️ par l'équipe MoLam Connect - Sira Social Engine**
