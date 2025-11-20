# Brique 117 + 117-bis — Developer Docs & Playground Interactif

## 🎯 Objectif

Fournir une **documentation développeur complète** et un **playground interactif** pour faciliter l'intégration de Molam Connect.

## ✨ Fonctionnalités

### Brique 117 - Documentation

- 📚 **OpenAPI Spec** - Spécification complète de l'API
- 🚀 **Quickstarts** - Tutoriels rapides Node.js, PHP, Python
- 💻 **Sample App** - Application complète Node.js fonctionnelle
- 📖 **Exemples multi-pays** - XOF, EUR, USD, etc.

### Brique 117-bis - Playground

- ⚡ **Exécution en temps réel** - Testez l'API directement
- 🤖 **Suggestions Sira** - Recommandations automatiques
- 📝 **Génération de code** - Snippets Node/PHP/Python/cURL
- 🔗 **Partage** - Partagez vos tests avec un lien
- 💾 **Sauvegarde** - Sessions persistées

---

## 📦 Structure

```
brique-117/
├── openapi.yaml                 # Spécification OpenAPI 3.0
├── quickstarts/                 # Tutoriels par langage
│   ├── node.md
│   ├── php.md
│   └── python.md
├── sample-app-node/             # Application complète
│   ├── server.js
│   ├── public/index.html
│   └── package.json
├── playground/                  # Playground interactif
│   ├── src/
│   │   ├── routes/playground.ts
│   │   └── components/Playground.tsx
│   └── migrations/001_playground.sql
└── README.md
```

---

## 🚀 Démarrage Rapide

### 1. Documentation API

```bash
# Visualiser l'OpenAPI spec avec Redoc
npx redoc-cli serve openapi.yaml
```

Accéder à : http://localhost:8080

### 2. Sample App

```bash
cd sample-app-node
npm install
npm start
```

Accéder à : http://localhost:3000

### 3. Playground

```bash
# Installer la base de données
psql -U postgres -d molam_connect -f migrations/001_playground.sql

# Démarrer le backend
cd playground
npm install
npm start
```

Accéder au playground : http://localhost:8082

---

## 📚 Quickstarts

### Node.js

```javascript
import Molam from 'molam-sdk';

const molam = new Molam('sk_test_xxx');

const payment = await molam.payments.create({
  amount: 5000,
  currency: 'XOF',
  method: 'wallet'
});

console.log('Paiement créé:', payment.id);
```

[➡️ Voir le guide complet Node.js](./quickstarts/node.md)

### PHP

```php
<?php
require 'vendor/autoload.php';

$molam = new \Molam\Client('sk_test_xxx');

$payment = $molam->payments->create([
    'amount' => 5000,
    'currency' => 'XOF',
    'method' => 'wallet'
]);

echo "Paiement créé: " . $payment->id;
```

[➡️ Voir le guide complet PHP](./quickstarts/php.md)

### Python

```python
import molam

client = molam.Client('sk_test_xxx')

payment = client.payments.create({
    'amount': 5000,
    'currency': 'XOF',
    'method': 'wallet'
})

print('Paiement créé:', payment['id'])
```

[➡️ Voir le guide complet Python](./quickstarts/python.md)

---

## 🔮 Playground Interactif

### Fonctionnalités

- ✅ **Éditeur de requêtes** - Configurez méthode, path, body
- ✅ **Exécution sandbox** - Testez sans impact production
- ✅ **Suggestions Sira** - Détection automatique d'erreurs
- ✅ **Génération snippets** - Code prêt à l'emploi
- ✅ **Partage** - Partagez vos tests

### API Endpoints

```typescript
// Exécuter une requête
POST /api/playground/run
{
  "method": "POST",
  "path": "/v1/payments",
  "body": { "amount": 5000, "currency": "XOF" }
}

// Sauvegarder une session
POST /api/playground/save
{ "sessionId": "uuid" }

// Partager une session
POST /api/playground/share
{ "sessionId": "uuid" }
// → Returns: { "url": "https://docs.molam.com/playground/abc123" }

// Session publique
GET /api/playground/public/:shareKey
```

### Composant React

```tsx
import Playground from './components/Playground';

<Playground apiBase="http://localhost:8082" />
```

---

## 🤖 Suggestions Sira

Le playground détecte automatiquement:

- ❌ **Manque d'idempotence** - Header Idempotency-Key manquant
- ❌ **Méthode invalide** - Méthode HTTP incorrecte
- ❌ **Path manquant** - Endpoint non spécifié
- ⚠️ **Bonnes pratiques** - Suggestions d'amélioration

---

## 📊 Base de Données

### Tables

```sql
playground_sessions      -- Sessions de code exécuté
playground_snippets      -- Snippets générés
playground_audit_logs    -- Logs d'audit
```

[➡️ Voir le schéma complet](./migrations/001_playground.sql)

---

## 🌍 Multi-pays / Multi-devises

### Exemples par devise

**XOF (Franc CFA)**
```javascript
{
  amount: 5000,      // 50.00 FCFA
  currency: 'XOF',
  method: 'wallet',
  customer: { phone: '+221771234567' }
}
```

**EUR (Euro)**
```javascript
{
  amount: 10000,     // 100.00 EUR
  currency: 'EUR',
  method: 'card'
}
```

**USD (Dollar)**
```javascript
{
  amount: 5000,      // 50.00 USD
  currency: 'USD',
  method: 'card'
}
```

---

## 🔐 Sécurité

### Sandbox

- ✅ Isolation complète du playground
- ✅ Rate limiting par utilisateur
- ✅ Pas de clés réelles exposées
- ✅ Audit trail complet

### Webhooks

```javascript
// Vérifier la signature
const isValid = molam.webhooks.verifySignature(
  payload,
  signature,
  'whsec_xxx'
);
```

---

## 📈 Prochaines Étapes

1. **Multilingue** - Support 🇫🇷 🇬🇧 🇪🇸
2. **Recherche Algolia** - Recherche instantanée
3. **Dark mode** - Thème sombre
4. **Tests auto** - CI/CD pour snippets
5. **SIRA ML avancé** - Suggestions prédictives

---

## 🛠️ Développement

### Sample App

```bash
cd sample-app-node
npm install
npm run dev     # Nodemon avec hot-reload
```

### Playground Backend

```bash
cd playground
npm install
npm run dev
```

### Playground Frontend

```bash
cd playground/web
npm install
npm run dev
```

---

## 📝 Exemples Complets

- [Sample App Node.js](./sample-app-node/)
- [Quickstart Node.js](./quickstarts/node.md)
- [Quickstart PHP](./quickstarts/php.md)
- [Quickstart Python](./quickstarts/python.md)

---

## 🏆 Avantages

✅ **Démarrage rapide** - 5 min pour intégrer
✅ **Exemples réels** - Code prêt à l'emploi
✅ **Multi-plateforme** - Node/PHP/Python/Mobile
✅ **Playground interactif** - Testez sans coder
✅ **IA intégrée** - Sira vous guide
✅ **Open source** - Contribuez sur GitHub

---

**Brique 117 + 117-bis** ✅ Production Ready
**Molam Connect** — Documentation développeur de classe mondiale 🚀
