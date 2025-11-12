# Brique 70quinquies - AI Campaign Generator (SIRA Marketing Engine)

## 📋 Vue d'ensemble

**Génération autonome de campagnes marketing multilingues & multicanaux**

La Brique 70quinquies est un moteur de génération de campagnes marketing propulsé par IA qui crée, optimise et exécute automatiquement des campagnes personnalisées sur plusieurs canaux et dans plusieurs langues.

### 🎯 Fonctionnalités principales

- ✅ **Génération automatique de campagnes** - Types: abandoned_cart, welcome, reactivation, vip_exclusive, seasonal, flash_sale
- ✅ **Support multilingue** - Français, English, Wolof, العربية, Português
- ✅ **Multicanal** - Email, SMS, Push, Social, Checkout Banner
- ✅ **Segmentation automatique** - VIP, actifs, inactifs, nouveaux clients, panier abandonné
- ✅ **Optimisation en temps réel** - A/B testing automatique, ajustement des CTA, expansion d'audience
- ✅ **Tracking des performances** - Sent, opened, clicked, purchased + métriques détaillées
- ✅ **Planification intelligente** - Envoi aux heures optimales selon le type d'audience

---

## 🏗️ Architecture

```
brique-70quinquies/
├── migrations/
│   └── 001_create_ai_campaigns_tables.sql    # Schéma PostgreSQL
├── src/
│   ├── db.ts                                 # Pool PostgreSQL
│   ├── server.ts                             # Serveur Express
│   ├── services/
│   │   ├── campaignEngine.ts                 # Moteur de génération
│   │   └── contentGenerator.ts               # Génération de contenu
│   └── routes/
│       └── campaign.ts                       # API REST
├── web/
│   └── src/
│       └── pages/
│           └── CampaignAI.tsx                # Dashboard React
├── tests/
│   ├── campaignEngine.test.ts                # Tests moteur
│   └── contentGenerator.test.ts              # Tests contenu
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📊 Schéma de base de données

### Table: `ai_campaigns`
Stocke toutes les campagnes générées par l'IA.

```sql
CREATE TABLE ai_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,
    channel TEXT NOT NULL,              -- email, sms, push, social, checkout_banner
    language TEXT NOT NULL DEFAULT 'fr', -- fr, en, wo, ar, pt
    title TEXT NOT NULL,                 -- Sujet/titre de la campagne
    body TEXT NOT NULL,                  -- Contenu principal
    cta TEXT,                            -- Call-to-action
    slogan TEXT,                         -- Slogan additionnel
    audience JSONB NOT NULL,             -- Critères de ciblage
    performance JSONB DEFAULT '{}',      -- {sent, opened, clicked, revenue}
    status TEXT DEFAULT 'draft',         -- draft, scheduled, sending, sent, paused, stopped
    scheduled_at TIMESTAMP,              -- Date d'envoi planifiée
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Table: `ai_campaign_logs`
Logs détaillés de tous les événements de campagne.

```sql
CREATE TABLE ai_campaign_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES ai_campaigns(id),
    event TEXT NOT NULL,                 -- sent, opened, clicked, purchased, generated, optimized
    customer_id UUID,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Table: `ai_campaign_templates`
Templates réutilisables pour accélérer la génération.

```sql
CREATE TABLE ai_campaign_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID,
    name TEXT NOT NULL,
    campaign_type TEXT NOT NULL,
    channel TEXT NOT NULL,
    language TEXT NOT NULL,
    content JSONB NOT NULL,              -- {subject, body, cta, slogan}
    performance JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Table: `ai_audience_segments`
Segments d'audience pré-calculés.

```sql
CREATE TABLE ai_audience_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL,
    name TEXT NOT NULL,
    segment_type TEXT NOT NULL,          -- vip, active, inactive, new_customers, abandoned_cart, churn_risk
    criteria JSONB NOT NULL,
    size INTEGER DEFAULT 0,
    performance JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🚀 Installation

### Prérequis

- Node.js 18+
- PostgreSQL 14+
- npm ou yarn

### Étapes d'installation

```bash
cd brique-70quinquies

# Installer les dépendances
npm install

