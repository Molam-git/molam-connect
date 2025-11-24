# Molam Platform - Application Unifiée

Application React principale qui intègre toutes les briques Molam Connect.

## 🏗️ Structure

```
molam-platform/
├── public/
│   └── index.html
├── src/
│   ├── App.tsx                    # Application principale + Router
│   ├── App.css
│   ├── index.tsx                  # Entry point
│   ├── index.css
│   │
│   ├── components/                # Composants partagés
│   │   ├── Layout.tsx             # Layout principal
│   │   ├── Header.tsx             # Header unifié
│   │   └── Sidebar.tsx            # Navigation sidebar
│   │
│   ├── contexts/                  # React Context
│   │   └── AuthContext.tsx        # Authentification JWT
│   │
│   ├── pages/                     # Pages principales
│   │   ├── Landing.tsx            # Page d'accueil
│   │   └── LoginPage.tsx          # Page de connexion
│   │
│   ├── modules/                   # Modules des briques (à ajouter)
│   │   ├── wallet/                # Brique 149a
│   │   ├── dashboard/             # Brique 149b
│   │   ├── analytics/             # Brique 145
│   │   └── experiments/           # Brique 147
│   │
│   └── services/                  # API clients (à ajouter)
│       ├── api.ts
│       └── auth.ts
│
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── README.md
```

## 🚀 Démarrage Rapide

### Installation

```bash
cd molam-platform
npm install
```

### Développement

```bash
npm start
```

L'application démarre sur [http://localhost:3001](http://localhost:3001)

**Note** : Le port 3000 est réservé pour le serveur gateway principal (`server.js` à la racine)

### Build Production

```bash
npm run build
```

## 🔐 Authentification

L'app utilise **Molam ID JWT** pour l'authentification.

### Demo Logins (Development)

Sur la page de login, utilise les boutons "Demo Login" :
- **Customer** → Redirige vers `/wallet`
- **Merchant** → Redirige vers `/dashboard`
- **Admin** → Reste sur landing page avec accès à tout

### JWT Token Structure

```json
{
  "sub": "user-id",
  "name": "User Name",
  "email": "user@example.com",
  "role": "customer|merchant|admin",
  "merchant_id": "merchant-id",
  "country": "SN",
  "currency": "XOF",
  "lang": "fr",
  "exp": 1234567890
}
```

## 📱 Routes

```
/                   → Landing page (redirige selon rôle)
/login              → Page de connexion

/wallet/*           → Molam Ma (Customer)
/dashboard/*        → Molam Connect (Merchant)
/analytics/*        → Analytics
/experiments/*      → A/B Experiments
/admin/*            → Admin Panel
```

## 🔗 Prochaines Étapes

### Étape 2 : Intégration des Modules

1. **Créer les dossiers modules** :
   ```bash
   mkdir -p src/modules/wallet
   mkdir -p src/modules/dashboard
   mkdir -p src/modules/analytics
   ```

2. **Importer les composants des briques** :
   - Copier les pages depuis `brique-149a-wallet/web/src/pages/`
   - Copier les pages depuis `brique-149b-connect/web/src/pages/`
   - Adapter les imports et routing

3. **Créer les API clients** :
   ```typescript
   // src/services/walletApi.ts
   export const walletApi = {
     getHome: () => fetch('/api/wallet/home'),
     generateQr: () => fetch('/api/wallet/qr/generate'),
     // ...
   };
   ```

### Étape 3 : Configuration Proxy API

Créer `src/setupProxy.js` pour rediriger les appels API :

```javascript
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use('/api/wallet', createProxyMiddleware({
    target: 'http://localhost:8080',
    changeOrigin: true
  }));

  app.use('/api/dashboard', createProxyMiddleware({
    target: 'http://localhost:8081',
    changeOrigin: true
  }));
};
```

### Étape 4 : Lancer les Backends

```bash
# Terminal 1 : Wallet API
cd brique-149a-wallet/server
npm run dev

# Terminal 2 : Connect API
cd brique-149b-connect/server
npm run dev

# Terminal 3 : Frontend
cd molam-platform
npm start
```

## 🎨 Design System

### Couleurs

```css
Primary: #3B82F6 (Blue)
Success: #10B981 (Green)
Warning: #F59E0B (Orange)
Danger: #EF4444 (Red)
```

### Typographie

- **Headings** : Font weight 700
- **Body** : Font weight 400
- **Labels** : Font weight 500

## 📦 Dépendances

```json
{
  "react": "^18.2.0",
  "react-router-dom": "^6.21.1",
  "axios": "^1.6.5",
  "tailwindcss": "^3.4.0",
  "jwt-decode": "^4.0.0"
}
```

## 🤝 Contribution

1. Crée une feature branch
2. Commit tes changements
3. Push et crée une Pull Request

## 📝 License

Proprietary - Molam Platform

---

**Status** : ✅ Étape 1 Complète - Structure de base créée

**Prochaine étape** : Intégration des modules Wallet et Dashboard
