# Guide de démarrage Docker - MOLAM CONNECT

Ce guide explique comment builder et exécuter MOLAM CONNECT dans des conteneurs Docker.

## Prérequis

- Docker installé ([Docker Desktop](https://www.docker.com/products/docker-desktop/) pour Windows/Mac)
- Docker Compose (inclus avec Docker Desktop)

## Démarrage rapide

### Windows

Double-cliquez sur le fichier :
```
run-molam-docker.bat
```

Ou en ligne de commande :
```bash
cd molam-connect
.\run-molam-docker.bat
```

### Linux/Mac

Rendez le script exécutable et lancez-le :
```bash
cd molam-connect
chmod +x run-molam-docker.sh
./run-molam-docker.sh
```

## Ce qui est démarré

Le script `run-molam-docker` démarre automatiquement **3 services** :

1. **PostgreSQL** (Base de données)
   - Port : `5434` (externe) → `5432` (interne)
   - User : `postgres`
   - Password : `postgres`
   - Database : `molam_connect`
   - Note: Port 5434 utilisé pour éviter conflit avec PostgreSQL local

2. **Redis** (Cache & Rate Limiting)
   - Port : `6379`
   - Persistence : AOF (Append-Only File)

3. **Backend API** (Node.js/Express)
   - Port API : `3000`
   - Port Dashboard : `3001`
   - Port Metrics : `9090` (Prometheus)

## Commandes Docker manuelles

### 1. Build de l'image

```bash
cd molam-connect
docker-compose -f docker-compose.full.yml build
```

### 2. Démarrer tous les services

```bash
docker-compose -f docker-compose.full.yml up -d
```

L'option `-d` permet de lancer les conteneurs en arrière-plan (detached mode).

### 3. Voir les logs

Tous les services :
```bash
docker-compose -f docker-compose.full.yml logs -f
```

Un service spécifique :
```bash
docker-compose -f docker-compose.full.yml logs -f api
docker-compose -f docker-compose.full.yml logs -f db
docker-compose -f docker-compose.full.yml logs -f redis
```

### 4. Arrêter les services

```bash
docker-compose -f docker-compose.full.yml down
```

### 5. Arrêter et supprimer les volumes (réinitialisation complète)

```bash
docker-compose -f docker-compose.full.yml down -v
```

⚠️ **Attention** : Cette commande supprime la base de données et le cache Redis !

### 6. Rebuild après modification du code

Si vous modifiez le code, vous devez rebuilder l'image :

```bash
docker-compose -f docker-compose.full.yml down
docker-compose -f docker-compose.full.yml build
docker-compose -f docker-compose.full.yml up -d
```

Ou en une seule commande :
```bash
docker-compose -f docker-compose.full.yml up -d --build
```

## Vérifier que tout fonctionne

### 1. Vérifier les conteneurs actifs

```bash
docker ps
```

Vous devriez voir 3 conteneurs :
- `molam_connect_db` (postgres:15)
- `molam_connect_redis` (redis:7-alpine)
- `molam_connect_api` (molam-connect)

### 2. Tester l'API

Health check :
```bash
curl http://localhost:3000/health
```

Créer un paiement de test :
```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_your_secret_key_here" \
  -d '{
    "amount": 5000,
    "currency": "XOF",
    "payment_method": {
      "type": "card",
      "card": {
        "number": "4242424242424242",
        "exp_month": 12,
        "exp_year": 2025,
        "cvc": "123"
      }
    }
  }'
```

### 3. Accéder au Dashboard

Ouvrez votre navigateur : http://localhost:3001/dashboard

### 4. Vérifier les métriques (Prometheus)

http://localhost:9090/metrics

## Variables d'environnement

Pour personnaliser la configuration, créez un fichier `.env` dans `molam-connect/` :

```env
JWT_SECRET=votre_secret_personnalise
MOLAM_SECRET_KEY=sk_live_votre_cle_secrete
MOLAM_PUBLISHABLE_KEY=pk_live_votre_cle_publique
ENCRYPTION_KEY=votre_cle_de_chiffrement_32_caracteres
```

Puis redémarrez les services :
```bash
docker-compose -f docker-compose.full.yml down
docker-compose -f docker-compose.full.yml up -d
```

## Configuration externe (SMS/Twilio)

Pour activer l'envoi de SMS réels :

```env
MOCK_SMS=false
TWILIO_ACCOUNT_SID=votre_account_sid
TWILIO_AUTH_TOKEN=votre_auth_token
TWILIO_FROM_NUMBER=+1234567890
```

## Dépannage

### Port déjà utilisé

Si vous avez l'erreur "port already allocated" :

1. Arrêtez les processus qui utilisent les ports 3000, 3001, 5434, 6379 ou 9090
2. Ou modifiez les ports dans `docker-compose.full.yml`

### Problème de build

Si le build échoue :

1. Nettoyez Docker :
```bash
docker system prune -a
```

2. Retentez le build :
```bash
docker-compose -f docker-compose.full.yml build --no-cache
```

### La base de données ne démarre pas

Vérifiez les logs :
```bash
docker-compose -f docker-compose.full.yml logs db
```

### Redis ne fonctionne pas

Vérifiez les logs :
```bash
docker-compose -f docker-compose.full.yml logs redis
```

Testez la connexion :
```bash
docker exec -it molam_connect_redis redis-cli ping
# Devrait retourner: PONG
```

### Accéder à la base de données

Depuis votre machine :
```bash
psql -h localhost -p 5434 -U postgres -d molam_connect
# Password: postgres
```

Ou avec Docker :
```bash
docker exec -it molam_connect_db psql -U postgres -d molam_connect
```

### Accéder à Redis CLI

```bash
docker exec -it molam_connect_redis redis-cli
```

Commandes utiles dans Redis CLI :
```redis
PING                  # Test connexion
KEYS *                # Lister toutes les clés
GET key_name          # Obtenir une valeur
FLUSHALL              # Vider le cache (⚠️ attention)
INFO                  # Informations sur Redis
```

## Différences avec start.bat

| Aspect | start.bat | Docker |
|--------|-----------|--------|
| Installation Node.js | Requise | Non requise |
| Installation PostgreSQL | Installation externe | Conteneur PostgreSQL |
| Installation Redis | Installation externe | Conteneur Redis |
| Isolation | Non | Oui (conteneurs isolés) |
| Portabilité | Windows uniquement | Multi-plateforme |
| Production-ready | Non | Oui |
| Setup database | Manuel (npm run db:setup) | Automatique |

## Monitoring et Métriques

### Prometheus Metrics

Les métriques sont exposées sur : http://localhost:9090/metrics

Métriques disponibles :
- `http_requests_total` - Nombre total de requêtes HTTP
- `http_request_duration_seconds` - Durée des requêtes
- `payment_transactions_total` - Nombre de transactions
- `otp_sent_total` - Nombre d'OTP envoyés
- `redis_operations_total` - Opérations Redis

### Logs structurés

Les logs sont disponibles via Docker :
```bash
docker-compose -f docker-compose.full.yml logs -f api
```

Format JSON pour parsing facile avec ELK, Loki, etc.

## Initialisation de la base de données

Les fichiers SQL dans le dossier `database/` sont automatiquement exécutés au premier démarrage de PostgreSQL :

```
database/
  ├── setup.sql           # Schéma principal
  ├── 01_*.sql           # Migrations
  └── 99_seed.sql        # Données de test (optionnel)
```

Pour réinitialiser la base de données :
```bash
docker-compose -f docker-compose.full.yml down -v
docker-compose -f docker-compose.full.yml up -d
```

## Production

Pour déployer en production :

1. **Changez les secrets** dans le `.env` :
```env
NODE_ENV=production
JWT_SECRET=utilisez_un_secret_fort_aleatoire
MOLAM_SECRET_KEY=sk_live_votre_vraie_cle
ENCRYPTION_KEY=utilisez_32_caracteres_aleatoires
```

2. **Désactivez les mocks** :
```env
MOCK_SIRA=false
MOCK_BIN_LOOKUP=false
MOCK_SMS=false
TEST_MODE=false
```

3. **Configurez les services externes** :
```env
SIRA_API_URL=https://api.sira.molam.io
BIN_LOOKUP_API_URL=https://binlookup.molam.io
TWILIO_ACCOUNT_SID=votre_account_sid_reel
TWILIO_AUTH_TOKEN=votre_auth_token_reel
```

4. **Activez HTTPS** avec un reverse proxy (Nginx/Traefik)

5. **Configurez les backups** pour PostgreSQL et Redis

## Arrêt complet

Pour tout arrêter et nettoyer :

```bash
docker-compose -f docker-compose.full.yml down -v
docker system prune -f
```

## Support

Pour plus d'informations :
- Docker : https://docs.docker.com/
- Docker Compose : https://docs.docker.com/compose/
- PostgreSQL : https://www.postgresql.org/docs/
- Redis : https://redis.io/documentation