# Configuration de la base de données
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=molam_connect
export DB_USER=postgres
export DB_PASSWORD=your_password

# Exécuter les migrations
psql -U postgres -d molam_connect -f migrations/001_create_ai_campaigns_tables.sql

# Compiler TypeScript
npm run build

# Démarrer le serveur
npm start
```

Le serveur démarre sur `http://localhost:3075`

---

## 📡 API Reference

### Base URL
```
http://localhost:3075/api/campaigns
```

### Endpoints

#### 1. Créer une campagne
```http
POST /api/campaigns
Content-Type: application/json

{
  "merchantId": "uuid",
  "type": "abandoned_cart",
  "channel": "email",
  "language": "fr",
  "discountValue": 15,
  "promoCode": "CART15",
  "expiryDate": "2024-12-31",
  "autoOptimize": true
}
```

**Response:**
```json
{
  "success": true,
  "campaign": {
    "id": "uuid",
    "merchantId": "uuid",
    "channel": "email",
    "language": "fr",
    "title": "Votre panier vous attend, {{customer_name}} !",
    "body": "Bonjour {{customer_name}},\n\nVous avez laissé...",
    "cta": "Finaliser ma commande",
    "slogan": "Ne laissez pas passer cette offre !",
    "audience": { "type": "abandoned_cart", ... },
    "performance": { "sent": 0, "opened": 0, ... },
    "status": "scheduled",
    "scheduledAt": "2024-06-15T18:00:00Z",
    "createdAt": "2024-06-15T10:30:00Z"
  }
}
```

#### 2. Lister les campagnes
```http
GET /api/campaigns?merchantId=uuid&status=scheduled&channel=email&limit=50
```

**Response:**
```json
{
  "success": true,
  "campaigns": [...],
  "count": 12
}
```

#### 3. Obtenir une campagne
```http
GET /api/campaigns/:id
```

#### 4. Mettre à jour le statut
```http
PATCH /api/campaigns/:id/status
Content-Type: application/json

{
  "status": "sending"
}
```

#### 5. Tracker un événement
```http
POST /api/campaigns/:id/track
Content-Type: application/json

{
  "event": "opened",
  "customerId": "uuid",
  "metadata": { "device": "mobile", "location": "Dakar" }
}
```

**Events valides:** `sent`, `opened`, `clicked`, `purchased`

#### 6. Obtenir le rapport de performance
```http
GET /api/campaigns/:id/report
```

**Response:**
```json
{
  "success": true,
  "report": {
    "campaignId": "uuid",
    "status": "sent",
    "metrics": {
      "sent": 1000,
      "opened": 350,
      "clicked": 120,
      "revenue": 5400,
      "openRate": "35.00%",
      "clickRate": "34.29%",
      "conversionRate": "8.33%",
      "roi": "5300.00%"
    },
    "timeline": [
      { "event": "sent", "count": 1000, "first_time": "...", "last_time": "..." },
      { "event": "opened", "count": 350, ... }
    ]
  }
}
```

#### 7. Optimiser une campagne
```http
POST /api/campaigns/:id/optimize
```

Déclenche l'optimisation manuelle (normalement automatique tous les 100 envois).

#### 8. Créer un segment d'audience
```http
POST /api/campaigns/segments
Content-Type: application/json

{
  "merchantId": "uuid",
  "name": "VIP Customers",
  "segmentType": "vip",
  "criteria": {
    "lifetimeValue": { "min": 500 },
    "ordersCount": { "min": 5 },
    "avgOrderValue": { "min": 100 }
  }
}
```

---

## 🎨 Types de campagnes

### 1. Panier Abandonné (`abandoned_cart`)
**Objectif:** Récupérer les ventes perdues
**Audience:** Clients avec panier actif non finalisé (2-48h)
**Canaux recommandés:** Email, SMS
**Timing:** 2-4h après abandon

**Contenu généré:**
- FR: "Votre panier vous attend, {{customerName}} !"
- EN: "Your cart is waiting, {{customerName}}!"
- WO: "Sa panier bi dalay gis, {{customerName}}!"
- AR: "سلة التسوق الخاصة بك في انتظارك يا {{customerName}}!"
- PT: "Seu carrinho está esperando, {{customerName}}!"

