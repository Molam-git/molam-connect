# Runbook — Brique 143: Internationalization & Accessibility (i18n/a11y)

## 📘 Vue d'ensemble

Système d'internationalisation et d'accessibilité permettant à Molam Pay d'être utilisable dans toutes les langues et conforme aux standards WCAG 2.1 AA.

## 🔑 Fonctionnalités clés

- **4 langues supportées**: English (en), Français (fr), Wolof (wo), العربية (ar)
- **Préférences utilisateur**: Langue, devise, fuseau horaire persistées dans Molam ID
- **Accessibilité WCAG 2.1 AA**: Contraste, navigation clavier, ARIA, lecteurs d'écran
- **RTL support**: Right-to-Left pour l'arabe
- **Responsive**: Toutes tailles d'écran avec accessibilité maintenue
- **Tests automatisés**: jest-axe pour validation WCAG

## 📊 Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Frontend      │─────>│  i18n Provider   │─────>│  User Prefs     │
│   (React)       │      │  (Context API)   │      │  (Molam ID)     │
└─────────────────┘      └──────────────────┘      └─────────────────┘
        │                                                    │
        │                                                    ▼
        │                                           ┌─────────────────┐
        │                                           │  Backend API    │
        │                                           │  /preferences   │
        │                                           └─────────────────┘
        │                                                    │
        ▼                                                    ▼
┌─────────────────┐                              ┌─────────────────────┐
│  Translation    │                              │   PostgreSQL        │
│  Files (JSON)   │                              │  user_preferences   │
└─────────────────┘                              └─────────────────────┘
```

## 🚀 Démarrage rapide

### 1. Déployer la base de données

```bash
psql -U molam -d molam_id -f database/migrations/143_i18n_accessibility.sql
```

### 2. Intégrer i18n dans l'app

```typescript
// App.tsx
import { I18nProvider } from './i18n';
import { I18nProvider } from './i18n';

function App() {
  return (
    <I18nProvider initialLang="fr">
      <YourApp />
    </I18nProvider>
  );
}
```

### 3. Utiliser les traductions

```typescript
import { useI18n } from './i18n';

function CheckoutButton() {
  const { t } = useI18n();

  return (
    <button aria-label={t('pay_now')}>
      {t('pay_now')}
    </button>
  );
}
```

### 4. Utiliser les composants accessibles

```typescript
import { AccessibleButton, AccessibleInput } from './components/AccessibleButton';

function LoginForm() {
  return (
    <form>
      <AccessibleInput
        label="Email"
        type="email"
        required
        error={emailError}
      />
      <AccessibleButton type="submit" variant="primary">
        Login
      </AccessibleButton>
    </form>
  );
}
```

## 🌍 Langues supportées

| Code | Langue | Native | RTL | Devise par défaut |
|------|--------|--------|-----|-------------------|
| `en` | English | English | Non | USD |
| `fr` | French | Français | Non | XOF |
| `wo` | Wolof | Wolof | Non | XOF |
| `ar` | Arabic | العربية | Oui | USD |

## 📝 Ajouter une nouvelle traduction

### 1. Ajouter dans les fichiers JSON

```json
// locales/en.json
{
  "new_feature": {
    "title": "New Feature",
    "description": "This is a new feature"
  }
}

// locales/fr.json
{
  "new_feature": {
    "title": "Nouvelle fonctionnalité",
    "description": "Ceci est une nouvelle fonctionnalité"
  }
}
```

### 2. Utiliser dans le code

```typescript
function NewFeature() {
  const { t } = useI18n();

  return (
    <div>
      <h1>{t('new_feature.title')}</h1>
      <p>{t('new_feature.description')}</p>
    </div>
  );
}
```

### 3. Ajouter dans la base de données (pour CMS)

```sql
-- Insert translation key
INSERT INTO translation_keys(key, category, context)
VALUES ('new_feature.title', 'features', 'Title for new feature');

-- Insert translations
INSERT INTO translations(translation_key_id, language, value)
SELECT id, 'en', 'New Feature' FROM translation_keys WHERE key = 'new_feature.title'
UNION ALL
SELECT id, 'fr', 'Nouvelle fonctionnalité' FROM translation_keys WHERE key = 'new_feature.title';
```

## ♿ Accessibilité (WCAG 2.1 AA)

### Checklist WCAG

- ✅ **1.1.1 Non-text Content**: Toutes images ont `alt` text
- ✅ **1.3.1 Info and Relationships**: Semantic HTML + ARIA labels
- ✅ **1.4.3 Contrast**: Ratio 4.5:1 minimum (normal text), 3:1 (large text)
- ✅ **2.1.1 Keyboard**: Toutes fonctionnalités accessibles au clavier
- ✅ **2.1.2 No Keyboard Trap**: Pas de piège clavier
- ✅ **2.4.1 Bypass Blocks**: Skip links présents
- ✅ **2.4.3 Focus Order**: Ordre logique de focus
- ✅ **2.4.7 Focus Visible**: Focus visible sur tous éléments
- ✅ **3.1.1 Language**: `lang` attribute sur `<html>`
- ✅ **3.2.1 On Focus**: Pas de changement de contexte au focus
- ✅ **4.1.2 Name, Role, Value**: ARIA roles corrects

### Composants accessibles disponibles

#### AccessibleButton
```typescript
<AccessibleButton
  variant="primary"
  size="large"
  loading={isLoading}
  ariaLabel="Pay now"
>
  Pay Now
</AccessibleButton>
```

#### AccessibleInput
```typescript
<AccessibleInput
  label="Email"
  type="email"
  required
  error={errors.email}
  helperText="We'll never share your email"
