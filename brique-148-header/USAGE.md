# Guide d'Utilisation - Molam Header Component

## 🚀 Installation

```bash
npm install @molam/ui-header
# ou
yarn add @molam/ui-header
```

## 📦 Import

```tsx
import {
  Header,
  ScrollToTopButton,
  UIConfigProvider,
  type Notification
} from '@molam/ui-header';
```

## 🎯 Utilisation de Base

### 1. Wrapper votre app avec UIConfigProvider

```tsx
import { UIConfigProvider } from '@molam/ui-header';

function App() {
  return (
    <UIConfigProvider>
      {/* Votre application */}
    </UIConfigProvider>
  );
}
```

### 2. Ajouter le Header

```tsx
import { Header } from '@molam/ui-header';

function App() {
  const userRole = 'owner'; // De votre contexte auth
  const userName = 'Amadou Diallo';
  const userEmail = 'amadou@molam.io';

  return (
    <UIConfigProvider>
      <Header
        role={userRole}
        userName={userName}
        userEmail={userEmail}
      />
      {/* Contenu principal */}
    </UIConfigProvider>
  );
}
```

### 3. Ajouter le bouton Scroll to Top

```tsx
import { Header, ScrollToTopButton } from '@molam/ui-header';

function App() {
  return (
    <UIConfigProvider>
      <Header role="owner" userName="Amadou" />

      <main>
        {/* Contenu */}
      </main>

      <ScrollToTopButton />
    </UIConfigProvider>
  );
}
```

## 📢 Notifications

### Définir les notifications

```tsx
import { useState } from 'react';
import type { Notification } from '@molam/ui-header';

const [notifications, setNotifications] = useState<Notification[]>([
  {
    id: '1',
    title: 'Nouveau paiement',
    message: 'Paiement de 50 000 XOF reçu',
    type: 'success',
    timestamp: new Date().toISOString(),
    read: false,
    link: '/transactions/1234'
  }
]);
```

### Gérer les notifications

```tsx
const handleMarkAsRead = (id: string) => {
  setNotifications(prev =>
    prev.map(n => n.id === id ? { ...n, read: true } : n)
  );
};

const handleMarkAllAsRead = () => {
  setNotifications(prev =>
    prev.map(n => ({ ...n, read: true }))
  );
};

<Header
  role={userRole}
  notifications={notifications}
  onMarkAsRead={handleMarkAsRead}
  onMarkAllAsRead={handleMarkAllAsRead}
/>
```

## ⚙️ Configuration UI Personnalisée

```tsx
const customConfig = {
  theme: {
    primaryColor: '#3B82F6',
    headerHeight: 64,
    borderRadius: 12
  },
  features: {
    showNotifications: true,
    showSettings: true
  },
  notifications: {
    maxDisplayed: 5,
    soundEnabled: false
  },
  accessibility: {
    reducedMotion: false,
    highContrast: false,
    focusVisible: true
  }
};

<UIConfigProvider config={customConfig}>
  <App />
</UIConfigProvider>
```

## 🔐 RBAC - Rôles et Permissions

### Rôles disponibles

```typescript
type UserRole = 'owner' | 'ops' | 'finance' | 'merchant' | 'customer';
```

### Permissions par rôle

| Feature | Owner | Ops | Finance | Merchant | Customer |
|---------|-------|-----|---------|----------|----------|
| notifications | ✅ | ✅ | ❌ | ❌ | ❌ |
| settings | ✅ | ✅ | ✅ | ✅ | ❌ |
| profile | ✅ | ❌ | ❌ | ✅ | ❌ |
| security | ✅ | ✅ | ❌ | ❌ | ❌ |
| payments | ✅ | ❌ | ✅ | ✅ | ❌ |
| payouts | ✅ | ✅ | ✅ | ❌ | ❌ |
| rbac | ✅ | ❌ | ❌ | ❌ | ❌ |
| webhooks | ✅ | ✅ | ❌ | ❌ | ❌ |
| experiments | ✅ | ✅ | ❌ | ❌ | ❌ |

### Utiliser le hook useRBAC

```tsx
import { useRBAC } from '@molam/ui-header';

function MyComponent() {
  const userRole = 'ops';
  const canViewPayments = useRBAC(userRole, 'payments');

  if (!canViewPayments) {
    return null; // Ou rediriger
  }

  return <div>Liste des paiements</div>;
}
```

## 🎨 Menu Paramètres Configurable

Le menu Paramètres est **configurable via JSON** sans coder!

### Modifier `settingsMenu.json`

```json
{
  "general": [
    {
      "id": "profile",
      "label": "Profil utilisateur",
      "labelEn": "User Profile",
      "icon": "User",
      "roles": ["owner", "merchant"],
      "path": "/settings/profile",
      "description": "Gérer votre profil"
    }
  ],
  "finance": [
    {
      "id": "payments",
      "label": "Méthodes de paiement",
      "labelEn": "Payment Methods",
      "icon": "CreditCard",
      "roles": ["owner", "finance", "merchant"],
      "path": "/settings/payments"
    }
  ]
}
```

### Ajouter un nouvel outil

