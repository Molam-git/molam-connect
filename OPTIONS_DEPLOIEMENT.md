# Options de Déploiement - Molam Connect

**Date** : 23 Novembre 2025
**Statut Option A** : ✅ Complétée (Multi-langues i18n)

---

## 📊 Options Disponibles

Basées sur l'audit des briques 1-40 et les fonctionnalités manquantes identifiées.

---

## ✅ Option A - Multi-Langues (i18n) - **TERMINÉE**

**Brique** : Brique Translation
**Statut** : ✅ Déployée et fonctionnelle
**Score** : 100/100

**Ce qui a été fait** :
- ✅ 4 tables PostgreSQL créées
- ✅ 6 langues intégrées (EN, FR, WO, AR, ES, PT)
- ✅ Traduction instantanée sans rafraîchissement
- ✅ Sélecteur de langue dans le dashboard
- ✅ Persistance de la langue choisie

**Fichiers créés** :
- [`deploy-translation.ps1`](deploy-translation.ps1)
- [`public/translate.js`](public/translate.js) - 460 lignes
- [`TRANSLATION_DEPLOYMENT_SUMMARY.md`](TRANSLATION_DEPLOYMENT_SUMMARY.md)

---

## 🔴 Option B - Multi-Devises & Multi-Pays

**Brique** : Brique 1 (Wallets)
**Statut** : ⏳ Prête à déployer
**Impact** : 🔴 Critique pour l'international
**Effort** : 🟡 Moyen (2-3 jours)
**Score potentiel** : 95/100

### Fonctionnalités

**Multi-Devises** :
- 💱 Support de toutes devises ISO 4217 (USD, XOF, EUR, GBP, etc.)
- 🔢 Formatage automatique selon la devise
- 📊 Multi-wallets : un utilisateur peut avoir plusieurs devises
- ⚖️ Gestion des unités mineures (décimales)

**Multi-Pays** :
- 🌍 Support de tous pays ISO 3166-1
- 📞 Codes téléphoniques par pays
- 💱 Devise par défaut par pays
- 🏦 Configuration spécifique par pays

### Tables à créer

```sql
-- Brique 1 - 6 fichiers SQL
brique1/sql/0001_ref_countries.sql       -- Table des pays
brique1/sql/0002_ref_currencies.sql      -- Table des devises
brique1/sql/0003_molam_wallets.sql       -- Wallets multi-devises
brique1/sql/0004_constraints_and_triggers.sql
brique1/sql/0005_indexes.sql
brique1/sql/0006_seed_ref.sql            -- Données de référence
```

### Intégration Dashboard

- Sélecteur de pays avec drapeaux
- Conversion automatique de devises
- Affichage des balances multi-devises
- Historique des transactions par devise

### Script de déploiement

```powershell
.\deploy-brique1-wallets.ps1
```

---

## 🟡 Option C - QR Code Wallet

**Brique** : Brique 149a (QR Wallet)
**Statut** : ⏳ Code existe, à intégrer
**Impact** : 🟡 Important pour paiements mobiles
**Effort** : 🟢 Faible (1-2 jours)
**Score potentiel** : 100/100

### Fonctionnalités

