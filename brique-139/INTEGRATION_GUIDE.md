# Guide d'intégration - Brique 139

## 🎯 Intégration rapide dans Molam Connect

### Étape 1: Installation

```bash
cd f:\molam\molam-connect
cd brique-139
npm install
```

### Étape 2: Configuration de la base de données

```bash
# Connectez-vous à PostgreSQL
psql -U postgres -d molam_connect

# Exécutez le script SQL
\i database/migrations/001_create_i18n_tables.sql

# Vérifiez les tables créées
\dt

# Résultat attendu:
# - languages
# - translations
# - translation_history
# - currency_formats
# - regional_settings
# - accessibility_logs
# - sira_translation_suggestions
```

### Étape 3: Configuration environnement

```bash
# Créer le fichier .env
cp .env.example .env

# Éditer avec vos credentials
nano .env
```

**Exemple .env:**
```env
NODE_ENV=development
PORT=3139
DB_HOST=localhost
DB_PORT=5432
DB_NAME=molam_connect
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe
REDIS_URL=redis://localhost:6379
ENABLE_WORKERS=true
```

### Étape 4: Build & Start

```bash
# Build TypeScript
npm run build

# Démarrer le serveur
npm start

# Ou en mode dev
npm run dev
```

### Étape 5: Vérification

```bash
# Test health check
curl http://localhost:3139/api/v1/health

# Résultat attendu:
# {
#   "status": "healthy",
#   "database": "up",
#   "redis": "up",
#   "timestamp": "2025-01-18T..."
# }

# Test traductions françaises
curl http://localhost:3139/api/v1/i18n/fr/common

# Test devises
curl http://localhost:3139/api/v1/currency/XOF
```

---

## 🔗 Intégration dans server.js principal

### Option 1: Microservice séparé (Recommandé)

La Brique 139 tourne sur son propre port (3139) et le serveur principal fait des appels API.

**Dans server.js principal:**

```javascript
// Middleware pour injecter i18n context
app.use(async (req, res, next) => {
  try {
    const country = req.headers['x-country-code'] || 'SN';
    const acceptLang = req.headers['accept-language'] || 'fr';

    const response = await fetch(
      `http://localhost:3139/api/v1/regional/detect?country=${country}`,
      {
        headers: { 'Accept-Language': acceptLang }
      }
    );

    req.i18n = await response.json();
    next();
  } catch (error) {
    console.error('[i18n] Error detecting region:', error);
    req.i18n = { detected_language: 'fr' };
    next();
  }
});

// Utilisation dans les routes
app.get('/api/v1/payment_intents/:id', async (req, res) => {
  const lang = req.i18n.detected_language;

  // Récupérer traductions pour cette langue
  const translations = await fetch(
    `http://localhost:3139/api/v1/i18n/${lang}/connect`
  ).then(r => r.json());

  // Utiliser dans la réponse
  res.json({
    status: 'success',
    message: translations['payment.success'] || 'Payment successful',
    data: paymentIntent
  });
});
```

### Option 2: Intégration directe

Importer les services TypeScript directement.

**Dans server.js principal:**

```javascript
// Importer les services i18n
const { getTranslations } = require('./brique-139/dist/services/i18nService');
const { formatCurrency } = require('./brique-139/dist/services/currencyService');
const { detectUserRegion } = require('./brique-139/dist/services/regionalService');

// Middleware i18n
app.use(async (req, res, next) => {
  const country = req.headers['x-country-code'];
  const acceptLang = req.headers['accept-language'];

  const detected = await detectUserRegion(country, acceptLang);
  req.i18n = {
    lang: detected.detected_language,
    region: detected.regional_settings,
  };

  next();
});

// Helper pour formater montants
async function formatAmount(amount, currency, locale) {
  return await formatCurrency({ amount, currency, locale });
}

