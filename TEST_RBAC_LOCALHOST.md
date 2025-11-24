# 🧪 Guide de Test RBAC sur Localhost

## Préparation (Une seule fois)

### 1. Installer le schéma SQL RBAC

```powershell
# Ouvrir PowerShell et exécuter :
psql -U postgres -d molam_connect -f brique-68/migrations/068_rbac.sql
```

**Résultat attendu** : Messages de création de tables, aucune erreur

### 2. Vérifier que le build est à jour

```powershell
cd brique-68
npm install
npm run build
cd ..
```

**Résultat attendu** : Dossier `brique-68/dist/` créé avec fichiers `.js`

---

## Test 1 : Démarrer le serveur

### Ouvrir un terminal PowerShell

```powershell
npm start
```

**Résultat attendu** : Vous devriez voir dans les logs :

```
✅ Database connected
✅ Redis connected
✅ RBAC (Brique 68) initialized
🚀 Server listening on port 3000
```

**Laissez ce terminal ouvert** et ouvrez un **nouveau terminal PowerShell** pour les tests suivants.

---

## Test 2 : Health Check

### Dans le nouveau terminal :

```powershell
# PowerShell
Invoke-RestMethod -Uri "http://localhost:3000/health"
```

**OU avec curl (si installé)** :

```bash
curl http://localhost:3000/health
```

**Résultat attendu** :
```json
{
  "status": "healthy",
  "timestamp": "2025-11-21T...",
  "uptime": 12.345,
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

---

## Test 3 : Lister les Permissions

```powershell
# PowerShell
$headers = @{
    "x-user-id" = "admin-123"
    "x-user-email" = "admin@molam.com"
}

Invoke-RestMethod -Uri "http://localhost:3000/api/rbac/permissions" -Headers $headers
```

**OU avec curl** :

```bash
curl http://localhost:3000/api/rbac/permissions \
  -H "x-user-id: admin-123" \
  -H "x-user-email: admin@molam.com"
```

**Résultat attendu** :
```json
[
  {
    "id": "uuid-...",
    "code": "connect:payments:read",
    "name": "Read Payments",
    "description": "View payment transactions",
    "resource_kind": "payment",
    "actions": ["read"]
  },
  {
    "id": "uuid-...",
    "code": "connect:payments:create",
    "name": "Create Payments",
    ...
  },
  ...
]
```

Vous devriez voir **environ 20 permissions**.

---

## Test 4 : Lister les Templates de Rôles

```powershell
# PowerShell
Invoke-RestMethod -Uri "http://localhost:3000/api/rbac/templates" -Headers $headers
```

**OU avec curl** :

```bash
curl http://localhost:3000/api/rbac/templates \
  -H "x-user-id: admin-123" \
  -H "x-user-email: admin@molam.com"
```

**Résultat attendu** :
```json
{
  "templates": [
    {
      "id": "uuid-...",
      "name": "connect_owner",
      "description": "Organisation Owner",
      "sensitive": true,
      "permissions_details": [...]
    },
    {
      "name": "connect_finance",
      "description": "Finance Manager",
      "sensitive": true,
      ...
    },
    ...
  ]
}
```

Vous devriez voir **9 rôles prédéfinis** :
- connect_owner
- connect_finance
- connect_ops
- connect_developer
- connect_marketing
- connect_support
- connect_auditor
- connect_billing
- connect_compliance

---

## Test 5 : Créer un Rôle pour une Organisation

D'abord, obtenons l'ID d'un template et d'une organisation :

```powershell
# Obtenir un template ID (connect_ops par exemple)
$templates = Invoke-RestMethod -Uri "http://localhost:3000/api/rbac/templates" -Headers $headers
$templateId = ($templates.templates | Where-Object { $_.name -eq "connect_ops" }).id
Write-Host "Template ID: $templateId"

