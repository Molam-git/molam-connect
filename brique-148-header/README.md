# BRIQUE 148 — Header Unifié (Notifications + Paramètres + Scroll)

## Objectif

Header unifié Apple-like pour toutes les applications Molam (Pay, Connect, Wallet, Shop, Eats, Talk, Ads) avec :

- **RBAC strict** : Chaque bouton et outil du menu visible uniquement si l'utilisateur a les droits
- **Configuration JSON** : Menu Paramètres configurable par Ops sans coder
- **Design Apple-like** : Minimal, clair, interactions fluides
- **Scroll-to-top** : Toujours accessible pour l'accessibilité
- **Multi-langues & multi-devises** : Molam ID aware

## Fonctionnalités

### 1. RBAC (Role-Based Access Control)

Chaque élément de l'UI est conditionné par les rôles de l'utilisateur :

**Rôles disponibles** :
- `owner` : Accès complet (propriétaire de l'organisation)
- `ops` : Opérations, alertes, sécurité
- `finance` : Paiements, payouts, trésorerie
- `marketing` : Campagnes, analytics
- `merchant` : Profil, méthodes de paiement
- `customer` : Accès minimal

**Exemple de permissions** :
```typescript
owner → notifications, settings, profile, security, payments, payouts, alerts, rbac
ops → notifications, settings, security, payouts, alerts
finance → settings, payments, payouts
merchant → settings, profile, payments
customer → (aucun accès au header)
```

### 2. Configuration JSON

Le menu Paramètres est entièrement configurable via `config/settingsMenu.json` :

```json
{
  "general": [
    { "id": "profile", "label": "Profil utilisateur", "roles": ["owner", "ops", "merchant"] }
  ],
  "finance": [
    { "id": "payments", "label": "Méthodes de paiement", "roles": ["owner", "finance"] }
  ]
}
```

**Avantages** :
- Ops peut ajouter/retirer des outils sans coder
- Activation/désactivation par feature flags
- Configuration par environnement (staging, production)

### 3. Design Apple-like

**Principes** :
- Minimal : Pas de surcharge visuelle
- Espacements généreux : 16-24px entre éléments
- Coins arrondis : border-radius 12px
- Micro-interactions : Hover, transitions fluides
- Typographie propre : System fonts (-apple-system)

### 4. Notifications

Badge avec compteur en temps réel :
- Connexion WebSocket pour mises à jour live
- Badge rouge avec nombre de notifications non lues
- Dropdown avec liste des notifications récentes

### 5. Scroll-to-top

Bouton floating qui apparaît après 200px de scroll :
- Position fixe en bas à droite
- Animation smooth scroll
- Icône ArrowUp claire

## Stack Technique

- **React 18** avec TypeScript
- **Tailwind CSS** pour le styling
- **lucide-react** pour les icônes
- **Molam ID** pour l'authentification et les rôles
- **Context API** pour la configuration globale

## Installation

```bash
cd brique-148-header
npm install
```

## Usage

### Basic Setup

```tsx
import { Header, ScrollToTopButton } from '@molam/ui-header';
import { UIConfigProvider } from '@molam/ui-header/context';

function App() {
  const user = useMolamID(); // Get user from Molam ID

  return (
    <UIConfigProvider>
      <Header role={user.role} userId={user.id} />

      {/* Your app content */}
      <main className="pt-16"> {/* Offset for fixed header */}
        <YourContent />
      </main>

      <ScrollToTopButton />
    </UIConfigProvider>
  );
}
```

### Custom Configuration

```tsx
import { UIConfigProvider } from '@molam/ui-header/context';
import customConfig from './myConfig.json';

<UIConfigProvider config={customConfig}>
  <App />
</UIConfigProvider>
```

## Configuration Files

### uiConfig.json

Contrôle les fonctionnalités globales du header :

```json
{
  "showNotifications": true,
  "showSettings": true,
  "showUserMenu": true,
  "languages": ["fr", "en", "wolof", "ar"],
  "defaultLanguage": "fr",
  "currencies": ["XOF", "XAF", "EUR", "USD"],
  "defaultCurrency": "XOF",
  "theme": {
    "primaryColor": "#0A84FF",
    "headerHeight": "64px"
  }
}
```

### settingsMenu.json

Définit la structure du menu Paramètres :

```json
{
  "general": [
    {
      "id": "profile",
      "label": "Profil utilisateur",
      "icon": "User",
      "roles": ["owner", "ops", "merchant"],
      "path": "/settings/profile"
    }
  ],
  "finance": [
    {
      "id": "payments",
      "label": "Méthodes de paiement",
      "icon": "CreditCard",
      "roles": ["owner", "finance"],
      "path": "/settings/payments"
    }
  ]
}
```

## RBAC Hook

### useRBAC

Vérifier si l'utilisateur a accès à une fonctionnalité :

```tsx
import { useRBAC } from '@molam/ui-header/hooks';

function MyComponent() {
  const hasAccess = useRBAC('owner', 'notifications');

  if (!hasAccess) return null;

  return <NotificationsPanel />;
}
```

## Components API

### Header

```tsx
<Header
  role="owner"           // User role from Molam ID
  userId="user-123"      // User ID
  onNotificationClick={() => {}} // Optional callback
  onSettingsClick={() => {}}     // Optional callback
/>
```

**Props** :
- `role`: string - User role (required)
- `userId`: string - User ID (required)
- `onNotificationClick`: () => void - Callback when notifications clicked
- `onSettingsClick`: () => void - Callback when settings clicked
- `className`: string - Additional CSS classes

### NotificationsButton

```tsx
<NotificationsButton
  role="owner"
  count={3}              // Unread notifications count
  notifications={[]}     // Array of recent notifications
  onMarkAsRead={(id) => {}}
/>
```

### SettingsMenu

```tsx
<SettingsMenu
  role="owner"
  onItemClick={(itemId) => console.log(itemId)}
/>
```

### ScrollToTopButton

```tsx
<ScrollToTopButton
  threshold={200}        // Show after scrolling 200px
  className="custom-class"
/>
```

## Customization

### Styling

Override default styles with Tailwind classes :

```tsx
<Header className="bg-gray-900 text-white" />
```

### Custom Icons

Replace default icons :

```tsx
import { Settings, Bell } from 'lucide-react';

<Header
  notificationIcon={<Bell />}
  settingsIcon={<Settings />}
/>
```

## Accessibility

- ✅ Keyboard navigation (Tab, Enter, Escape)
- ✅ ARIA labels on all interactive elements
- ✅ Focus visible styles
- ✅ Screen reader friendly
- ✅ High contrast support

## Multi-language Support

```tsx
import { useTranslation } from 'react-i18next';

function Header() {
  const { t } = useTranslation();

  return <h1>{t('header.title')}</h1>;
}
```

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm test -- --coverage
```

## Examples

### Example 1: Owner Role

```tsx
<Header role="owner" userId="owner-123" />
```

Sees:
- Notifications (3 unread)
- Settings → All sections (general, finance, ops)

### Example 2: Finance Role

```tsx
<Header role="finance" userId="finance-456" />
```

Sees:
- Settings → Finance section only (payments, payouts)

### Example 3: Merchant Role

```tsx
<Header role="merchant" userId="merchant-789" />
```

Sees:
- Settings → General section (profile, payments)

## Performance

- ✅ Lazy loading of dropdown menus
- ✅ Memoized RBAC checks
- ✅ Optimized re-renders with React.memo
- ✅ Bundle size: < 15KB gzipped

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

Proprietary - Molam Platform
