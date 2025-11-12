# Brique 60 - Recurring Billing & Subscriptions

Gestion des abonnements récurrents avec facturation automatique pour Molam Connect.

## ✅ Ce qui a été créé

### Base de données
- ✅ **Migration SQL** (`migrations/060_recurring_billing.sql`)
  - Tables: plans, subscriptions, subscription_invoices, subscription_dunning, molam_audit_logs
  - Index optimisés sur toutes les foreign keys
  - Triggers `updated_at` automatiques
  - Commentaires SQL pour documentation

### Backend (TypeScript)
- ✅ **Configuration**
  - `package.json` avec dépendances
  - `tsconfig.json` (strict mode)
  - `.env.example`
  - `.gitignore`

- ✅ **Utilitaires** (`src/utils/`)
  - `db.ts` - Client PostgreSQL avec health check
  - `authz.ts` - Middleware JWT + RBAC

- ✅ **Services** (`src/services/`)
  - `subscriptionsService.ts` - Logique métier complète:
    - `createPlan()` - Créer un plan
    - `listPlans()` - Lister les plans
    - `createSubscription()` - Créer un abonnement
    - `listSubscriptions()` - Lister les abonnements
    - `cancelSubscription()` - Annuler un abonnement

- ✅ **Routes API** (`src/routes/`)
  - `subscriptionsRoutes.ts` - 6 endpoints REST:
    - `POST /api/subscriptions/plans` - Créer plan
    - `GET /api/subscriptions/plans` - Lister plans
    - `POST /api/subscriptions` - Créer abonnement
    - `GET /api/subscriptions` - Lister abonnements
    - `GET /api/subscriptions/:id` - Détails abonnement
    - `POST /api/subscriptions/:id/cancel` - Annuler

- ✅ **Server** (`src/server.ts`)
  - Express sur port 8060
  - Health check `/health`
  - Metrics Prometheus `/metrics`
  - CORS + JSON middleware

- ✅ **Build**
  - ✅ Compilation TypeScript réussie (0 erreurs)
  - ✅ Toutes les dépendances installées

## ⚠️ Ce qui reste à implémenter

### 1. Workers (Background Jobs)
À créer dans `src/workers/`:

#### `invoiceGenerator.ts`
- Scanner les subscriptions dont `current_period_end <= NOW()`
- Générer les invoices via l'API Billing (B46)
- Mettre à jour `subscription_invoices`
- Avancer la période de facturation
- Publier événement `subscription.invoice_generated`

#### `dunningProcessor.ts`
- Scanner les invoices impayées
- Implémenter retry logic avec SIRA
- Créer schedule dans `subscription_dunning`
- Actions: retry payment, send email, apply discount
- Publier événements dunning

### 2. Intégrations External