# Créer un rôle basé sur ce template
$body = @{
    template_id = $templateId
    organisation_id = "00000000-0000-0000-0000-000000000001"  # ID de Molam Platform (seed data)
    name = "Operations Team - Molam Platform"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/rbac/roles" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $body
```

**OU avec curl** :

```bash
# Obtenir template ID
curl http://localhost:3000/api/rbac/templates \
  -H "x-user-id: admin-123" | jq '.templates[] | select(.name=="connect_ops") | .id'

# Créer le rôle (remplacer <TEMPLATE_ID> par l'ID obtenu)
curl -X POST http://localhost:3000/api/rbac/roles \
  -H "Content-Type: application/json" \
  -H "x-user-id: admin-123" \
  -d '{
    "template_id": "<TEMPLATE_ID>",
    "organisation_id": "00000000-0000-0000-0000-000000000001",
    "name": "Operations Team - Molam Platform"
  }'
```

**Résultat attendu** :
```json
{
  "role": {
    "id": "uuid-...",
    "template_id": "...",
    "organisation_id": "...",
    "name": "Operations Team - Molam Platform",
    "created_at": "2025-11-21T..."
  }
}
```

---

## Test 6 : Assigner un Rôle à un Utilisateur

```powershell
# Utiliser le role_id obtenu précédemment
$roleId = "ROLE_ID_ICI"  # Remplacer par l'ID du rôle créé

