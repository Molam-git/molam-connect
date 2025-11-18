# 🚀 Molam Connect - Quick Start Guide

Bienvenue! Ce guide vous permettra de démarrer rapidement le serveur Molam Connect et de tester toutes les fonctionnalités.

---

## 📋 Prérequis

Avant de commencer, assurez-vous d'avoir installé:

1. **Node.js** (v18 ou supérieur)
   - Télécharger: https://nodejs.org/
   - Vérifier: `node --version`

2. **PostgreSQL** (v13 ou supérieur)
   - Télécharger: https://www.postgresql.org/download/
   - Vérifier: `psql --version`

3. **Redis** (optionnel mais recommandé)
   - Windows: https://github.com/microsoftarchive/redis/releases
   - Mac: `brew install redis`
   - Linux: `sudo apt-get install redis-server`
   - Vérifier: `redis-cli ping` (devrait retourner "PONG")

---

## 🛠️ Installation

### Étape 1: Installer les dépendances

```bash
npm install
```

### Étape 2: Configurer PostgreSQL

#### Option A: Créer la base de données manuellement

```bash
# Ouvrir psql
psql -U postgres

# Dans psql, créer la base de données
CREATE DATABASE molam_connect;

# Quitter psql
\q

# Exécuter le script de setup
psql -U postgres -d molam_connect -f database/setup.sql
```

#### Option B: Utiliser les scripts NPM

```bash
# Créer la base de données
npm run db:create

# Exécuter les migrations
npm run db:setup
```

### Étape 3: Configurer l'environnement

Le fichier `.env` est déjà configuré pour le développement. Pas besoin de modifications!

---

## 🚀 Démarrage

### Windows

Double-cliquez sur `start.bat` ou dans le terminal:

```bash
start.bat
```

### Mac/Linux

```bash
chmod +x start.sh
./start.sh
```

### Ou directement avec NPM

```bash
npm start
```

---

## 🌐 Accès au Dashboard

Une fois le serveur démarré, ouvrez votre navigateur:

**Dashboard de Test**: http://localhost:3000/dashboard

Vous verrez une interface complète pour tester tous les APIs !

---

## 🧪 Tests Rapides

### 1. Tester le Health Check

```bash
# Dans un nouveau terminal
curl http://localhost:3000/health
```

Ou visitez: http://localhost:3000/health

### 2. Créer un Payment Intent (via Dashboard)

1. Ouvrez http://localhost:3000/dashboard
2. Dans l'onglet "💳 Payment Intent":
   - Amount: `10000` (100 XOF)
   - Currency: `XOF`
   - Cliquez "Create Payment Intent"
3. Vous verrez le résultat avec le `client_secret`
4. Cliquez "Confirm Payment" pour compléter le paiement

### 3. Tester l'Auth Decision

1. Dans l'onglet "🔒 Auth Decision":
   - Amount: `50000` (500 XOF)
   - Country: `SN` (Senegal)
   - Cliquez "Make Decision"
2. Vous verrez la méthode d'authentification recommandée (3DS2, OTP, etc.)

### 4. Tester l'OTP

1. Dans l'onglet "📱 OTP":
   - Phone: `+221771234567`
   - Method: `SMS`
   - Cliquez "Send OTP"
2. **IMPORTANT**: Le code OTP s'affiche dans la console du serveur (en développement uniquement)
3. Copiez le code et collez-le dans "OTP Code"
4. Cliquez "Verify OTP"

---

## 📊 Endpoints API Disponibles

### Payment Intents

```bash
# Create Payment Intent
curl -X POST http://localhost:3000/api/v1/payment_intents \
  -H "Content-Type: application/json" \
  -d '{"amount": 10000, "currency": "XOF"}'

# Retrieve Payment Intent
curl http://localhost:3000/api/v1/payment_intents/{id}

# Confirm Payment Intent
curl -X POST http://localhost:3000/api/v1/payment_intents/{id}/confirm \
  -H "Content-Type: application/json" \
  -d '{"client_secret": "pi_xxx", "payment_method": "card"}'
```

### Auth Decision

```bash
curl -X POST http://localhost:3000/api/v1/auth/decide \
  -H "Content-Type: application/json" \
  -d '{
    "payment_id": "pi_123",
    "amount": 50000,
    "currency": "XOF",
    "country": "SN",
    "bin": "424242",
    "device": {"ip": "192.168.1.1"}
  }'
```

### OTP

```bash
# Create OTP
curl -X POST http://localhost:3000/api/v1/otp/create \
  -H "Content-Type: application/json" \
  -d '{"phone": "+221771234567", "method": "sms"}'

# Verify OTP
curl -X POST http://localhost:3000/api/v1/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"otp_id": "xxx", "code": "123456"}'
```

### Customer

```bash
curl -X POST http://localhost:3000/api/v1/customers \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "name": "Test User", "country": "SN"}'
```

---

## 🐛 Dépannage

### Erreur: "Cannot connect to database"

1. Vérifiez que PostgreSQL est démarré:
   ```bash
   # Windows
   net start postgresql-x64-14

   # Mac/Linux
   sudo service postgresql start
   ```

2. Vérifiez les credentials dans `.env`:
   ```
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/molam_connect
   ```

3. Vérifiez que la base de données existe:
   ```bash
   psql -U postgres -l | grep molam_connect
   ```

### Erreur: "Redis connection failed"

Redis n'est pas critique en développement. L'application continuera de fonctionner.

Pour démarrer Redis:
```bash
# Windows
redis-server

# Mac/Linux
redis-server
```

### Port 3000 déjà utilisé

Changez le port dans `.env`:
```
PORT=3001
```

---

## 📚 Ressources

- **Documentation complète**: Voir les fichiers `README.md` dans chaque brique
- **Database Schema**: `database/setup.sql`
- **Brique 104**: SDK PHP Server-Side
- **Brique 105**: SDK Python Server-Side
- **Brique 106**: SDKs Client (Web + React Native)
- **Brique 106bis**: Auth Service (3DS + OTP)

---

## 🎯 Prochaines Étapes

1. ✅ Tester tous les endpoints via le Dashboard
2. ✅ Consulter les logs dans l'onglet "📊 Logs"
3. ✅ Examiner la base de données:
   ```bash
   psql -U postgres -d molam_connect
   \dt  # List tables
   SELECT * FROM payment_intents;
   SELECT * FROM auth_decisions;
   SELECT * FROM otp_requests;
   ```

---

## 💡 Conseils

- **Mode Développement**: Les codes OTP sont affichés dans la console du serveur
- **Base de données**: Réinitialisez avec `npm run db:reset`
- **Logs**: Tous les appels API sont loggés dans la console
- **Dashboard**: Utilisez l'onglet "Logs" pour voir l'activité en temps réel

---

**Besoin d'aide ?** Consultez la documentation ou ouvrez une issue sur GitHub.

**Bon test ! 🚀**