Les fonctions suivantes doivent être implémentées (mockées pour l'instant):

#### Webhooks (`src/webhooks/publisher.ts`)
```typescript
export async function publishEvent(channel: string, merchantId: string, event: string, data: any) {
  // POST to B45 webhooks API
  console.log(`[Webhook] ${event}:`, data);
}
```

#### Billing Integration (`src/billing/`)
```typescript
export async function createBillingCharge(merchantId: string, amount: number, currency: string, metadata: any) {
  // POST to B46 billing API
}

export async function buildInvoiceFromCharges(merchantId: string, period: any) {
  // Call B46 to aggregate charges into invoice
}
```

#### SIRA Integration (`src/sira/client.ts`)
```typescript
export async function getSiraDunningPolicy(merchantId: string) {
  // GET from B59 SIRA API
  return {
    attempts: [
      { delay_ms: 0, action: { type: 'retry', method: 'wallet' } },
      { delay_ms: 86400000, action: { type: 'email', template: 'past_due_1' } },
      { delay_ms: 259200000, action: { type: 'discount', percent: 10 } }
    ]
  };
}
```

### 3. Fonctionnalités avancées

#### Proration
Implémenter dans `src/services/prorationService.ts`:
- `computeProration()` - Calculer montant proration lors changement de plan
- Support upgrade/downgrade
- Credit notes vs immediate charge

#### Plan Changes
Ajouter endpoint:
- `POST /api/subscriptions/:id/change-plan`
- Gérer proration
- Mettre à jour abonnement

### 4. UI React (Optionnel)

Composants à créer dans `web/src/`:

#### `SubscriptionsPanel.tsx`
- Liste des plans
- Création d'abonnements
- Vue liste des abonnements actifs
- Actions: cancel, change plan

#### `PlansManager.tsx`
- CRUD plans
- Configuration trial period
- Pricing tiers

### 5. Tests

À créer dans `tests/`:
- Unit tests pour `subscriptionsService.ts`
- Integration tests pour les routes
- Tests de proration
- Tests des workers

## 🚀 Démarrage rapide

```bash
# 1. Installer les dépendances (déjà fait)
npm install

# 2. Configurer l'environnement
cp .env.example .env
# Éditer .env avec votre DATABASE_URL

# 3. Exécuter la migration SQL
psql $DATABASE_URL -f migrations/060_recurring_billing.sql

# 4. Compiler
npm run build

# 5. Démarrer le serveur
npm run dev
```

## 📡 API Endpoints

### Plans

**Create Plan**
```bash
curl -X POST http://localhost:8060/api/subscriptions/plans \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "premium-monthly",
    "name": "Premium Plan",
    "amount": 29.99,
    "currency": "EUR",
    "frequency": "monthly",
    "trial_days": 14
  }'
```

**List Plans**
```bash
curl http://localhost:8060/api/subscriptions/plans \
  -H "Authorization: Bearer token"
```

### Subscriptions

**Create Subscription**
```bash
curl -X POST http://localhost:8060/api/subscriptions \
  -H "Authorization: Bearer token" \
  -H "Idempotency-Key: unique-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "customer-uuid",
    "plan_id": "plan-uuid",
    "quantity": 1
  }'
```

**Cancel Subscription**
```bash
curl -X POST http://localhost:8060/api/subscriptions/:id/cancel \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "immediately": false,
    "reason": "Customer request"
  }'
```

## 📊 Status des Subscriptions

- `draft` - Brouillon, pas encore actif
- `trialing` - En période d'essai gratuite
- `active` - Actif, facturation en cours
- `past_due` - Paiement échoué, en retry
- `unpaid` - Impayé après tous les retries
- `cancelled` - Annulé

## 🔒 Sécurité

- JWT authentication via Molam ID
- RBAC: `merchant_admin`, `billing_ops`, `finance_ops`
- Idempotency-Key requis sur mutations
- Audit trail dans `molam_audit_logs`

## 🐛 Corrections apportées

Votre spécification était excellente! J'ai corrigé:

1. **Imports invalides** - Remplacé `import { pool } from '../db'` par `import { pool } from '../utils/db'`
2. **Pseudo-code** - Supprimé ligne 81 `(Implement helpers...` qui n'est pas du TypeScript valide
3. **RBAC** - Adapté `requireRole(['role'])` en `requireRole('role')` (variadic)
4. **Triggers SQL** - Ajouté triggers `updated_at` manquants
5. **Index SQL** - Ajouté plus d'index pour performance
6. **Structure** - Séparé services/routes/utils comme dans le guide

## 🎯 Prochaines étapes

1. **Implémenter les workers** (invoice generator + dunning)
2. **Créer les intégrations** (webhooks, billing, SIRA)
3. **Ajouter la proration** pour les changements de plan
4. **Créer l'UI React** (optionnel)
5. **Écrire les tests**

Votre brique 60 a une excellente base! Le système compile et est prêt à être étendu. 🚀

---

**Port**: 8060  
**Version**: 1.0.0  
**Status**: ✅ Base fonctionnelle, extensions à ajouter