- 📱 Génération de QR codes pour paiements
- 🔍 Scan de QR codes
- 🔐 Tokens sécurisés avec expiration
- 💳 Deep links (molam://pay/xxx)
- 📊 Dashboard wallet déjà créé

### Tables à créer

```sql
-- Brique 149a - Tables QR
wallet_qr_tokens          -- Tokens QR sécurisés
wallet_transactions       -- Historique transactions
wallet_balances           -- Balances par devise
```

### Ce qui existe déjà

- ✅ UI Dashboard créée : [`public/wallet.html`](public/wallet.html)
- ✅ Code TypeScript pour QR
- ⚠️ Pas encore connecté au backend principal

### Intégration

- Ajouter routes API dans `server.js`
- Connecter au service QR
- Intégrer génération/scan QR
- Afficher transactions en temps réel

### Script de déploiement

```powershell
.\deploy-brique149a-qr.ps1
```

---

## 🟢 Option D - Cash In (Top-ups)

**Brique** : Brique 3 (Top-ups)
**Statut** : ⏳ Prête à déployer
**Impact** : 🔴 Critique pour rechargement
**Effort** : 🟡 Moyen (3-4 jours)
**Score potentiel** : 100/100

### Fonctionnalités

**Méthodes de rechargement** :
- 📱 Mobile Money (Orange Money, MTN, Moov, Wave)
- 💳 Carte bancaire
- 🏦 Virement bancaire
- 👤 Agents physiques

**Fonctionnalités avancées** :
- ✅ Limites KYC par niveau
- ✅ Calcul automatique des frais
- ✅ SIRA risk assessment
- ✅ Workflow d'approbation
- ✅ Notifications multi-canaux

### Tables à créer

```sql
-- Brique 3 - 2 fichiers SQL
brique3/sql/0001_molam_topups.sql        -- Table rechargements
brique3/sql/0002_ledger_function.sql     -- Fonction comptable
```

### Intégration Mobile Money

```javascript
// Providers supportés
const providers = [
  'orange_money_sn',  // Orange Money Sénégal
  'mtn_ci',           // MTN Côte d'Ivoire
  'moov_sn',          // Moov Sénégal
  'wave_sn',          // Wave Sénégal
];
```

### API Endpoints

```
POST /api/topups/create          -- Créer un rechargement
GET  /api/topups/:id             -- Statut rechargement
POST /api/topups/:id/confirm     -- Confirmer rechargement
GET  /api/topups/history         -- Historique
```

### Script de déploiement

```powershell
.\deploy-brique3-cashin.ps1
```

---

## 🟢 Option E - Cash Out (Withdrawals)

**Brique** : Brique 4 (Withdrawals)
**Statut** : ⏳ Prête à déployer
**Impact** : 🔴 Critique pour retraits
**Effort** : 🟡 Moyen (3-4 jours)
**Score potentiel** : 100/100

### Fonctionnalités

**Méthodes de retrait** :
- 📱 Mobile Money
- 🏦 Virement bancaire
- 👤 Agents physiques
- 💳 Carte prépayée

**Fonctionnalités avancées** :
- ✅ Gestion du float (liquidité)
- ✅ Limites quotidiennes/mensuelles
- ✅ Anti-fraude
- ✅ Workflow d'approbation pour gros montants
- ✅ Notifications temps réel

### Tables à créer

```sql
-- Brique 4 - Tables retraits
molam_withdrawals            -- Table retraits
withdrawal_approvals         -- Approbations
float_management             -- Gestion liquidité
```

### Règles métier

```javascript
// Limites KYC
const limits = {
  P0: { daily: 0, monthly: 0 },           // Non vérifié
  P1: { daily: 50000, monthly: 200000 },  // Basic KYC
  P2: { daily: 500000, monthly: 2000000 }, // Full KYC
  P3: { daily: Infinity, monthly: Infinity }, // Premium
};
```

### API Endpoints

```
POST /api/withdrawals/create         -- Créer un retrait
GET  /api/withdrawals/:id            -- Statut retrait
POST /api/withdrawals/:id/approve    -- Approuver retrait
POST /api/withdrawals/:id/reject     -- Rejeter retrait
GET  /api/withdrawals/history        -- Historique
```

### Script de déploiement

```powershell
.\deploy-brique4-cashout.ps1
```

---

## 🔵 Option F - Notifications Multi-Canaux

**Brique** : Brique 15 (Notifications)
**Statut** : ⏳ Prête à déployer
**Impact** : 🟡 Important pour UX
**Effort** : 🟢 Faible (1-2 jours)
**Score potentiel** : 90/100

### Fonctionnalités

**Canaux supportés** :
- 📧 Email (SMTP)
- 📱 SMS (Twilio, Africa's Talking)
- 🔔 Push Notifications (FCM)
- 💬 WhatsApp Business
- 📲 In-app notifications

**Fonctionnalités** :
- ✅ Templates personnalisables
- ✅ Multi-langues (intégré avec Option A)
- ✅ Retry automatique
- ✅ Tracking d'envoi
- ✅ Métriques Prometheus

### Tables à créer

```sql
-- Brique 15 - 2 fichiers SQL
brique15/sql/0001_notifications_schema.sql
brique15/sql/0002_notification_seeds.sql
```

### Templates

```javascript
// Exemples de notifications
const templates = {
  payment_success: {
    fr: "Votre paiement de {amount} {currency} a été effectué avec succès",
    en: "Your payment of {amount} {currency} was successful",
    wo: "Sa fay bu {amount} {currency} defee",
  },
  topup_pending: {
    fr: "Votre rechargement de {amount} {currency} est en cours",
    en: "Your top-up of {amount} {currency} is pending",
  },
};
```

### Script de déploiement

```powershell
.\deploy-brique15-notifications.ps1
```

---

## 🟣 Option G - KYC & Compliance

**Brique** : Brique 33 (KYC Database)
**Statut** : ⏳ Prête à déployer
**Impact** : 🔴 Critique pour compliance
**Effort** : 🟡 Moyen (2-3 jours)
**Score potentiel** : 100/100

### Fonctionnalités

**Niveaux KYC** :
- 📝 P0 : Aucune vérification (limité)
- 📄 P1 : KYC basique (nom, téléphone)
- 🆔 P2 : KYC complet (ID, adresse, selfie)
- 💼 P3 : KYC premium (business, documents légaux)

**Vérifications** :
- ✅ Validation documents (ID, passeport)
- ✅ Vérification faciale (liveness detection)
- ✅ AML screening
- ✅ Sanctions lists (OFAC, UN)
- ✅ PEP detection

### Tables à créer

```sql
-- Brique 33 - 3 fichiers SQL
brique33-db/sql/0001_kyc_tables.sql
brique33-db/sql/0002_kyc_indexes.sql
brique33-db/sql/0003_kyc_seeds.sql
```

### Limites par niveau

| Niveau | Daily Limit | Monthly Limit | Vérifications requises |
|--------|-------------|---------------|------------------------|
| P0 | 0 XOF | 0 XOF | Aucune |
| P1 | 50 000 XOF | 200 000 XOF | Téléphone + Email |
| P2 | 500 000 XOF | 2 000 000 XOF | ID + Adresse + Selfie |
| P3 | Illimité | Illimité | Business docs + Bank statement |

### Script de déploiement

```powershell
.\deploy-brique33-kyc.ps1
```

---

## 🎯 Recommandation de Priorisation

### Phase 1 - Fondations (Cette semaine)

1. **Option B** - Multi-Devises & Multi-Pays ⏱️ 2-3 jours
   - Permet transactions internationales
   - Bloquant pour expansion

2. **Option D** - Cash In (Top-ups) ⏱️ 3-4 jours
   - Permet rechargement des wallets
   - Fonctionnalité core

### Phase 2 - Fonctionnalités Core (Semaine prochaine)

3. **Option E** - Cash Out (Withdrawals) ⏱️ 3-4 jours
   - Complète le cycle Cash In/Out
   - Fonctionnalité core

4. **Option C** - QR Code Wallet ⏱️ 1-2 jours
   - Paiements mobiles
   - UI déjà prête

### Phase 3 - Amélioration UX (Dans 2 semaines)

5. **Option F** - Notifications ⏱️ 1-2 jours
   - Améliore l'expérience utilisateur
   - Intégration facile

6. **Option G** - KYC & Compliance ⏱️ 2-3 jours
   - Requis pour conformité
   - Permet limites plus élevées

---

## 📦 Package Complet

**Option Z - Tout déployer**

Script pour déployer toutes les briques en une fois :

```powershell
.\deploy-all-briques.ps1
```

Ce script :
1. ✅ Vérifie les prérequis
2. ✅ Exécute tous les SQL (82 fichiers)
3. ✅ Configure tous les services
4. ✅ Teste les intégrations
5. ✅ Génère un rapport de déploiement

⏱️ **Temps total** : 3-4 heures (automatisé)

---

## 💡 Quelle option choisir ?

**Pour commencer rapidement** :
- Choisissez **Option B** (Multi-Devises/Pays)

**Pour un wallet fonctionnel** :
- Choisissez **Options D + E** (Cash In + Cash Out)

**Pour tout avoir** :
- Choisissez **Option Z** (Déploiement complet)

---

## 🚀 Prochaines étapes

Indiquez l'option que vous souhaitez déployer :

```
Option A : ✅ Terminée
Option B : Multi-Devises & Multi-Pays
Option C : QR Code Wallet
Option D : Cash In (Top-ups)
Option E : Cash Out (Withdrawals)
Option F : Notifications
Option G : KYC & Compliance
Option Z : Tout déployer
```

Je créerai le script de déploiement approprié ! 🎯
