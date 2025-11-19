# Brique 139 — Internationalisation & Accessibilité

## 📋 Vue d'ensemble

La **Brique 139** est le système d'internationalisation (i18n) et d'accessibilité industriel de **Molam Pay**. Elle rend Molam Pay (Wallet + Connect) et tous ses plugins/formulaires **multi-pays**, **multi-langues**, **multi-devises** et **accessibles** sur toutes les plateformes (Web, Mobile, Desktop).

### Langues supportées
- **Français (fr)** - LTR
- **Anglais (en)** - LTR
- **Wolof (wo)** - LTR
- **Arabe (ar)** - RTL

### Devises supportées
- **XOF** (Franc CFA Ouest-Africain) - Sénégal, Côte d'Ivoire, Mali, etc.
- **XAF** (Franc CFA Centre-Africain) - Cameroun, Gabon, etc.
- **NGN** (Naira Nigérian)
- **GHS** (Cedi Ghanéen)
- **KES** (Shilling Kenyan)
- **USD** (Dollar Américain)
- **EUR** (Euro)

### Standards de conformité
- ✅ **WCAG 2.2 Level AA**
- ✅ **RGAA** (Référentiel Général d'Amélioration de l'Accessibilité)
- ✅ **Section 508**
- ✅ **RTL Support** (Right-to-Left pour l'arabe)

---

## 🚀 Quick Start

### Prérequis
- Node.js >= 18.0.0
- PostgreSQL >= 13
- Redis >= 6 (optionnel mais recommandé)

### Installation

```bash
# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env

# Configurer les variables d'environnement
nano .env

# Exécuter les migrations de base de données
npm run migrate

# Démarrer en mode développement
npm run dev

# Build pour production
npm run build

# Démarrer en production
npm start
```

### Configuration de la base de données

```bash
# Connectez-vous à PostgreSQL
psql -U postgres

# Créez la base de données
CREATE DATABASE molam_connect;

# Exécutez le script SQL de migration
\i database/migrations/001_create_i18n_tables.sql
```

---

## 📚 Architecture

### Structure du projet

```
brique-139/
├── src/
│   ├── server.ts                 # Serveur Express principal
│   ├── routes.ts                 # API REST endpoints
│   ├── db.ts                     # Connexion PostgreSQL
│   ├── cache.ts                  # Client Redis
│   ├── types.ts                  # Types TypeScript
│   ├── services/
│   │   ├── i18nService.ts        # Service de traductions
│   │   ├── currencyService.ts    # Service de devises
│   │   └── regionalService.ts    # Service régional
│   └── workers/
│       ├── index.ts
│       ├── translationSyncWorker.ts      # Export vers CDN
│       ├── accessibilityCheckerWorker.ts # Audit WCAG
│       └── currencyUpdaterWorker.ts      # Mise à jour devises
├── ui/
│   └── components/
│       ├── LanguageSwitcher.tsx  # Sélecteur de langue
│       ├── RTLContainer.tsx      # Container RTL/LTR
│       ├── AccessibleButton.tsx  # Boutons accessibles
│       └── CurrencyDisplay.tsx   # Affichage de devise
├── database/
│   └── migrations/
│       └── 001_create_i18n_tables.sql
├── exports/                      # Export des traductions
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Tables de base de données

1. **languages** - Langues supportées (fr, en, wo, ar)
2. **translations** - Dictionnaire de traductions avec fallback hiérarchique
3. **translation_history** - Historique des modifications (audit trail)
4. **currency_formats** - Règles de formatage des devises
5. **regional_settings** - Paramètres régionaux par pays
6. **accessibility_logs** - Logs d'audit d'accessibilité
7. **sira_translation_suggestions** - Suggestions IA de SIRA

---

## 🔌 API REST

### Base URL
```
http://localhost:3139/api/v1
```

### Endpoints de traduction

#### GET /i18n/:lang/:module
Récupérer les traductions pour une langue et un module.

```bash
curl http://localhost:3139/api/v1/i18n/fr/common
```

**Réponse:**
```json
{
  "app.name": "Molam Pay",
  "button.submit": "Soumettre",
  "button.cancel": "Annuler"
}
```

#### POST /i18n/update
Mettre à jour ou créer une traduction (nécessite auth).

```bash
curl -X POST http://localhost:3139/api/v1/i18n/update \
  -H "Content-Type: application/json" \
  -H "X-User-ID: user123" \
  -H "X-User-Role: ops_admin" \
  -d '{
    "lang_code": "fr",
    "module": "wallet",
    "key": "balance.label",
    "value": "Solde disponible"
  }'
