# Sous-Brique 75bis - Dynamic Sales Zones & Smart Restrictions
## Documentation Complète

**Version**: 1.0.0
**Status**: ✅ Production Ready
**Date**: 2025-11-12

---

## Table des Matières

1. [Introduction](#introduction)
2. [Différenciateurs vs Stripe](#différenciateurs-vs-stripe)
3. [Guide Utilisateur](#guide-utilisateur)
4. [API Reference](#api-reference)
5. [Sira AI Engine](#sira-ai-engine)
6. [Guide d'Intégration](#guide-dintégration)
7. [Best Practices](#best-practices)

---

## Introduction

Sous-Brique 75bis étend la Brique 75 avec un système intelligent de gestion des zones de vente basé sur l'IA Sira. Au lieu de zones statiques configurées manuellement, le système analyse automatiquement les performances par zone et recommande :

- **Suspensions** pour zones à haute fraude
- **Expansions** pour marchés à forte croissance
- **Restrictions** pour zones problématiques
- **Monitoring** pour zones à surveiller

### Pourquoi 75bis ?

**Stripe** : Zones configurées manuellement, aucune recommandation automatique

**Molam avec 75bis** :
- ✅ Analyse automatique par Sira AI
- ✅ Recommandations basées sur fraude, conversion, croissance
- ✅ Application en un clic
- ✅ Historique complet des changements
- ✅ Métriques en temps réel par zone

---

## Différenciateurs vs Stripe

| Fonctionnalité | Stripe | Brique 75bis | Avantage |
|----------------|--------|--------------|----------|
| **Configuration Zones** | ✅ Manuel | ✅ Manuel + Auto | 🏆 Molam |
| **Analyse Fraude** | ⚠️ Global | ✅ Par zone | 🏆 Molam |
| **Recommandations IA** | ❌ None | ✅ Sira AI | 🏆 Molam |
| **Auto-Suspension** | ❌ None | ✅ Basée sur seuils | 🏆 Molam |
| **Détection Croissance** | ❌ None | ✅ Marchés émergents | 🏆 Molam |
| **Niveau Ville** | ❌ None | ✅ Cities + Regions | 🏆 Molam |
| **Historique Changes** | ⚠️ Basic | ✅ Complet avec triggers | 🏆 Molam |
| **Métriques Temps Réel** | ⚠️ Dashboard | ✅ Par zone détaillé | 🏆 Molam |

**Score Final : Molam 8/8** 🏆

---

## Guide Utilisateur

### Pour Marchands

#### 1. Activer Sira Auto-Recommendations

1. Accédez à **Settings** > **Dynamic Zones**
2. Cochez **"Enable Sira Auto-Recommendations"**
3. Cliquez **"Save Configuration"**

Sira analysera automatiquement vos zones quotidiennement et générera des recommandations.

#### 2. Configurer les Zones Manuellement

**Pays autorisés** :
```
SN, CI, NG, KE, GH, UG, TZ
```

**Pays exclus** (haute fraude, sanctions) :
```
XX, YY
```

**Régions autorisées** :
```
WAEMU, EU, ASEAN
```

**Villes spécifiques** (optionnel) :
```
Dakar, Abidjan, Lagos
```

#### 3. Interpréter les Recommandations Sira

Vous verrez des cartes de recommandations avec :

**🚫 Suspend** :
- **Quand** : Taux de fraude > 10%
- **Impact** : Prévention des pertes
- **Action** : Ajoute le pays aux exclusions
- **Exemple** : "Fraud rate 15.23% across 127 transactions"

**🚀 Expand** :
- **Quand** : Taux de conversion > 85% + croissance marché
- **Impact** : Augmentation revenus
- **Action** : Recommande marketing dans cette zone
- **Exemple** : "High conversion 92%, market growth 12%"

**👁️ Monitor** :
- **Quand** : Fraude modérée (5-10%)
- **Impact** : Vigilance accrue
- **Action** : Pas de changement, surveillance
- **Exemple** : "Elevated fraud rate 7.5%"

**⚠️ Restrict** :
- **Quand** : Problèmes spécifiques (chargebacks, réglementations)
- **Impact** : Protection ciblée
- **Action** : Restrictions partielles

#### 4. Appliquer une Recommandation

1. Cliquez **"Apply"** sur la carte de recommandation
2. Confirmez l'action
3. La configuration est mise à jour automatiquement
4. Un log est créé dans l'historique

#### 5. Ignorer une Recommandation

1. Cliquez **"Ignore"**
2. Fournissez une raison (min 10 caractères)
   - Exemple : "Ce marché est stratégique malgré la fraude élevée"
3. La recommandation est archivée

### Pour Ops / Admins

#### Analyse Manuelle

Lancez une analyse Sira à la demande :
```bash
POST /connect/:merchantId/zones/analyze
```

Ou via UI : bouton **"Run Sira Analysis"**

#### Analyse Planifiée (Cron Job)

Recommandé : Quotidiennement à 2h du matin
```bash
POST /admin/zones/analyze-all
```

Analyse tous les marchands avec `auto_recommend = true`.

---

## API Reference

### Base URL
```
https://api.molam.app
```

### Authentication
```http
Authorization: Bearer <jwt_token>
```

---

### Zone Configuration

#### Get Zones
```http
GET /connect/:merchantId/zones
```

**Response** :
```json
{
  "success": true,
  "zones": {
    "id": "uuid",
    "merchant_id": "uuid",
    "allowed_countries": ["SN", "CI", "NG"],
    "excluded_countries": [],
    "allowed_regions": ["WAEMU"],
    "excluded_regions": [],
    "allowed_cities": [],
    "excluded_cities": [],
    "auto_recommend": true,
    "last_sira_analysis": "2025-11-12T02:00:00Z"
  }
}
```

#### Update Zones
```http
POST /connect/:merchantId/zones
```

**Request Body** :
```json
{
  "allowed_countries": ["SN", "CI", "NG", "KE"],
  "excluded_countries": ["XX"],
  "allowed_regions": ["WAEMU", "EU"],
  "auto_recommend": true
}
```

---

### Zone Performance

#### Get Performance
```http
GET /connect/:merchantId/zones/performance?days=30
```

**Query Parameters** :
- `zone_identifier` (optional) : ISO code spécifique
- `days` (optional) : Période (1-365), défaut 30

**Response** :
```json
{
  "success": true,
  "performance": [
    {
      "zone_identifier": "SN",
      "total_transactions": 1523,
      "fraud_rate": 0.0342,
      "chargeback_rate": 0.0012,
      "success_rate": 0.9456,
      "avg_amount": 12500,
      "unique_customers": 834
    }
  ],
  "period_days": 30
}
```

#### Record Performance (Internal)
```http
POST /connect/:merchantId/zones/performance
```

Appelé automatiquement par le système de paiement après chaque transaction.

---

### Sira Recommendations

#### Get Recommendations
```http
GET /connect/:merchantId/zones/recommendations?status=pending
```

**Query Parameters** :
- `status` (optional) : `pending`, `applied`, `ignored`, `expired`
- `limit` (optional) : 1-100, défaut 20

**Response** :
```json
{
  "success": true,
  "recommendations": [
    {
      "id": "uuid",
      "recommendation_type": "suspend",
      "zone_type": "country",
      "zone_identifier": "XX",
      "reason": "High fraud rate detected: 15.23% across 127 transactions",
      "confidence_score": 0.85,
      "fraud_rate": 0.1523,
      "transaction_volume_30d": 127,
      "estimated_revenue_impact": -127000,
      "status": "pending",
      "priority": "high",
      "created_at": "2025-11-12T02:05:00Z",
      "expires_at": "2025-12-12T02:05:00Z"
    }
  ],
  "count": 1
}
```

#### Trigger Analysis
```http
POST /connect/:merchantId/zones/analyze
```

**Response** :
```json
{
  "success": true,
  "analysis": {
    "analyzed": 12,
    "recommendations_generated": 3,
    "recommendations": [...]
  },
  "message": "Analyzed 12 zones, generated 3 recommendations"
}
```

#### Apply Recommendation
```http
POST /connect/:merchantId/zones/recommendations/:recId/apply
```

**Response** :
```json
{
  "success": true,
  "recommendation": {...},
  "changes_applied": [
    "Suspended zone: XX"
  ],
  "message": "Recommendation applied successfully"
}
```

#### Ignore Recommendation
```http
POST /connect/:merchantId/zones/recommendations/:recId/ignore
```

**Request Body** :
```json
{
  "reason": "This market is strategic despite higher fraud rate. We have enhanced monitoring in place."
}
```

---

### Restriction Logs

#### Get Logs
```http
GET /connect/:merchantId/zones/logs?limit=50
```

**Response** :
```json
{
  "success": true,
  "logs": [
    {
      "id": "uuid",
      "action": "suspend",
      "zone_identifier": "XX",
      "triggered_by": "sira_auto",
      "reason": "High fraud rate: 15.23%",
      "created_at": "2025-11-12T02:10:00Z"
    }
  ],
  "count": 1
}
```

---

## Sira AI Engine

### Comment Sira Analyse

#### 1. Collecte des Données

Pour chaque zone (pays/région/ville) :
- Total transactions (30 jours)
- Transactions réussies
- Transactions frauduleuses
- Chargebacks
- Volume total
- Clients uniques

#### 2. Calcul des Métriques

```typescript
fraud_rate = fraud_transactions / total_transactions
success_rate = successful_transactions / total_transactions
chargeback_rate = chargeback_transactions / successful_transactions
```

#### 3. Application des Seuils

**Suspension (🚫)** :
- `fraud_rate > 10%` ET `transactions >= 20`
- Priority : `critical` si > 25%, `high` si > 15%, sinon `medium`
- Confidence : 0.95 si très élevé, 0.85 si élevé, 0.70 sinon

**Expansion (🚀)** :
- `success_rate > 85%` ET `transactions >= 50`
- Croissance marché > 8%
- Priority : `high` si conversion > 15%, sinon `medium`
- Confidence : 0.90 si très élevé, 0.75 sinon

**Monitoring (👁️)** :
- `fraud_rate entre 5% et 10%`
- Priority : `medium`
- Confidence : 0.65

#### 4. Estimation Impact Revenus

**Suspension** :
```typescript
estimated_impact = -1 * (transaction_count * avg_transaction_amount)
```

**Expansion** :
```typescript
estimated_impact = transaction_count * avg_transaction_amount * 1.5
```

#### 5. Expiration Automatique

Toutes les recommandations expirent après **30 jours** si non traitées.

### Personnalisation Seuils

Modifier dans la base SQL :

```sql
-- Seuil de fraude pour suspension
CREATE OR REPLACE FUNCTION check_auto_suspend_zone(
  p_merchant_id UUID,
  p_zone_identifier TEXT,
  p_fraud_threshold NUMERIC DEFAULT 0.10  -- 10% par défaut
)
```

Ajustez `p_fraud_threshold` selon votre tolérance au risque.

---

## Guide d'Intégration

### 1. Backend Setup

#### Installer le Schema SQL

```bash
psql -d molam_connect -f brique-75/sql/002_dynamic_zones_schema.sql
```

Crée :
- 3 nouvelles tables
- 4 fonctions SQL
- 2 triggers
- 2 vues

#### Importer les Services

```typescript
import siraZoneService from './services/siraZoneAnalysis';
import dynamicZonesRoutes from './routes/dynamicZones';

// Mount routes
app.use('/api', dynamicZonesRoutes);
```

### 2. Frontend Setup

#### Importer le Composant

```tsx
import { DynamicZones } from './components/DynamicZones';

function MerchantDashboard() {
  const { merchantId } = useAuth();

  return (
    <div>
      <h1>Settings</h1>
      <DynamicZones merchantId={merchantId} />
    </div>
  );
}
```

### 3. Enregistrer Performance par Transaction

Après chaque transaction, enregistrez les métriques :

```typescript
import { recordZonePerformance } from './services/siraZoneAnalysis';

async function processPayment(payment: Payment) {
  const result = await executePayment(payment);

  // Record performance for this zone
  await recordZonePerformance(
    payment.merchant_id,
    'country',
    payment.customer_country,
    {
      total_transactions: 1,
      successful_transactions: result.success ? 1 : 0,
      failed_transactions: result.success ? 0 : 1,
      fraud_transactions: result.fraud ? 1 : 0,
      chargeback_transactions: 0, // Updated later if chargeback occurs
      total_volume: payment.amount,
      successful_volume: result.success ? payment.amount : 0,
      unique_customers: 1,
      repeat_customers: 0,
    },
    new Date(), // period_start
    new Date()  // period_end
  );
}
```

### 4. Configurer le Cron Job

Analyse quotidienne à 2h du matin :

```typescript
import cron from 'node-cron';
import { runScheduledZoneAnalysis } from './services/siraZoneAnalysis';

// Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('[Cron] Running scheduled zone analysis...');
  try {
    const result = await runScheduledZoneAnalysis();
    console.log(`[Cron] Analyzed ${result.merchants_analyzed} merchants, generated ${result.total_recommendations} recommendations`);
  } catch (error) {
    console.error('[Cron] Zone analysis failed:', error);
  }
});
```

Ou via endpoint admin :

```bash
curl -X POST https://api.molam.app/admin/zones/analyze-all \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 5. Intégrer avec Webhooks

Notifiez le marchand quand une recommandation critique est générée :

```typescript
// In analyzeMerchantZones service
if (recommendation.priority === 'critical') {
  await sendWebhook(merchantId, {
    event: 'sira.recommendation.critical',
    data: recommendation
  });
}
```

---

## Best Practices

### Pour Marchands

1. **Activez Auto-Recommend** dès le départ
   - Laissez Sira apprendre de vos données
   - Reviewez les recommandations avant application

2. **Commencez Conservateur**
   - Démarrez avec zones larges (WAEMU, EU)
   - Ajustez selon recommandations Sira

3. **Surveillez la Performance**
   - Consultez l'onglet Performance hebdomadairement
   - Identifiez les marchés émergents

4. **Documentez vos Ignores**
   - Fournissez toujours une raison claire
   - Revisitez les ignores après 30 jours

5. **Testez Avant Production**
   - Utilisez l'environnement sandbox
   - Validez les restrictions ne bloquent pas des vrais clients

### Pour Développeurs

1. **Enregistrez Performance en Temps Réel**
   ```typescript
   // Immédiatement après transaction
   await recordZonePerformance(...)
   ```

2. **Gérez les Erreurs Gracefully**
   ```typescript
   try {
     await analyzeMerchantZones(merchantId);
   } catch (error) {
     // Log mais ne pas bloquer
     console.error('Sira analysis failed:', error);
   }
   ```

3. **Cachéz les Zones Fréquemment Accédées**
   ```typescript
   const cachedZones = await redis.get(`zones:${merchantId}`);
   if (cachedZones) return JSON.parse(cachedZones);

   const zones = await getMerchantZones(merchantId);
   await redis.setex(`zones:${merchantId}`, 3600, JSON.stringify(zones));
   ```

4. **Moniteurs les Métriques Sira**
   - Nombre de recommandations générées/jour
   - Taux d'application des recommandations
   - Impact revenus des recommandations appliquées

5. **Ajustez les Seuils par Industrie**
   - E-commerce : Seuil fraude 8%
   - Gaming : Seuil fraude 12%
   - Finance : Seuil fraude 5%

### Performance Optimization

1. **Partitionner merchant_zone_performance** par mois si > 10M lignes
2. **Indexer** sur `(merchant_id, zone_identifier, period_start)`
3. **Archiver** les logs > 1 an vers cold storage
4. **Aggréger** les métriques quotidiennes en tables summary

---

## Troubleshooting

### Aucune Recommandation Générée

**Causes** :
- `auto_recommend = false`
- Pas assez de transactions (min 20 pour suspension, 50 pour expansion)
- Pas de zones avec métriques hors seuils

**Solution** :
1. Vérifiez `auto_recommend` est activé
2. Attendez accumulation de données (7-30 jours)
3. Lancez analyse manuelle : `POST /zones/analyze`

### Recommandations Expirées Automatiquement

**Cause** : Non traitées dans les 30 jours

**Solution** :
1. Reviewez recommandations hebdomadairement
2. Configurez alertes pour nouvelles recommandations `priority=critical`
3. Ajustez `expires_at` dans SQL si besoin :
   ```sql
   UPDATE sira_zone_recommendations
   SET expires_at = now() + INTERVAL '60 days'
   WHERE status = 'pending';
   ```

### Performance Lente

**Cause** : Tables non indexées, volume élevé

**Solutions** :
1. Vérifiez indexes : `\d+ merchant_zone_performance`
2. Activez partitioning mensuel
3. Archivez vieilles données :
   ```sql
   DELETE FROM merchant_zone_performance
   WHERE period_start < now() - INTERVAL '1 year';
   ```

### Fraude Non Détectée

**Cause** : Seuils trop élevés, transactions pas marquées comme fraude

**Solutions** :
1. Abaissez seuil fraude :
   ```sql
   -- De 10% à 8%
   SELECT generate_fraud_suspension_recommendation(...)
   WHERE fraud_rate > 0.08;
   ```

2. Assurez-vous transactions fraud sont marquées :
   ```typescript
   await recordZonePerformance({
     ...
     fraud_transactions: payment.isFraud ? 1 : 0
   });
   ```

---

## Changelog

### v1.0.0 (2025-11-12)

**Initial Release** :
- ✅ SQL schema avec 3 tables, 4 fonctions, 2 triggers
- ✅ Service Sira (550+ lignes)
- ✅ API routes (350+ lignes)
- ✅ React UI (900+ lignes)
- ✅ Documentation complète

**Features** :
- Zone configuration (country, region, city)
- Sira AI recommendations (suspend, expand, monitor, restrict)
- Performance tracking en temps réel
- Application/ignore recommendations en un clic
- Restriction logs complets
- Cron job pour analyse planifiée

**AI Capabilities** :
- Détection fraude automatique (seuil 10%)
- Détection opportunités croissance (conversion 85%+)
- Calcul confidence scores (0-1)
- Estimation impact revenus
- Priorisation recommendations (low/medium/high/critical)

---

## Support

- **Documentation** : Ce fichier
- **API Reference** : Section API Reference ci-dessus
- **Email** : support@molam.app
- **Slack** : #brique-75bis-support

---

**Sous-Brique 75bis v1.0**
*AI-Powered Dynamic Zone Management*

Built with ❤️ by Molam Team
2025-11-12