// Utilisation dans route
app.post('/api/v1/payment_intents', async (req, res) => {
  const { amount, currency } = req.body;
  const lang = req.i18n.lang;

  // Formater montant
  const formatted = await formatAmount(amount, currency, `${lang}-${req.i18n.region.country_code}`);

  // Récupérer traductions
  const t = await getTranslations(lang, 'connect');

  res.json({
    amount: formatted.formatted,
    message: t['payment.created'],
  });
});
```

---

## 🌐 Intégration Frontend (React)

### Installation composants UI

```bash
# Dans votre projet React
npm install @molam/brique-139-ui
# ou copiez les composants depuis ui/components/
```

### Exemple App.tsx

```tsx
import React, { useState, useEffect } from 'react';
import {
  LanguageSwitcher,
  RTLContainer,
  AccessibleButton,
  CurrencyDisplay,
} from '@molam/brique-139-ui';

function App() {
  const [lang, setLang] = useState('fr');
  const [translations, setTranslations] = useState({});
  const [isRTL, setIsRTL] = useState(false);

  // Charger traductions
  useEffect(() => {
    fetch(`http://localhost:3139/api/v1/i18n/${lang}/common`)
      .then(r => r.json())
      .then(data => setTranslations(data));

    setIsRTL(lang === 'ar');
  }, [lang]);

  const t = (key) => translations[key] || key;

  return (
    <RTLContainer direction={isRTL ? 'rtl' : 'ltr'} lang={lang}>
      <div className="app">
        {/* Header avec sélecteur de langue */}
        <header>
          <h1>{t('app.name')}</h1>
          <LanguageSwitcher
            currentLanguage={lang}
            languages={[
              { code: 'fr', name: 'French', native_name: 'Français', direction: 'ltr' },
              { code: 'en', name: 'English', native_name: 'English', direction: 'ltr' },
              { code: 'wo', name: 'Wolof', native_name: 'Wolof', direction: 'ltr' },
              { code: 'ar', name: 'Arabic', native_name: 'العربية', direction: 'rtl' },
            ]}
            onChange={setLang}
            variant="compact"
          />
        </header>

        {/* Contenu principal */}
        <main>
          <h2>{t('wallet.balance.label')}</h2>
          <CurrencyDisplay
            amount={250000}
            currency="XOF"
            locale={`${lang}-SN`}
          />

          <AccessibleButton
            variant="primary"
            onClick={() => alert(t('button.clicked'))}
            ariaLabel={t('button.submit')}
          >
            {t('button.submit')}
          </AccessibleButton>
        </main>
      </div>
    </RTLContainer>
  );
}

export default App;
```

---

## 📱 Intégration SDK Mobile (React Native)

### Exemple PaymentScreen.tsx

```tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Button } from 'react-native';
import { CurrencyInput, LanguageSwitcher } from '@molam/brique-139-rn';

function PaymentScreen() {
  const [lang, setLang] = useState('fr');
  const [amount, setAmount] = useState(0);
  const [translations, setTranslations] = useState({});

  useEffect(() => {
    // Charger traductions depuis API ou cache local
    loadTranslations(lang);
  }, [lang]);

  const loadTranslations = async (language) => {
    // Option 1: Depuis API
    const response = await fetch(
      `https://api.molampay.com/v1/i18n/${language}/wallet`
    );
    const data = await response.json();
    setTranslations(data);

    // Option 2: Depuis fichiers locaux (offline-first)
    // import(`./translations/${language}/wallet.json`)
    //   .then(data => setTranslations(data));
  };

  const t = (key) => translations[key] || key;

  return (
    <View>
      <LanguageSwitcher current={lang} onChange={setLang} />

      <Text>{t('payment.amount')}</Text>
      <CurrencyInput
        value={amount}
        currency="XOF"
        onChange={setAmount}
        locale={lang}
      />

      <Button
        title={t('button.pay')}
        onPress={() => handlePayment(amount)}
        accessibilityLabel={t('button.pay')}
      />
    </View>
  );
}
```

---

## 🔐 Intégration avec authentification

### Middleware JWT

```javascript
// Dans server.js principal
const jwt = require('jsonwebtoken');