$assignBody = @{
    target_user_id = "user-demo-456"
    reason = "Test assignment for demonstration"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/rbac/roles/$roleId/assign" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $assignBody
```

**Résultat attendu (rôle non-sensible)** :
```json
{
  "status": "assigned",
  "message": "Role assigned successfully"
}
```

**OU (rôle sensible - connect_owner, connect_finance)** :
```json
{
  "status": "approval_required",
  "message": "Role assignment request created, pending approval",
  "request": {
    "id": "uuid-...",
    "status": "pending",
    "required_approvals": 2
  }
}
```

---

## Test 7 : Vérifier les Permissions d'un Utilisateur

```powershell
# PowerShell - Vérifier via la base de données directement
psql -U postgres -d molam_connect -c "SELECT user_has_permission('user-demo-456', 'connect:payments:read');"
```

**OU vérifier tous les rôles** :

```bash
curl "http://localhost:3000/api/rbac/users/user-demo-456/roles" \
  -H "x-user-id: admin-123"
```

---

## Test 8 : Tester la Protection d'Endpoint

Créez un fichier de test `test-protected-endpoint.js` :

```javascript
// test-protected-endpoint.js
const express = require('express');
const { requirePermission } = require('./src/middleware/rbac');

const app = express();
app.use(express.json());

// Mock auth middleware
app.use((req, res, next) => {
  req.user = {
    id: req.headers['x-user-id'] || 'anonymous',
    email: req.headers['x-user-email'] || 'anonymous@example.com'
  };
  next();
});

// Endpoint protégé
app.get('/api/test-protected',
  requirePermission('connect:payments:read'),
  (req, res) => {
    res.json({
      message: '✅ Access granted! You have the permission.',
      user: req.user
    });
  }
);

app.listen(4001, () => {
  console.log('🧪 Test server running on http://localhost:4001');
  console.log('\nTest commands:');
  console.log('  With permission:    curl http://localhost:4001/api/test-protected -H "x-user-id: user-demo-456"');
  console.log('  Without permission: curl http://localhost:4001/api/test-protected -H "x-user-id: unknown-user"');
});
```

Exécutez :

```powershell
node test-protected-endpoint.js
```

Puis dans un autre terminal :

```powershell
# Test AVEC permission (si user-demo-456 a le rôle avec connect:payments:read)
Invoke-RestMethod -Uri "http://localhost:4001/api/test-protected" `
    -Headers @{ "x-user-id" = "user-demo-456" }

# Test SANS permission
Invoke-RestMethod -Uri "http://localhost:4001/api/test-protected" `
    -Headers @{ "x-user-id" = "unknown-user" }
```

**Résultat attendu** :
- Avec permission : Status 200, message "Access granted"
- Sans permission : Status 403, message "Permission denied"

---

## Test 9 : Consulter les Logs d'Audit

```powershell
# Via SQL
psql -U postgres -d molam_connect -c "
  SELECT
    action,
    actor_id,
    created_at,
    target->>'user_id' as target_user
  FROM rbac_audit_logs
  ORDER BY created_at DESC
  LIMIT 10;
"
```

**Résultat attendu** :
```
       action        |  actor_id   |        created_at         | target_user
---------------------+-------------+---------------------------+-------------
 assign_role         | admin-123   | 2025-11-21 22:50:00+00   | user-demo-456
 create_role         | admin-123   | 2025-11-21 22:49:30+00   | null
 create_template     | admin-123   | 2025-11-21 22:48:00+00   | null
```

---

## Test 10 : Vérifier le Cache Redis

```powershell
# Se connecter à Redis
redis-cli

# Dans Redis CLI :
redis> KEYS rbac:*
redis> GET rbac:user_perms:user-demo-456
redis> TTL rbac:user_perms:user-demo-456
```

**Résultat attendu** :
- Vous devriez voir des clés comme `rbac:user_perms:user-demo-456`
- Le GET retourne un JSON des permissions
- Le TTL montre le temps restant avant expiration (30 secondes par défaut)

---

## 🎯 Tests Automatisés

Utilisez le script de test automatisé :

```powershell
.\test-rbac.ps1
```

Ce script exécute :
1. Installation du schéma SQL
2. Build TypeScript
3. Vérification des fichiers
4. Test de connexion DB
5. Test des endpoints API

---

## 📊 Vérification de la Base de Données

### Compter les ressources RBAC

```powershell
psql -U postgres -d molam_connect -c "
SELECT
  (SELECT COUNT(*) FROM organisations) as organisations,
  (SELECT COUNT(*) FROM permissions) as permissions,
  (SELECT COUNT(*) FROM role_templates) as role_templates,
  (SELECT COUNT(*) FROM roles) as roles,
  (SELECT COUNT(*) FROM role_bindings) as role_bindings,
  (SELECT COUNT(*) FROM grants) as grants,
  (SELECT COUNT(*) FROM role_requests) as role_requests,
  (SELECT COUNT(*) FROM rbac_audit_logs) as audit_logs;
"
```

**Résultat attendu** :
```
 organisations | permissions | role_templates | roles | role_bindings | grants | role_requests | audit_logs
---------------+-------------+----------------+-------+---------------+--------+---------------+------------
             2 |          20 |              9 |     1 |             1 |      0 |             0 |          2
```

---

## ❌ Troubleshooting

### Erreur : "Cannot find module 'brique-68/dist/...'"

**Solution** :
```powershell
cd brique-68
npm run build
cd ..
```

### Erreur : "relation 'permissions' does not exist"

**Solution** :
```powershell
psql -U postgres -d molam_connect -f brique-68/migrations/068_rbac.sql
```

### Erreur : "Redis connection failed"

**Solution** :
1. Vérifier que Redis est démarré : `redis-cli ping`
2. Si pas installé, télécharger depuis https://redis.io/download
3. Ou désactiver temporairement Redis dans le code

### Erreur 403 "Permission denied" même avec le bon rôle

**Solution** : Invalider le cache
```javascript
const { invalidateUserPermissions } = require('./src/middleware/rbac');
await invalidateUserPermissions('user-id');
```

---

## 🎉 Résultat Attendu Final

Si tous les tests passent, vous devriez avoir :

✅ Serveur démarré sans erreurs
✅ 20+ permissions dans la DB
✅ 9 rôles templates dans la DB
✅ Au moins 1 rôle créé
✅ Au moins 1 assignment de rôle
✅ Cache Redis fonctionnel
✅ Endpoints RBAC opérationnels
✅ Protection d'endpoint fonctionnelle
✅ Audit logs enregistrés

---

**Prêt pour la production !** 🚀