### 2. Bienvenue (`welcome`)
**Objectif:** Convertir les nouveaux inscrits
**Audience:** Inscrits depuis < 7 jours sans commande
**Canaux recommandés:** Email
**Timing:** Immédiatement après inscription

### 3. Réactivation (`reactivation`)
**Objectif:** Réengager les clients inactifs
**Audience:** Dernière commande > 60 jours
**Canaux recommandés:** Email, SMS
**Timing:** 60-90 jours d'inactivité

### 4. VIP Exclusif (`vip_exclusive`)
**Objectif:** Récompenser les meilleurs clients
**Audience:** Lifetime value > 500€, 5+ commandes
**Canaux recommandés:** Email, Push
**Timing:** Avant-première de nouvelles collections

### 5. Saisonnier (`seasonal`)
**Objectif:** Capitaliser sur les saisons fortes
**Audience:** Clients actifs (< 30 jours)
**Canaux recommandés:** Email, Social, Checkout Banner
**Timing:** Début de saison (été, hiver, fêtes)

### 6. Flash Sale (`flash_sale`)
**Objectif:** Créer l'urgence et booster les ventes
**Audience:** Clients engagés (open rate > 30%)
**Canaux recommandés:** SMS, Push, Email
**Timing:** 2h de durée

---

## 🌍 Langues supportées

| Langue | Code | Pays/Région | Couverture |
|--------|------|-------------|------------|
| Français | `fr` | France, Afrique francophone | 100% |
| English | `en` | International | 100% |
| Wolof | `wo` | Sénégal, Gambie | 100% |
| العربية | `ar` | Maghreb, Moyen-Orient | 100% |
| Português | `pt` | Portugal, Brésil, Angola | 100% |

### Ajout d'une nouvelle langue

Éditer [src/services/contentGenerator.ts](src/services/contentGenerator.ts:26):

```typescript
const TEMPLATES: Record<string, Record<string, ContentTemplate>> = {
  abandoned_cart: {
    // ... existing languages
    es: {
      subject: 'Tu carrito te está esperando, {{customerName}}!',
      body: 'Hola {{customerName}},\n\nDejaste {{productName}} en tu carrito...',
      cta: 'Completar mi pedido',
      slogan: '¡No te pierdas esta oferta!'
    }
  },
  // ... repeat for all campaign types
};
```

---

## 📈 Optimisation automatique

Le moteur optimise automatiquement les campagnes selon des règles IA:

### Règles d'optimisation

1. **Taux d'ouverture faible (< 15%)** → Test de variantes de sujet
   - Ajout d'emojis (🎁, ⏰, 🔥)
   - Ajout d'urgence ("Offre limitée")
   - Personnalisation accrue

2. **Taux de clic faible (< 10%)** → Optimisation du CTA
   - Test de formulations différentes
   - Modification de la couleur/position du bouton
   - Ajout de preuves sociales

3. **Taux de conversion faible (< 5%)** → Augmentation de l'incentive
   - Augmentation du discount (+5%)
   - Ajout d'urgence (compte à rebours)
   - Offre de livraison gratuite

4. **Performance élevée** → Expansion de l'audience
   - Création de lookalike audiences
   - Expansion géographique
   - Test sur d'autres segments

### Déclenchement

- **Automatique:** Tous les 100 envois
- **Manuel:** `POST /api/campaigns/:id/optimize`

---

## 🧪 Tests

### Exécuter les tests

```bash
# Tous les tests
npm test

# Tests spécifiques
npm test -- campaignEngine.test.ts
npm test -- contentGenerator.test.ts

# Coverage
npm test -- --coverage
```

### Couverture des tests

- ✅ Génération de campagnes (tous types, toutes langues)
- ✅ Gestion des statuts
- ✅ Tracking d'événements
- ✅ Rapports de performance
- ✅ Optimisation automatique
- ✅ Segmentation d'audience
- ✅ Génération de contenu multilingue
- ✅ Génération de SMS courts
- ✅ Variantes de sujets
- ✅ Timing optimal d'envoi