```

#### GET /i18n/coverage
Obtenir les statistiques de couverture des traductions.

```bash
curl http://localhost:3139/api/v1/i18n/coverage
```

### Endpoints de devise

#### POST /currency/format
Formater un montant selon les règles régionales.

```bash
curl -X POST http://localhost:3139/api/v1/currency/format \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 25000,
    "currency": "XOF",
    "locale": "fr-SN"
  }'
```

**Réponse:**
```json
{
  "formatted": "25 000 CFA",
  "amount": 25000,
  "currency": "XOF",
  "locale": "fr-SN"
}
```

#### GET /currency/:code
Récupérer le format d'une devise.

```bash
curl http://localhost:3139/api/v1/currency/XOF
```

### Endpoints régionaux

#### GET /regional/:countryCode
Récupérer les paramètres régionaux d'un pays.

```bash
curl http://localhost:3139/api/v1/regional/SN
```

**Réponse:**
```json
{
  "country_code": "SN",
  "country_name": "Senegal",
  "default_language": "fr",
  "supported_languages": ["fr", "wo", "en"],
  "default_currency": "XOF",
  "timezone": "Africa/Dakar",
  "phone_code": "+221"
}
```

#### GET /regional/detect
Auto-détection des paramètres régionaux.

```bash
curl http://localhost:3139/api/v1/regional/detect?country=SN \
  -H "Accept-Language: fr-FR,en;q=0.9"
```

---

## 🎨 Composants UI React

### LanguageSwitcher

```tsx
import { LanguageSwitcher } from '@molam/brique-139/ui/components';

function App() {
  const [lang, setLang] = useState('fr');

  return (
    <LanguageSwitcher
      currentLanguage={lang}
      languages={[
        { code: 'fr', name: 'French', native_name: 'Français', direction: 'ltr' },
        { code: 'en', name: 'English', native_name: 'English', direction: 'ltr' },
        { code: 'ar', name: 'Arabic', native_name: 'العربية', direction: 'rtl' },
      ]}
      onChange={setLang}
      variant="buttons" // ou 'dropdown', 'compact'
    />
  );
}
```

### RTLContainer

```tsx
import { RTLContainer, useRTL } from '@molam/brique-139/ui/components';

function App() {
  const [lang, setLang] = useState('ar');
  const isRTL = useRTL(lang);

  return (
    <RTLContainer direction={isRTL ? 'rtl' : 'ltr'} lang={lang}>
      <div>Contenu avec support RTL automatique</div>
    </RTLContainer>
  );
}
```

### AccessibleButton

```tsx
import { AccessibleButton } from '@molam/brique-139/ui/components';

<AccessibleButton
  variant="primary"
  size="md"
  onClick={handleSubmit}
  ariaLabel="Valider le paiement"
  loading={isLoading}
>
  Payer
</AccessibleButton>
```

### CurrencyDisplay

```tsx
import { CurrencyDisplay } from '@molam/brique-139/ui/components';

<CurrencyDisplay
  amount={25000}
  currency="XOF"
  locale="fr-SN"
  showCode={true}
/>
// Affiche: 25 000 CFA
```

---

## ⚙️ Workers CRON

### Translation Sync Worker
- **Fréquence:** Chaque nuit à 2h
- **Rôle:** Export des traductions vers CDN
- **Fichiers:** JSON par langue et par module

### Accessibility Checker Worker
- **Fréquence:** Toutes les 6 heures
- **Rôle:** Audit WCAG 2.2, détection des traductions manquantes
- **Alertes:** Email/Slack si problèmes critiques

### Currency Updater Worker
- **Fréquence:** Quotidien à 1h
- **Rôle:** Mise à jour des règles BCEAO/FED
- **Optionnel:** Taux de change (API externe)

### Exécution manuelle

```bash
# Démarrer tous les workers
npm run worker

