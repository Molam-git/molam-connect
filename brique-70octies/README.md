# Brique 70octies - AI Loyalty Engine (Sira)

## 📋 Vue d'ensemble

**Moteur de fidélité universel propulsé par IA pour programmes de récompenses dynamiques**

La Brique 70octies est un système de fidélité intelligent qui utilise Sira AI pour calculer dynamiquement les points, gérer les niveaux (tiers), offrir du cashback personnalisé et générer des campagnes optimisées.

### 🎯 Fonctionnalités principales

- ✅ **Calcul de points dynamique IA** - Bonus intelligents basés sur comportement client
- ✅ **4 niveaux de fidélité** - Basic, Silver, Gold, Platinum avec multiplicateurs
- ✅ **Cashback personnalisé** - Taux adapté par Sira selon profil client
- ✅ **Cross-module loyalty** - Points valables sur Shop, Eats, Talk, Free
- ✅ **Campagnes AI-driven** - Recommandations automatiques de Sira
- ✅ **Prédiction de churn** - Score de risque d'abandon calculé par IA
- ✅ **Règles personnalisables** - Ops control avec Sira copilote
- ✅ **Récompenses catalog** - Discounts, produits gratuits, cashback

---

## 🏗️ Architecture

```
brique-70octies/
├── migrations/
│   └── 001_create_loyalty_tables.sql      # 8 tables + fonctions
├── src/
│   ├── db.ts
│   ├── server.ts
│   ├── services/
│   │   └── loyaltyEngine.ts               # Moteur IA principal
│   └── routes/
│       └── loyalty.ts                     # API REST
├── web/
│   └── src/pages/LoyaltyDashboard.tsx     # Dashboard React
├── tests/loyaltyEngine.test.ts
├── package.json
└── README.md
```

---

## 📊 Schéma de base de données

### Tables principales

1. **loyalty_programs** - Programmes de fidélité par marchand
2. **loyalty_balances** - Soldes de points par utilisateur
3. **loyalty_transactions** - Historique earn/redeem
4. **loyalty_tiers** - Définitions des niveaux (Basic → Platinum)
5. **loyalty_rewards** - Catalogue de récompenses
6. **loyalty_redemptions** - Historique de rachats
7. **loyalty_campaigns** - Campagnes AI
8. **loyalty_rules** - Règles personnalisées (Ops control)

### Fonctions SQL automatiques

- `calculate_tier()` - Calcule le tier basé sur points/spend
- `update_tier_on_transaction()` - Upgrade auto du tier
- `expire_old_points()` - Expiration automatique de points

---

## 🚀 Installation

```bash
cd brique-70octies
npm install

# Configuration DB
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=molam_connect
export DB_USER=postgres
export DB_PASSWORD=your_password

# Migrations
psql -U postgres -d molam_connect -f migrations/001_create_loyalty_tables.sql

# Build & Start
npm run build
npm start  # Port 3077
```

---

## 📡 API Reference

### Base URL: `http://localhost:3077/api/loyalty`

#### 1. Créer un programme
```http
POST /programs
{
  "merchantId": "uuid",
  "name": "MoLam Rewards",
  "currency": "points",
  "earnRate": 0.02,
  "enableTiers": true,
  "enableCashback": false,
  "aiEnabled": true
}
```

#### 2. Attribution de points (webhook transaction)
```http
POST /award
{
  "programId": "uuid",
  "userId": "uuid",
  "transaction": {
    "id": "txn-123",
    "merchant_id": "merchant-1",
    "user_id": "user-456",
    "amount": 100,
    "module": "shop",
    "product_category": "electronics"
  }
}
```

**Response:**
```json
{
  "success": true,
  "pointsAwarded": 3.5,
  "newBalance": 1503.5,
  "transaction": {
    "base_amount": 2,
    "multiplier": 1.25,
    "ai_bonus": 1.0,
    "ai_reason": "High-value purchase bonus, Cross-module promotion"
  }
}
```

