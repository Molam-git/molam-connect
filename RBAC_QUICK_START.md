# 🚀 RBAC Quick Start Guide - Molam Connect

## ✅ Implémentation Complète

La **Brique 68 (RBAC)** est maintenant intégrée dans Molam Connect !

---

## 📁 Fichiers Créés

### Code Principal
- ✅ [src/middleware/rbac.js](src/middleware/rbac.js) - Middleware RBAC réutilisable
- ✅ [src/services/rbacService.js](src/services/rbacService.js) - Service RBAC complet
- ✅ [brique-68/dist/](brique-68/dist/) - Code TypeScript compilé

### Documentation
- ✅ [RBAC_INTEGRATION.md](RBAC_INTEGRATION.md) - Guide d'intégration complet
- ✅ [brique-68/README.md](brique-68/README.md) - Documentation technique RBAC
- ✅ [examples/rbac-usage-example.js](examples/rbac-usage-example.js) - Exemples d'utilisation

### Tests
- ✅ [test-rbac.ps1](test-rbac.ps1) - Script de test automatisé

---

## 🎯 Démarrage en 3 Étapes

### Étape 1 : Installer le schéma SQL

```bash
# Option A: Utiliser setup-all-schemas.ps1 (Windows)
.\setup-all-schemas.ps1

# Option B: Installation manuelle
psql -U postgres -d molam_connect -f brique-68/migrations/068_rbac.sql
```

### Étape 2 : Configurer et construire la Brique 68

```bash
# Créer le fichier de configuration (si pas déjà fait)
cd brique-68

# Copier .env.example vers .env
cp .env.example .env

# IMPORTANT: Modifier DB_NAME dans .env pour utiliser molam_connect
# (Le fichier devrait avoir DB_NAME=molam_connect au lieu de molam_rbac)

# Installer et builder
npm install
npm run build
cd ..
```

Vous devriez voir le dossier `brique-68/dist/` avec les fichiers compilés.

**Note importante** : Vérifiez que `brique-68/.env` contient bien `DB_NAME=molam_connect` (la même base que le serveur principal).

### Étape 3 : Démarrer le serveur

```bash
npm start
```

Cherchez cette ligne dans les logs :
```
✅ RBAC (Brique 68) initialized
```

---

## 🧪 Test Rapide

### 1. Vérifier la santé du système

```bash
curl http://localhost:3000/health
```

### 2. Tester les endpoints RBAC

```bash
# Lister toutes les permissions
curl http://localhost:3000/api/rbac/permissions \
  -H "x-user-id: admin-123" \
  -H "x-user-email: admin@molam.com"

# Lister les templates de rôles
curl http://localhost:3000/api/rbac/templates \
  -H "x-user-id: admin-123"
```

### 3. Tester la protection d'endpoints

Ajoutez ceci dans `server.js` pour tester :

```javascript
const { requirePermission } = require('./src/middleware/rbac');

// Endpoint protégé par RBAC
app.get('/api/protected-endpoint',
  requirePermission('connect:payments:read'),
  (req, res) => {
    res.json({ message: 'Access granted!' });
  }
);
```

Puis testez :

```bash
# Sans permission - devrait échouer avec 403
curl http://localhost:3000/api/protected-endpoint \
  -H "x-user-id: user-without-permission"

# Avec permission - devrait réussir
curl http://localhost:3000/api/protected-endpoint \
  -H "x-user-id: user-with-permission"
```

---

## 📊 Vérifier que tout fonctionne

### Checklist

- [ ] La base de données contient les tables RBAC
- [ ] Le dossier `brique-68/dist/` existe et contient les fichiers JS compilés
- [ ] Le serveur démarre sans erreurs
- [ ] Les logs affichent "✅ RBAC (Brique 68) initialized"
- [ ] L'endpoint `/api/rbac/permissions` répond correctement
- [ ] L'endpoint `/api/rbac/templates` répond correctement

### Vérification SQL

```sql
-- Vérifier que les tables existent
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'organisations', 'permissions', 'role_templates',
    'roles', 'role_bindings', 'grants',
    'role_requests', 'rbac_audit_logs'
  );

-- Vérifier les permissions seed
SELECT COUNT(*) FROM permissions;  -- Devrait retourner ~20+

-- Vérifier les rôles prédéfinis
SELECT COUNT(*) FROM role_templates;  -- Devrait retourner ~9
```

---

## 💡 Utilisation de Base

### Dans vos routes Express

```javascript
const { requirePermission } = require('./src/middleware/rbac');

// Route protégée
app.get('/api/payments',
  requirePermission('connect:payments:read'),
  async (req, res) => {
    // Votre logique ici
  }
);
```

### Dans votre code métier

```javascript
const RBACService = require('./src/services/rbacService');
const rbacService = new RBACService(pool);

// Vérifier une permission
const canRefund = await rbacService.userHasPermission(
  userId,
  'connect:payments:refund'
);

if (canRefund) {
  // Logique de remboursement
}
```

---

## 📚 Documentation Complète

- **Guide d'intégration** : [RBAC_INTEGRATION.md](RBAC_INTEGRATION.md)
- **Documentation technique** : [brique-68/README.md](brique-68/README.md)
- **Exemples** : [examples/rbac-usage-example.js](examples/rbac-usage-example.js)

---

## 🐛 Troubleshooting

### Problème : "Module not found: brique-68/dist"

**Solution** :
```bash
cd brique-68
npm install
npm run build
```

### Problème : "Table 'permissions' does not exist"

**Solution** :
```bash
psql -U postgres -d molam_connect -f brique-68/migrations/068_rbac.sql
```

### Problème : "Permission denied"

**Solution** : Vérifier que l'utilisateur a bien les permissions assignées :

```javascript
const permissions = await rbacService.getUserPermissions(userId);
console.log(Array.from(permissions));
```

---

## 🎉 Félicitations !

Vous avez maintenant un système RBAC complet et production-ready intégré dans Molam Connect !

### Prochaines Étapes

1. **Créer vos propres rôles** via l'API `/api/rbac/templates`
2. **Assigner des rôles aux utilisateurs** via `/api/rbac/roles/:roleId/assign`
3. **Protéger vos endpoints** avec les middlewares RBAC
4. **Implémenter les composants React** pour la gestion visuelle (voir IMPLEMENTATION_TODO.md)

---

**Built with ❤️ by Molam Team**
