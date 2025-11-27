# Intégration Molam ID + Molam Connect

Ce document explique comment faire fonctionner Molam ID et Molam Connect ensemble.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Molam ID      │         │ Molam Connect    │         │   Frontend      │
│   (Port 3000)   │◄────────│   (Port 8042)    │◄────────│  (Port 3044)    │
│                 │  JWT    │                  │  HTTP   │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

## Services et Ports

| Service | Port | URL |
|---------|------|-----|
| **Molam ID** | 3000 | http://localhost:3000 |
| **Molam Connect API** | 8042 | http://localhost:8042 |
| **Molam Connect Web** | 3044 | http://localhost:3044 |

## Configuration

### 1. Molam ID (.env)
```env
JWT_SECRET=votre_secret_jwt_super_securise
PORT=3000
```

### 2. Molam Connect (.env)
```env
PORT=8042
MOLAM_ID_JWT_SECRET=votre_secret_jwt_super_securise  # Doit être identique à Molam ID
MOLAM_ID_URL=http://localhost:3000
SKIP_JWT_VERIFICATION=true  # Pour le développement sans authentification
```

## Démarrage

### Démarrer les deux services

```bash
# Terminal 1 - Molam ID
cd c:\Users\lomao\Desktop\Molam\Molam-id
npm run dev

# Terminal 2 - Molam Connect API
cd c:\Users\lomao\Desktop\Molam\molam-connect\brique-42
npm run dev

# Terminal 3 - Molam Connect Web (Optionnel)
cd c:\Users\lomao\Desktop\Molam\molam-connect\brique-42\web
npm run dev
```

## Authentification

### Mode Développement (Sans Auth)
Pour tester sans authentification, gardez dans `.env` :
```env
SKIP_JWT_VERIFICATION=true
```

### Mode Production (Avec Auth JWT)
1. Désactiver le skip :
   ```env
   SKIP_JWT_VERIFICATION=false
   ```

2. Se connecter à Molam ID pour obtenir un JWT :
   ```bash
   curl -X POST http://localhost:3000/api/login \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"password"}'
   ```

3. Utiliser le token reçu dans les requêtes à Molam Connect :
   ```bash
   curl http://localhost:8042/api/connect/webhooks?connect_account_id=ca_test123 \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

## Test de l'intégration

### 1. Vérifier que Molam ID fonctionne
```bash
curl http://localhost:3000/
```

### 2. Vérifier que Molam Connect fonctionne
```bash
curl http://localhost:8042/
```

### 3. Tester l'API Webhooks
```bash
curl http://localhost:8042/api/connect/webhooks?connect_account_id=ca_test123
```

### 4. Ouvrir le frontend
Naviguer vers : http://localhost:3044/

## Flux d'authentification complet

```
1. User ──login──> Molam ID
2. Molam ID ──JWT──> User
3. User ──JWT──> Molam Connect
4. Molam Connect ──verify JWT with shared secret──> Valid
5. Molam Connect ──response──> User
```

## Problèmes courants

### Erreur "invalid_token"
- Vérifiez que `MOLAM_ID_JWT_SECRET` est identique dans les deux services
- Vérifiez que le token JWT n'est pas expiré (durée: 15min)

### Erreur "Connection refused"
- Vérifiez que Molam ID tourne sur le port 3000
- Vérifiez que Molam Connect tourne sur le port 8042

### Erreur CORS
- Vérifiez `CORS_ORIGIN` dans `.env` de Molam Connect
- Assurez-vous que l'origine du frontend est dans la liste

## Prochaines étapes

1. ✅ Configuration de base effectuée
2. ⏳ Créer une table `connect_accounts` dans la base de données
3. ⏳ Lier les utilisateurs Molam ID aux comptes Connect
4. ⏳ Implémenter la création automatique de compte Connect au login
5. ⏳ Ajouter le SSO entre les interfaces

## Support

Pour toute question ou problème :
- Vérifier les logs des serveurs
- Consulter la documentation de chaque brique
- Tester les endpoints individuellement