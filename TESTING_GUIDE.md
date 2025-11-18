# 🧪 Molam Connect - Guide de Test Complet

**Guide complet pour tester toutes les fonctionnalités de Molam Connect**

---

## 📋 Table des Matières

1. [Prérequis](#prérequis)
2. [Démarrage](#démarrage)
3. [Test du Dashboard](#test-du-dashboard)
4. [Test du Checkout (Frontend)](#test-du-checkout-frontend)
5. [Test des APIs](#test-des-apis)
6. [Cartes de test](#cartes-de-test)
7. [Scénarios de test](#scénarios-de-test)

---

## ✅ Prérequis

### 1. Base de données PostgreSQL

```powershell
# Exécuter le script de setup (une seule fois)
.\setup-all-schemas.ps1
```

**Ce script va :**
- ✅ Demander le mot de passe PostgreSQL **une seule fois**
- ✅ Créer la base de données `molam_connect`
- ✅ Importer les 82 fichiers SQL de toutes les briques
- ✅ Vérifier que tout est configuré

### 2. Redis (optionnel)

Redis n'est pas critique pour les tests. Si vous l'avez :
```powershell
redis-server
```

---

## 🚀 Démarrage

### Démarrer le serveur

**Méthode 1 : Script batch (recommandé)**
```bash
.\start.bat
```

**Méthode 2 : NPM directement**
```bash
npm start
```

**Le serveur démarre sur :**
- 🌐 **Dashboard** : http://localhost:3000/dashboard
- 🛒 **Checkout** : http://localhost:3000/checkout.html
- ❤️ **Health Check** : http://localhost:3000/health

---

## 📊 Test du Dashboard

### 1. Accéder au Dashboard

Ouvrez : **http://localhost:3000/dashboard**

### 2. Test Payment Intent

**Onglet : 💳 Payment Intent**

1. **Créer un Payment Intent**
   - Amount: `10000` (100.00 XOF)
   - Currency: `XOF`
   - Description: `Test payment`
   - Cliquez **Create Payment Intent**

2. **Résultat attendu**
   ```json
   {
     "id": "pi_xxx...",
     "amount": 10000,
     "currency": "XOF",
     "status": "pending",
     "client_secret": "pi_xxx_secret_xxx"
   }
   ```

3. **Confirmer le paiement**
   - Le formulaire de confirmation apparaît automatiquement
   - Payment Method: `card`
   - Cliquez **Confirm Payment**

4. **Résultat attendu**
   ```json
   {
     "id": "pi_xxx...",
     "status": "succeeded",
     "amount": 10000,
     "currency": "XOF"
   }
   ```

### 3. Test Auth Decision

**Onglet : 🔒 Auth Decision**

1. **Faire une décision d'authentification**
   - Amount: `50000` (500.00 XOF)
   - Currency: `XOF`
   - Country: `SN` (Sénégal)
   - BIN: `424242` (carte de test Visa)
   - Cliquez **Make Decision**

2. **Résultat attendu**
   ```json
   {
     "decision_id": "xxx",
     "risk_score": 65,
     "recommended_method": "otp_sms",
     "fallback_chain": ["3ds2", "3ds1", "otp_sms", "otp_voice"]
   }
   ```

**Interprétation :**
- `risk_score < 30` → Pas d'authentification
- `risk_score 30-80` → OTP SMS
- `risk_score > 80` → 3DS2 obligatoire

### 4. Test OTP

**Onglet : 📱 OTP**

1. **Créer un OTP**
   - Phone: `+221771234567` (numéro de test)
   - Method: `SMS`
   - Cliquez **Send OTP**

2. **Vérifier la console du serveur**
   ```
   📱 OTP SENT (DEV MODE)
   Phone: +221771234567
   Code: 123456
   ```

3. **Vérifier l'OTP**
   - Copiez le code de la console
   - OTP Code: `123456`
   - Cliquez **Verify OTP**

4. **Résultat attendu**
   ```json
   {
     "success": true,
     "message": "OTP verified successfully"
   }
   ```

### 5. Test Customer

**Onglet : 👤 Customer**

1. **Créer un client**
   - Email: `test@example.com`
   - Name: `John Doe`
   - Country: `SN`
   - Phone: `+221771234567`
   - Cliquez **Create Customer**

2. **Résultat attendu**
   ```json
   {
     "id": "cus_xxx...",
     "email": "test@example.com",
     "name": "John Doe",
     "country": "SN"
   }
   ```

---

## 🛒 Test du Checkout (Frontend)

### 1. Accéder au Checkout

**Depuis le dashboard :**
- Cliquez sur l'onglet **🛒 Checkout Demo**

**Ou directement :**
- Ouvrez : http://localhost:3000/checkout.html

### 2. Flux de paiement complet

**Étape 1 : Remplir le formulaire**

| Champ | Valeur Test |
|-------|-------------|
| Cardholder Name | `John Doe` |
| Card Number | `4242 4242 4242 4242` (Visa test) |
| Expiry Date | `12/25` |
| CVV | `123` |

**Étape 2 : Soumettre le paiement**
- Cliquez **Pay 55,000 XOF**

**Étape 3 : Processus automatique**

Le checkout va :
1. ✅ Créer un Payment Intent
2. ✅ Faire une Auth Decision (analyse risque)
3. ✅ Si OTP requis : Envoyer un OTP
4. ✅ Demander le code OTP (popup)
5. ✅ Vérifier l'OTP
6. ✅ Confirmer le paiement

**Étape 4 : OTP**

Si un popup apparaît :
1. Vérifiez la console du serveur pour le code OTP
2. Entrez le code dans le popup
3. Validez

**Étape 5 : Succès**

Message affiché : **✅ Payment successful! Thank you for your purchase.**

---

## 🧪 Test des APIs (avec curl)

### 1. Health Check

```bash
curl http://localhost:3000/health
```

**Résultat attendu :**
```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected" // ou "disconnected"
}
```

### 2. Create Payment Intent

```bash
curl -X POST http://localhost:3000/api/v1/payment_intents \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "currency": "XOF",
    "description": "Test payment"
  }'
```

### 3. Auth Decision

```bash
curl -X POST http://localhost:3000/api/v1/auth/decide \
  -H "Content-Type: application/json" \
  -d '{
    "payment_id": "pi_test_123",
    "amount": 50000,
    "currency": "XOF",
    "country": "SN",
    "bin": "424242",
    "device": {"ip": "192.168.1.1"}
  }'
```

### 4. Create OTP

```bash
curl -X POST http://localhost:3000/api/v1/otp/create \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+221771234567",
    "method": "sms"
  }'
```

### 5. Verify OTP

```bash
curl -X POST http://localhost:3000/api/v1/otp/verify \
  -H "Content-Type: application/json" \
  -d '{
    "otp_id": "otp_xxx",
    "code": "123456"
  }'
```

---

## 💳 Cartes de Test

### Cartes Visa

| Numéro | Type | Comportement |
|--------|------|--------------|
| `4242 4242 4242 4242` | Visa | ✅ Succès |
| `4000 0000 0000 0002` | Visa | ❌ Carte déclinée |
| `4000 0000 0000 9995` | Visa | ⚠️ Fonds insuffisants |

### Cartes Mastercard

| Numéro | Type | Comportement |
|--------|------|--------------|
| `5555 5555 5555 4444` | Mastercard | ✅ Succès |
| `5200 0000 0000 1005` | Mastercard | ❌ Carte déclinée |

### Autres informations de test

- **Expiry** : N'importe quelle date future (ex: `12/25`)
- **CVV** : N'importe quel 3-4 chiffres (ex: `123`)
- **Nom** : N'importe quel nom

---

## 🎯 Scénarios de Test

### Scénario 1 : Paiement sans authentification (faible montant)

```javascript
// Créer Payment Intent
POST /api/v1/payment_intents
{
  "amount": 1000,  // 10 XOF (très faible)
  "currency": "XOF"
}

// Auth Decision → risk_score < 30
// Résultat: recommended_method = "none"

// Confirm directement
POST /api/v1/payment_intents/:id/confirm
```

### Scénario 2 : Paiement avec OTP (montant moyen)

```javascript
// Créer Payment Intent
POST /api/v1/payment_intents
{
  "amount": 50000,  // 500 XOF
  "currency": "XOF"
}

// Auth Decision → risk_score 30-80
// Résultat: recommended_method = "otp_sms"

// Créer OTP
POST /api/v1/otp/create

// Vérifier OTP
POST /api/v1/otp/verify

// Confirm Payment
POST /api/v1/payment_intents/:id/confirm
```

### Scénario 3 : Paiement avec 3DS2 (montant élevé)

```javascript
// Créer Payment Intent
POST /api/v1/payment_intents
{
  "amount": 200000,  // 2000 XOF
  "currency": "XOF"
}

// Auth Decision → risk_score > 80
// Résultat: recommended_method = "3ds2"

// En production: Redirection vers 3DS Challenge
// En dev: Simuler la validation

// Confirm Payment
POST /api/v1/payment_intents/:id/confirm
```

---

## 📝 Logs et Debugging

### Consulter les logs du serveur

Les logs affichent toutes les opérations :
- ✅ Requêtes HTTP
- 📊 Auth decisions
- 📱 OTP codes (mode dev)
- ❌ Erreurs

### Consulter l'onglet Logs du dashboard

**Onglet : 📊 Logs**

Affiche en temps réel :
- Toutes les requêtes API
- Status codes
- Timestamps

---

## ❓ Troubleshooting

### Problème : Base de données non connectée

```
❌ Database connection failed
```

**Solution :**
```powershell
# Vérifier que PostgreSQL est démarré
Get-Service postgresql-x64-18

# Démarrer si nécessaire
Start-Service postgresql-x64-18

# Réexécuter le setup
.\setup-all-schemas.ps1
```

### Problème : Port 3000 déjà utilisé

**Solution :**
Changez le port dans [.env](c:\Users\lomao\Desktop\Molam\molam-connect\.env) :
```env
PORT=3001
```

### Problème : Redis connection failed

**Impact :** Aucun ! Redis est optionnel en développement.

**Pour installer Redis (optionnel) :**
- Windows : https://github.com/microsoftarchive/redis/releases

---

## ✅ Checklist Complète

- [ ] PostgreSQL est démarré
- [ ] Base de données `molam_connect` créée avec `.\setup-all-schemas.ps1`
- [ ] Serveur démarré avec `.\start.bat`
- [ ] Dashboard accessible sur http://localhost:3000/dashboard
- [ ] Test Payment Intent : ✅ Créé et confirmé
- [ ] Test Auth Decision : ✅ Risk score calculé
- [ ] Test OTP : ✅ Code généré et vérifié
- [ ] Test Customer : ✅ Client créé
- [ ] Test Checkout : ✅ Paiement complet end-to-end

---

## 🎉 Félicitations !

Vous avez testé avec succès **Molam Connect** !

**Prochaines étapes :**
- 📚 Explorer les autres briques (Dashboard Marchand, Developer Portal)
- 🔌 Intégrer le Web SDK dans votre propre site
- 📱 Tester le React Native SDK
- 🚀 Déployer en production

---

**Support :** Consultez les README de chaque brique pour plus de détails.

**Made with ❤️ by Molam Team**