/>
```

#### AccessibleModal
```typescript
<AccessibleModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Confirm Payment"
>
  <p>Are you sure?</p>
</AccessibleModal>
```

#### SkipLink
```typescript
<SkipLink /> {/* At top of page */}

{/* ... */}

<main id="main-content">
  {/* Main content */}
</main>
```

### Préférences d'accessibilité

```typescript
import { useAccessibility } from './hooks/useAccessibility';

function AccessibilitySettings() {
  const { prefs, updatePreference, togglePreference } = useAccessibility();

  return (
    <div>
      <button onClick={() => togglePreference('darkMode')}>
        Dark Mode: {prefs.darkMode ? 'On' : 'Off'}
      </button>

      <button onClick={() => togglePreference('highContrast')}>
        High Contrast: {prefs.highContrast ? 'On' : 'Off'}
      </button>

      <button onClick={() => togglePreference('reduceMotion')}>
        Reduce Motion: {prefs.reduceMotion ? 'On' : 'Off'}
      </button>

      <button onClick={() => increaseFontSize()}>
        Increase Font Size
      </button>
    </div>
  );
}
```

## 📈 API Endpoints

### GET /api/preferences
Récupérer les préférences de l'utilisateur

```bash
curl -X GET http://api.molam.com/api/preferences \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "language": "fr",
  "currency": "XOF",
  "timezone": "Africa/Dakar",
  "high_contrast": false,
  "dark_mode": true,
  "font_size": "medium",
  "reduce_motion": false,
  "screen_reader": false,
  "keyboard_nav_only": false
}
```

### PATCH /api/preferences
Mettre à jour les préférences

```bash
curl -X PATCH http://api.molam.com/api/preferences \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "language": "wo",
    "dark_mode": true,
    "font_size": "large"
  }'
```

### GET /api/translations
Récupérer les traductions dynamiques (CMS)

```bash
curl -X GET "http://api.molam.com/api/translations?language=fr&keys=pay_now,balance"

# Response:
{
  "pay_now": "Payer maintenant",
  "balance": "Solde"
}
```

### POST /api/accessibility/audit
Logger un problème d'accessibilité

```bash
curl -X POST http://api.molam.com/api/accessibility/audit \
  -H "Content-Type: application/json" \
  -d '{
    "page_url": "/checkout",
    "component": "PaymentButton",
    "issue_type": "contrast",
    "severity": "serious",
    "wcag_criterion": "1.4.3",
    "description": "Button text contrast ratio is 3.2:1, needs 4.5:1"
  }'
```

## 🧪 Tests

### Run Jest tests avec axe-core

```bash
npm test web/src/__tests__/i18n-accessibility.test.tsx
```

### Test coverage translation

```bash
# Check all keys exist in all languages
node scripts/check-translations.js
```

### Manual WCAG testing

1. **Keyboard navigation**: Tab through all interactive elements
2. **Screen reader**: Test with NVDA (Windows) or VoiceOver (Mac)
3. **Zoom**: Test at 200% zoom
4. **Contrast**: Use browser DevTools or WebAIM Contrast Checker
5. **Color blindness**: Use browser extensions to simulate

## 🔧 Dépannage

### Traductions manquantes

```sql
-- Find missing translations for a language
SELECT tk.key
FROM translation_keys tk
LEFT JOIN translations t ON t.translation_key_id = tk.id AND t.language = 'wo'
WHERE t.id IS NULL;
```

### Problèmes d'accessibilité

```sql
-- View unresolved accessibility issues
SELECT * FROM accessibility_audit_log
WHERE resolved = false
ORDER BY severity, created_at DESC;
```

### Préférences non persistées

```bash
# Check localStorage
console.log(localStorage.getItem('molam_lang'));
console.log(localStorage.getItem('molam_a11y_prefs'));

# Check backend sync
curl -X GET http://api.molam.com/api/preferences \
  -H "Authorization: Bearer $TOKEN"
```

## 📊 Monitoring

### Statistiques d'utilisation des langues

```sql
SELECT language, SUM(page_views) as total_views
FROM language_usage_stats
WHERE date > CURRENT_DATE - INTERVAL '30 days'
GROUP BY language
ORDER BY total_views DESC;
```

### Problèmes d'accessibilité par sévérité

```sql
SELECT severity, COUNT(*) as count
FROM accessibility_audit_log
WHERE resolved = false
GROUP BY severity
ORDER BY CASE severity
  WHEN 'critical' THEN 1
  WHEN 'serious' THEN 2
  WHEN 'moderate' THEN 3
  WHEN 'minor' THEN 4
END;
```

## 🔐 CSS Accessibility Classes

```css
/* Font sizes */
.font-small { font-size: 14px; }
.font-medium { font-size: 16px; }
.font-large { font-size: 18px; }
.font-xlarge { font-size: 20px; }

/* High contrast mode */
.high-contrast {
  --text: #000;
  --bg: #fff;
  --primary: #0000ff;
}

/* Reduce motion */
.reduce-motion * {
  animation-duration: 0.01ms !important;
  transition-duration: 0.01ms !important;
}

/* Screen reader only */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.sr-only:focus {
  position: static;
  width: auto;
  height: auto;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

## ✅ Checklist quotidienne

- [ ] Vérifier issues d'accessibilité non résolues
- [ ] Review traductions manquantes
- [ ] Check statistiques d'utilisation des langues
- [ ] Test keyboard navigation sur nouvelles features
- [ ] Run axe-core tests en CI

## 📞 Support

- **Slack**: #i18n-a11y
- **Docs**: https://docs.molam.com/i18n-accessibility
- **WCAG Reference**: https://www.w3.org/WAI/WCAG21/quickref/

---

**Dernière mise à jour**: 2025-01-18