app.use('/api/v1/i18n/update', verifyJWT);
app.use('/api/v1/i18n/bulk-update', verifyJWT);

function verifyJWT(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Vérifier rôle pour i18n
    if (!['ops_admin', 'i18n_editor'].includes(decoded.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

---

## 📊 Monitoring & Alertes

### Intégration Prometheus

```javascript
// Dans server.js de la brique 139
const client = require('prom-client');

// Métriques custom
const translationMissingGauge = new client.Gauge({
  name: 'i18n_missing_translations',
  help: 'Number of missing translations per language',
  labelNames: ['lang', 'module'],
});

const coverageGauge = new client.Gauge({
  name: 'i18n_coverage_percent',
  help: 'Translation coverage percentage',
  labelNames: ['lang', 'module'],
});

// Endpoint metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Mise à jour périodique des métriques
setInterval(async () => {
  const coverage = await getTranslationCoverage();
  coverage.forEach(item => {
    coverageGauge.set(
      { lang: item.lang, module: item.module },
      item.coverage_percent
    );
  });
}, 60000); // Toutes les minutes
```

### Intégration Slack

```javascript
// Dans accessibilityCheckerWorker.ts
async function sendSlackAlert(summary, issues) {
  if (!process.env.SLACK_WEBHOOK_URL) return;

  const axios = require('axios');

  await axios.post(process.env.SLACK_WEBHOOK_URL, {
    text: `🚨 Accessibility Alert: ${summary.errors} critical issues`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Accessibility Audit Results*\n• Errors: ${summary.errors}\n• Warnings: ${summary.warnings}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: issues.slice(0, 5).map(i => `• ${i.message}`).join('\n'),
        },
      },
    ],
  });
}
```

---

## 🧪 Tests d'intégration

```bash
# Test complet de bout en bout
npm run test:integration

# Ou manuellement:

# 1. Récupérer traductions FR
curl http://localhost:3139/api/v1/i18n/fr/common

# 2. Formater montant XOF
curl -X POST http://localhost:3139/api/v1/currency/format \
  -H "Content-Type: application/json" \
  -d '{"amount":25000,"currency":"XOF","locale":"fr-SN"}'

# 3. Détecter région
curl http://localhost:3139/api/v1/regional/detect?country=SN

# 4. Mettre à jour traduction (avec auth)
curl -X POST http://localhost:3139/api/v1/i18n/update \
  -H "Content-Type: application/json" \
  -H "X-User-ID: ops123" \
  -H "X-User-Role: ops_admin" \
  -d '{
    "lang_code":"fr",
    "module":"test",
    "key":"integration.test",
    "value":"Test d'\''intégration"
  }'

# 5. Vérifier la mise à jour
curl http://localhost:3139/api/v1/i18n/fr/test
```

---

## 🚀 Déploiement production

### Docker

```dockerfile
# Dockerfile pour Brique 139
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY database ./database

ENV NODE_ENV=production
ENV PORT=3139

EXPOSE 3139

CMD ["node", "dist/server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  brique-139:
    build: ./brique-139
    ports:
      - "3139:3139"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:13
    environment:
      POSTGRES_DB: molam_connect
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## ✅ Checklist d'intégration

- [ ] Base de données migrée
- [ ] Variables d'environnement configurées
- [ ] Serveur Brique 139 démarré (port 3139)
- [ ] Health check OK
- [ ] Traductions chargées dans DB
- [ ] Redis connecté (optionnel)
- [ ] Workers CRON actifs
- [ ] Frontend intégré (LanguageSwitcher, etc.)
- [ ] API calls testés
- [ ] Monitoring configuré
- [ ] Documentation lue

---

**Pour toute question:** Consultez [README.md](README.md) ou contactez l'équipe Molam Pay.