1. Ouvrir `src/config/settingsMenu.json`
2. Ajouter une nouvelle entrée:

```json
{
  "ops": [
    {
      "id": "monitoring",
      "label": "Surveillance",
      "labelEn": "Monitoring",
      "icon": "Activity",
      "roles": ["owner", "ops"],
      "path": "/settings/monitoring",
      "description": "Métriques et alertes"
    }
  ]
}
```

3. Sauvegarder et redémarrer l'app
4. **Aucun code à modifier!** 🎉

## 📱 Navigation

### Option 1: Router custom

```tsx
import { useRouter } from 'next/router'; // ou react-router

function App() {
  const router = useRouter();

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  return (
    <Header
      role="owner"
      onNavigate={handleNavigate}
    />
  );
}
```

### Option 2: Navigation par défaut (window.location)

Si vous ne fournissez pas `onNavigate`, le composant utilise `window.location.href`.

## 🎯 Props du Header

```typescript
interface HeaderProps {
  role: UserRole;                       // REQUIS: Rôle de l'utilisateur
  userName?: string;                    // Nom affiché
  userEmail?: string;                   // Email affiché
  notifications?: Notification[];       // Liste des notifications
  onMarkAsRead?: (id: string) => void;  // Callback marquer comme lu
  onMarkAllAsRead?: () => void;         // Callback tout marquer comme lu
  onNavigate?: (path: string) => void;  // Callback navigation custom
  onMobileMenuToggle?: () => void;      // Callback menu mobile
  className?: string;                   // Classes CSS custom
}
```

## 🎯 Props du ScrollToTopButton

```typescript
interface ScrollToTopButtonProps {
  className?: string;        // Classes CSS custom
  showAfterScroll?: number;  // Pixels de scroll avant affichage (défaut: 200)
}
```

## 🧪 Testing

```tsx
import { render, screen } from '@testing-library/react';
import { Header, UIConfigProvider } from '@molam/ui-header';

test('Header affiche le nom utilisateur', () => {
  render(
    <UIConfigProvider>
      <Header role="owner" userName="Amadou Diallo" />
    </UIConfigProvider>
  );

  expect(screen.getByText('Amadou Diallo')).toBeInTheDocument();
});

test('Notifications non visibles pour customer', () => {
  render(
    <UIConfigProvider>
      <Header role="customer" />
    </UIConfigProvider>
  );

  expect(screen.queryByLabelText(/Notifications/i)).not.toBeInTheDocument();
});
```

## 🎨 Styling Custom

### Option 1: Via className

```tsx
<Header
  role="owner"
  className="shadow-xl border-b-2"
/>
```

### Option 2: Via config

```tsx
const config = {
  theme: {
    primaryColor: '#10B981', // Vert
    headerHeight: 72
  }
};

<UIConfigProvider config={config}>
  <Header role="owner" />
</UIConfigProvider>
```

### Option 3: Tailwind custom

Le composant utilise Tailwind CSS. Vous pouvez surcharger:

```css
/* Dans votre global.css */
.header-custom {
  background: linear-gradient(to right, #3B82F6, #10B981);
}
```

```tsx
<Header role="owner" className="header-custom" />
```

## 🌍 Multi-langues

Les langues supportées sont définies dans `uiConfig.json`:

```json
{
  "languages": ["fr", "en", "wolof", "ar"]
}
```

Pour changer la langue:

```tsx
const [locale, setLocale] = useState('fr');

// Utiliser un contexte i18n ou votre système de traduction
```

## 💡 Best Practices

### ✅ À FAIRE

- Toujours wrapper avec `UIConfigProvider`
- Utiliser le hook `useRBAC` pour les vérifications de permissions
- Modifier `settingsMenu.json` pour ajouter des outils (pas le code)
- Fournir `onNavigate` pour une navigation fluide
- Tester avec différents rôles

### ❌ À ÉVITER

- Ne pas modifier directement les composants
- Ne pas bypasser le RBAC
- Ne pas hardcoder les menus dans le code
- Ne pas oublier le `UIConfigProvider`

## 🔧 Troubleshooting

### Les notifications ne s'affichent pas

**Solution**: Vérifier que:
1. `showNotifications: true` dans la config
2. Le rôle a accès aux notifications (owner, ops)
3. Le tableau `notifications` est fourni

### Le menu Paramètres est vide

**Solution**: Vérifier que:
1. Le rôle a des permissions dans `settingsMenu.json`
2. Les rôles dans le JSON correspondent aux rôles TypeScript
3. `showSettings: true` dans la config

### Les icônes ne s'affichent pas

**Solution**: Vérifier que `lucide-react` est installé:
```bash
npm install lucide-react
```

## 📚 Ressources

- [Documentation README](./README.md)
- [Exemple complet](./example/App.tsx)
- [Configuration UI](./src/config/uiConfig.json)
- [Configuration Menu](./src/config/settingsMenu.json)

## 🆘 Support

Pour toute question ou bug:
- **Email**: engineering@molam.io
- **Slack**: #molam-ui-components
- **Issues**: GitHub Issues

---

**Molam Platform Engineering** - Version 1.0.0