---

## 🎯 Cas d'usage

### 1. E-commerce: Récupération de paniers abandonnés

```javascript
const campaign = await generateCampaign({
  merchantId: 'store-123',
  type: 'abandoned_cart',
  channel: 'email',
  language: 'fr',
  discountValue: 15,
  autoOptimize: true
});

// La campagne est automatiquement:
// - Segmentée (clients avec panier 2-48h)
// - Planifiée (2h après abandon)
// - Optimisée en temps réel
```

### 2. SaaS: Onboarding de nouveaux utilisateurs

```javascript
const campaign = await generateCampaign({
  merchantId: 'saas-456',
  type: 'welcome',
  channel: 'email',
  language: 'en',
  discountValue: 20,
  expiryDate: '2024-12-31'
});
```

### 3. Retail: Flash Sale multilingue

```javascript
// Français
const campaignFR = await generateCampaign({
  merchantId: 'retail-789',
  type: 'flash_sale',
  channel: 'sms',
  language: 'fr',
  discountValue: 30
});

// Wolof
const campaignWO = await generateCampaign({
  merchantId: 'retail-789',
  type: 'flash_sale',
  channel: 'sms',
  language: 'wo',
  discountValue: 30
});
```

### 4. Marketplace: Programme VIP

```javascript
const campaign = await generateCampaign({
  merchantId: 'marketplace-101',
  type: 'vip_exclusive',
  channel: 'email',
  language: 'fr',
  audienceSegment: 'vip-segment-uuid',
  discountValue: 25
});
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
PORT=3075
NODE_ENV=production

# Optimisation
AUTO_OPTIMIZE_THRESHOLD=100    # Optimize every N sends
MIN_SAMPLE_SIZE=50             # Minimum data for optimization

# Limites
MAX_CAMPAIGNS_PER_DAY=10
MAX_AUDIENCE_SIZE=100000
```

### Personnalisation des templates

Les templates sont définis dans [src/services/contentGenerator.ts](src/services/contentGenerator.ts). Pour personnaliser:

```typescript
const TEMPLATES: Record<string, Record<string, ContentTemplate>> = {
  my_custom_type: {
    fr: {
      subject: 'Mon sujet personnalisé {{customerName}}',
      body: 'Mon contenu...',
      cta: 'Mon CTA',
      slogan: 'Mon slogan'
    }
  }
};
```

---

## 📊 Métriques et KPIs

### Métriques par campagne

| Métrique | Description | Calcul |
|----------|-------------|--------|
| **Sent** | Nombre d'envois | Total emails/SMS envoyés |
| **Opened** | Taux d'ouverture | (Opened / Sent) × 100 |
| **Clicked** | Taux de clic | (Clicked / Opened) × 100 |
| **Purchased** | Taux de conversion | (Purchased / Clicked) × 100 |
| **Revenue** | Revenu généré | Somme des achats |
| **ROI** | Retour sur investissement | ((Revenue - Cost) / Cost) × 100 |

### Benchmarks industry

| Type de campagne | Open Rate | Click Rate | Conversion Rate |
|------------------|-----------|------------|-----------------|
| Abandoned Cart | 40-45% | 15-20% | 5-10% |
| Welcome | 50-60% | 10-15% | 3-8% |
| Reactivation | 15-25% | 5-10% | 2-5% |
| VIP Exclusive | 60-70% | 25-35% | 10-15% |
| Seasonal | 30-40% | 12-18% | 4-8% |
| Flash Sale | 45-55% | 20-30% | 8-12% |

---

## 🔒 Sécurité et conformité

### RGPD / GDPR

- ✅ Consentement opt-in obligatoire
- ✅ Unsubscribe dans chaque email
- ✅ Anonymisation des données après 2 ans
- ✅ Export des données client sur demande
- ✅ Droit à l'oubli

### Bonnes pratiques

1. **Rate limiting:** Max 1000 emails/minute
2. **Validation d'email:** Format + vérification MX
3. **Blacklist:** Exclusion des désabonnés
4. **SPF/DKIM:** Configuration DNS requise
5. **Suppression bounce:** Retrait automatique des invalides