#### 3. Racheter des points
```http
POST /redeem
{
  "balanceId": "uuid",
  "points": 500,
  "rewardId": "reward-uuid"
}
```

#### 4. Voir le solde utilisateur
```http
GET /balances/:userId?programId=uuid
```

#### 5. Générer recommandations IA
```http
POST /campaigns/recommend
{
  "merchantId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "recommendations": [
    {
      "type": "bonus_points",
      "title": "Reactivate Inactive Users",
      "description": "300 users haven't earned points in 30 days. Offer 2x points for 7 days.",
      "target_segment": "inactive",
      "bonus_multiplier": 2.0,
      "expected_participation_rate": 25,
      "expected_revenue_impact": 3750,
      "ai_confidence_score": 0.75
    }
  ]
}
```

---

## 🤖 Sira AI - Calcul de points

### Règles AI intégrées

| Règle | Condition | Bonus |
|-------|-----------|-------|
| **High-value purchase** | Transaction > $500 | +1% extra |
| **Churn prevention** | Churn risk > 0.7 | +2% retention bonus |
| **Frequent shopper** | Last purchase < 7 days | +0.5% |
| **First daily purchase** | First of the day | +10 points fixe |
| **Cross-module promo** | Module = Eats | +1.5% |
| **Surprise bonus** | Random 10% chance | +5% (high/max AI level) |

### Exemple de calcul

**Transaction:** $100 sur Eats, client Silver tier (1.25x), pas d'achat depuis 20 jours

1. **Base points:** $100 × 2% = 2 points
2. **Tier multiplier:** 2 × 1.25 = 2.5 points
3. **AI bonus:**
   - Cross-module (Eats): +$100 × 1.5% = 1.5 points
   - First daily purchase: +10 points
   - **Total AI bonus:** 11.5 points
4. **Total final:** 2.5 + 11.5 = **14 points**

---

## 💎 Tiers (Niveaux de fidélité)

| Tier | Seuil Points | Seuil Spend | Multiplicateur | Avantages |
|------|--------------|-------------|----------------|-----------|
| **Basic** ⚪ | 0+ | $0+ | 1.0x | Points de base |
| **Silver** ⚫ | 1,000+ | $500+ | 1.25x | +25% points |
| **Gold** 🥇 | 5,000+ | $2,500+ | 1.5x | +50% points, livraison gratuite |
| **Platinum** 💎 | 20,000+ | $10,000+ | 2.0x | Double points, cashback 5%, support prioritaire |

### Upgrade automatique

Dès qu'un utilisateur atteint le seuil (points OU spend), le tier est automatiquement upgradé via trigger SQL.

---

## 🎯 Cas d'usage

### 1. E-commerce: Programme de fidélité standard

```javascript
// Créer programme
const program = await createProgram({
  merchantId: 'store-123',
  name: 'MoLam Rewards',
  earnRate: 0.02,  // 2%
  enableTiers: true,
  aiEnabled: true
});

// Attribution automatique sur achat
await awardPoints(program.id, userId, {
  merchant_id: 'store-123',
  user_id: userId,
  amount: 250,
  module: 'shop'
});
// Résultat: ~5-8 points selon tier + AI bonus
```

### 2. Marketplace: Cross-module loyalty

```javascript
// Un achat dans Shop donne des points
await awardPoints(programId, userId, {
  amount: 100,
  module: 'shop'
});

// Même utilisateur commande dans Eats → bonus extra
await awardPoints(programId, userId, {
  amount: 50,
  module: 'eats'  // +1.5% AI bonus
});
```

### 3. Prévention de churn

```javascript
// Sira détecte churn risk élevé (0.8)
// Attribution avec bonus auto pour rétention
await awardPoints(programId, userId, {
  amount: 100,
  module: 'shop'
});
// Points = 2 (base) × 1.25 (Silver) + 2 (AI churn bonus) = 4.5
```

---