# Exécuter un worker spécifique
node -r ts-node/register src/workers/index.ts translation-sync
```

---

## 🧪 Tests

```bash
# Exécuter tous les tests
npm test

# Tests en mode watch
npm test:watch

# Coverage
npm test -- --coverage
```

### Exemple de test

```typescript
// src/services/i18nService.test.ts
import { getTranslations } from './i18nService';

describe('i18nService', () => {
  it('should return translations with fallback', async () => {
    const translations = await getTranslations('wo', 'common');
    expect(translations['app.name']).toBe('Molam Pay');
  });

  it('should fallback to French if Wolof not available', async () => {
    const translations = await getTranslations('wo', 'nonexistent');
    expect(translations).toBeDefined();
  });
});
```

---

## 🔒 Sécurité & Conformité

### Authentification
- JWT RS256 via Molam ID
- Rôles: `ops_admin`, `i18n_editor`, `viewer`

### Audit Trail
- Toutes les modifications de traductions loggées
- Historique complet avec versioning
- Multi-signature pour activation de nouvelle langue

### WCAG 2.2 Compliance
- ✅ **1.3.2** Meaningful Sequence (RTL support)
- ✅ **3.1.1** Language of Page
- ✅ **3.3.1** Error Identification
- ✅ **4.1.2** Name, Role, Value (ARIA)

---

## 📊 Monitoring

### Métriques Prometheus

```
# Traductions manquantes par langue
i18n_missing_translations{lang="wo"} 12

# Couverture par module
i18n_coverage{lang="fr",module="wallet"} 98.5

# Erreurs d'accessibilité non résolues
accessibility_errors{severity="critical"} 0
```

### Logs structurés (Winston)

```json
{
  "level": "info",
  "message": "Translation updated",
  "lang_code": "fr",
  "module": "wallet",
  "key": "balance.label",
  "user": "ops123",
  "timestamp": "2025-01-18T10:30:00Z"
}
```

---

## 🌍 Intégration SIRA

La Brique 139 s'intègre avec **SIRA** (Molam AI) pour:
- Auto-suggérer corrections linguistiques
- Détecter traductions de mauvaise qualité
- Proposer traductions manquantes
- Benchmarks UX multi-régions

---

## 🛠️ Maintenance

### Ajouter une nouvelle langue

```sql
-- 1. Ajouter la langue
INSERT INTO languages (code, name, native_name, direction)
VALUES ('pt', 'Portuguese', 'Português', 'ltr');

-- 2. Ajouter les traductions de base
INSERT INTO translations (lang_code, module, key, value)
SELECT 'pt', module, key, 'TODO: Translation needed'
FROM translations
WHERE lang_code = 'en'
GROUP BY module, key;
```

### Ajouter une nouvelle devise

```sql
INSERT INTO currency_formats (
  code, name, symbol, decimal_separator, thousand_separator,
  precision, rounding_mode, symbol_position, space_between, iso_code, regions
)
VALUES (
  'MAD', 'Moroccan Dirham', 'DH', ',', ' ',
  2, 'HALF_UP', 'after', true, 'MAD', ARRAY['MA']
);
```

---

## 📞 Support

- **Documentation:** https://docs.molampay.com/brique-139
- **Issues:** GitHub Issues
- **Slack:** #brique-139-i18n

---

## 📝 Changelog

### v1.0.0 (2025-01-18)
- ✅ Support initial: fr, en, wo, ar
- ✅ 7 devises africaines + USD/EUR
- ✅ API REST complète
- ✅ Workers CRON
- ✅ Composants React accessibles
- ✅ Conformité WCAG 2.2 AA

---

## 📄 Licence

MIT © Molam Pay

---

**Note:** Cette brique est un composant critique de l'infrastructure Molam Pay. Toute modification doit passer par code review et tests d'accessibilité complets.
