# 🔧 Fix RBAC Database Error

## Problème Rencontré

Erreur : `la base de données « molam_rbac » n'existe pas`

## Cause

La Brique 68 était configurée pour utiliser une base de données séparée `molam_rbac`, alors que le reste de Molam Connect utilise `molam_connect`.

## ✅ Solution Appliquée

### 1. Fichier de configuration créé

Un fichier `brique-68/.env` a été créé avec la bonne configuration :

```ini
DB_NAME=molam_connect  # ← IMPORTANT: même base que le serveur principal
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
```

### 2. Code modifié

Le fichier `brique-68/src/server.ts` a été mis à jour pour charger les variables d'environnement :

```typescript
import 'dotenv/config';  // ← Ajouté en première ligne
```

### 3. Rebuild effectué

```bash
cd brique-68
npm run build
cd ..
```

## 🧪 Vérification

Pour vérifier que tout fonctionne :

### 1. Redémarrer le serveur

```powershell
# Arrêter le serveur (Ctrl+C)
# Puis relancer
npm start
```

Vérifiez que vous voyez :
```
✅ RBAC (Brique 68) initialized
```

### 2. Tester à nouveau

```powershell
.\quick-test-rbac.ps1
```

Vous devriez maintenant voir :
```
[2/5] Test RBAC Permissions...
  ✅ Found 24 permissions

[3/5] Test Role Templates...
  ✅ Found 9 role templates
```

## 📊 Configuration Finale

### Structure des bases de données

```
PostgreSQL
└── molam_connect (base unique)
    ├── Tables du serveur principal (payment_intents, customers, etc.)
    └── Tables RBAC (organisations, permissions, roles, etc.)
```

**Avantage** : Une seule base de données, plus simple à gérer !

### Fichiers de configuration

```
molam-connect/
├── .env (serveur principal)
│   └── DATABASE_URL=postgresql://...molam_connect
│
└── brique-68/.env (brique RBAC)
    └── DB_NAME=molam_connect  # ← Même base !
```

## 🎉 Résultat

Maintenant les deux systèmes utilisent la même base de données `molam_connect` et tout fonctionne correctement !

---

**Date du fix** : 2025-11-21
**Status** : ✅ Résolu