## 📈 Recommandations IA

Sira génère automatiquement 3 types de recommandations:

### 1. Reactivation (Inactive Users)

**Condition:** > 20% users inactifs (30+ jours)

**Action:** Campagne 2x points pendant 7 jours

**ROI prédit:** 25% participation, +$3,750 revenu

### 2. Tier Upgrade Campaign

**Condition:** > 70% users en Basic tier

**Action:** Bonus 500 points pour aider à atteindre Silver

**ROI prédit:** 40% participation, +$4,000 revenu

### 3. Churn Prevention

**Condition:** Churn risk moyen > 0.5

**Action:** 5% cashback pour clients à risque

**ROI prédit:** 60% participation, +$7,200 revenu

---

## 🔧 Ops Control - Règles personnalisées

Les équipes Ops peuvent créer des règles custom :

```sql
INSERT INTO loyalty_rules (program_id, rule_name, rule_type, conditions, actions, priority, enabled)
VALUES (
  'program-uuid',
  'Double points on Electronics',
  'earning',
  '{"product_category": "electronics", "min_amount": 100}',
  '{"multiply_points": 2, "add_bonus": 50}',
  200,
  TRUE
);
```

**Résultat:** Tout achat > $100 en électronique donne 2x points + 50 points bonus

---

## 🧪 Tests

```bash
npm test
npm test -- --coverage
```

---

## 🎁 Catalogue de récompenses

### Types de récompenses

| Type | Description | Exemple |
|------|-------------|---------|
| **discount** | Réduction % ou fixe | 500 points = 10% off |
| **free_product** | Produit gratuit | 1000 points = Livraison gratuite |
| **free_shipping** | Frais de port offerts | 200 points |
| **cashback** | Cashback en devise | 5000 points = $50 cashback |
| **gift_card** | Carte cadeau | 10,000 points = $100 gift card |
| **custom** | Récompense personnalisée | VIP event access |

---

## 🌍 Cross-Module Loyalty

Modules supportés:
- ✅ **Shop** (E-commerce)
- ✅ **Eats** (Food delivery) - Bonus +1.5%
- ✅ **Talk** (Telecom/Mobile credit)
- ✅ **Free** (Freelance marketplace)

Configuration:
```json
{
  "cross_module_enabled": true,
  "allowed_modules": ["shop", "eats", "talk", "free"]
}
```

---

## 📊 Métriques et KPIs

### Métriques par programme

- Total users enrolled
- Active vs inactive users
- Avg tier distribution
- Total points issued
- Total points redeemed
- Redemption rate (%)
- Churn risk score (avg)

### Métriques par utilisateur

- Points balance
- Lifetime points earned
- Lifetime points redeemed
- Lifetime spend
- Current tier
- Tier progress (%)
- Churn risk score
- Engagement score
- Predicted next purchase (days)

---

## 🛣️ Roadmap

### Q3 2024
- [ ] Gamification features (badges, achievements)
- [ ] Referral program integration
- [ ] Birthday/anniversary bonuses
- [ ] Social sharing rewards

### Q4 2024
- [ ] Mobile app integration (QR code scanning)
- [ ] Push notifications for points/tiers
- [ ] Advanced ML models for churn prediction
- [ ] Lookalike audience targeting

---

## 📚 Ressources

**Documentation connexe:**
- [Brique 70 - Marketing Tools](../brique-70/README.md)
- [Brique 70sexies - AI Social Ads](../brique-70sexies/README.md)
- [Brique 70quinquies - AI Campaign Generator](../brique-70quinquies/README.md)

---

## 👥 Support

- 📧 Email: support@molam.com
- 💬 Slack: #brique-70octies
- 📖 Wiki: https://docs.molam.com/briques/70octies

---

## 📄 Licence

Copyright © 2024 MoLam Connect. Tous droits réservés.

---

**Généré avec ❤️ par l'équipe MoLam Connect - Sira Loyalty Engine**