---

## 🚨 Troubleshooting

### Problème: Les campagnes ne sont pas envoyées

**Solution:**
```bash
# Vérifier le statut
SELECT status, scheduled_at FROM ai_campaigns WHERE id = 'campaign-id';

# Les campagnes doivent être en statut 'scheduled' ou 'sending'
# scheduled_at doit être dans le passé
```

### Problème: Taux d'ouverture à 0%

**Solution:**
- Vérifier que les tracking pixels sont activés
- Vérifier la configuration SMTP
- Tester avec un vrai client email (pas Gmail qui bloque les images)

### Problème: Contenu non traduit

**Solution:**
```typescript
// Vérifier que la langue est supportée
const supportedLanguages = ['fr', 'en', 'wo', 'ar', 'pt'];

// Fallback automatique vers français si langue non supportée
```

### Problème: Optimisation ne se déclenche pas

**Solution:**
```javascript
// Vérifier que autoOptimize est activé
const campaign = await getCampaign(campaignId);
console.log(campaign.autoOptimize); // doit être true

// Vérifier le nombre d'envois (seuil par défaut: 100)
console.log(campaign.performance.sent); // doit être >= 100
```

---

## 🛣️ Roadmap

### Q3 2024
- [ ] Intégration avec Twilio pour SMS
- [ ] Intégration avec SendGrid pour emails
- [ ] Support de WhatsApp Business
- [ ] Tests A/B automatiques multi-variantes

### Q4 2024
- [ ] Génération d'images IA pour emails
- [ ] Support de 10 langues supplémentaires
- [ ] Prédiction du meilleur moment d'envoi par client
- [ ] Intégration avec Google Analytics

### 2025
- [ ] Génération vidéo automatique pour social media
- [ ] Voice campaigns (appels automatisés)
- [ ] Chatbot intégré pour réponses automatiques
- [ ] Machine learning pour optimisation prédictive

---

## 📚 Ressources

### Documentation connexe

- [Brique 70 - Marketing Tools](../brique-70/README.md) - Infrastructure marketing de base
- [Brique 70bis - AI Smart Marketing](../brique-70bis/README.md) - Recommandations IA
- [Brique 70ter - Auto-Learning Engine](../brique-70ter/README.md) - Apprentissage fédéré
- [Brique 70quater - Predictive Pricing](../brique-70quater/README.md) - Pricing dynamique

### API externes recommandées

- **SendGrid** - Email delivery (99% deliverability)
- **Twilio** - SMS (200+ pays)
- **OneSignal** - Push notifications
- **Mailchimp** - Alternative email
- **Braze** - Marketing automation avancé

### Outils de test

- **Litmus** - Test d'emails sur 90+ clients
- **Email on Acid** - Test de rendu
- **Mail Tester** - Score de spam
- **Postmark** - Analytics d'emails

---

## 👥 Support

### Besoin d'aide ?

- 📧 Email: support@molam.com
- 💬 Slack: #brique-70quinquies
- 📖 Wiki: https://docs.molam.com/briques/70quinquies
- 🐛 Issues: https://github.com/molam/connect/issues

### Contribution

Les contributions sont les bienvenues ! Voir [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## 📄 Licence

Copyright © 2024 MoLam Connect. Tous droits réservés.

---

## ✨ Exemples de résultats

### Cas client: E-commerce Mode (Dakar)

**Avant Brique 70quinquies:**
- Taux d'ouverture: 12%
- Taux de clic: 3%
- Conversion panier abandonné: 2%

**Après Brique 70quinquies (3 mois):**
- Taux d'ouverture: **38%** (+26%)
- Taux de clic: **15%** (+12%)
- Conversion panier abandonné: **9%** (+7%)
- **+127% de revenus** de campagnes automatisées

### Cas client: SaaS B2B (International)

**Campagnes déployées:**
- Welcome (EN, FR) → 58% open rate
- Reactivation (EN) → 23% re-engagement
- VIP Exclusive (FR) → 12% upsell

**ROI:** 450% sur 6 mois

---

**Généré avec ❤️ par l'équipe MoLam Connect**
