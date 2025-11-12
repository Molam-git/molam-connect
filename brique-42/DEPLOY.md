# Brique 42 - Guide de Déploiement Rapide

## ✅ Statut Actuel

```
✅ 192 packages installés (0 vulnerabilities)
✅ TypeScript compilé avec succès
✅ Tous les fichiers créés et fonctionnels
✅ 4 workers implémentés
✅ Observabilité complète (Pino + Prometheus)
✅ UI React Apple-like
✅ i18n EN/FR/SN
```

## 🚀 Démarrage Rapide (Local)

### 1. Configuration

```bash
cd brique-42
cp .env.example .env
# Éditer .env avec vos valeurs
```

### 2. Base de données

```bash
# Créer la database
createdb molam_connect_payments

# Lancer les migrations
npm run migrate
```

### 3. Redis (optionnel pour SSE)

```bash
# Installer Redis
# Windows: choco install redis
# macOS: brew install redis
# Linux: apt-get install redis

# Démarrer
redis-server
```

### 4. Démarrer l'API

```bash
# Mode développement (avec hot-reload)
npm run dev

# Mode production
npm run build
npm start
```

**API disponible sur:** `http://localhost:8042`

### 5. Workers

**En développement** (dans des terminaux séparés):

```bash
# Terminal 1 - Webhook delivery (cron: chaque minute)
npm run worker:webhook-delivery

# Terminal 2 - Payout eligibility (cron: chaque heure)
npm run worker:payout-eligibility

# Terminal 3 - Dispatcher (service continu)
npm run worker:dispatcher

# Terminal 4 - SSE Broker (service continu)
npm run worker:sse-broker
```

**En production** (avec systemd ou PM2):

```bash
# Avec PM2
pm2 start npm --name "b42-api" -- start
pm2 start npm --name "b42-dispatcher" -- run worker:dispatcher
pm2 start npm --name "b42-sse-broker" -- run worker:sse-broker

# Cron pour les workers périodiques
crontab -e
# Ajouter:
* * * * * cd /path/to/brique-42 && npm run worker:webhook-delivery
0 * * * * cd /path/to/brique-42 && npm run worker:payout-eligibility
```

## 🧪 Test de l'API

### Health Check

```bash
curl http://localhost:8042/healthz
# Devrait retourner: {"status":"ok"}
```

### Métriques Prometheus

```bash
curl http://localhost:8042/metrics
```

### Créer un Payment Intent

```bash
export TOKEN="your-jwt-token"
export ACCOUNT_ID="uuid-of-merchant-account"

curl -X POST http://localhost:8042/api/connect/intents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connect_account_id": "'$ACCOUNT_ID'",
    "amount": 1000.00,
    "currency": "XOF",
    "capture_method": "automatic",
    "description": "Test payment"
  }'
```

### Confirmer un Payment Intent

```bash
export INTENT_ID="uuid-from-previous-response"

curl -X POST http://localhost:8042/api/connect/intents/$INTENT_ID/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method": {
      "type": "wallet",
      "details": {"wallet_id": "uuid-wallet"}
    }
  }'
```

### Créer un Remboursement

```bash
export CHARGE_ID="uuid-of-charge"

curl -X POST http://localhost:8042/api/connect/refunds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "charge_id": "'$CHARGE_ID'",
    "amount": 500.00,
    "reason": "Customer request"
  }'
```

## 📊 Monitoring

### Logs (Pino)

Les logs sont en JSON structuré (pretty-print en dev):

```bash
# Voir les logs en temps réel
npm run dev | pino-pretty
```

**Format des logs:**
```json
{
  "level": "info",
  "time": 1234567890,
  "service": "brique-42-payments",
  "method": "POST",
  "url": "/api/connect/intents",
  "status": 200,
  "duration_ms": 45,
  "user_id": "uuid",
  "msg": "request completed"
}
```

### Métriques (Prometheus)

**Métriques principales:**

1. **Transactions**: `b42_transactions_total`
   - Labels: type, status, method, currency
   - Usage: `txCounter.inc({type:"charge",status:"captured",method:"wallet",currency:"XOF"})`

2. **HTTP Requests**: `b42_http_request_duration_ms`
   - Histogram de latence par route

3. **Webhooks**: `b42_webhook_deliveries_total`
   - Success/retry/failed par attempt

4. **SIRA Risk**: `b42_sira_risk_score`
   - Distribution des scores de risque

**Configuration Prometheus** (`prometheus.yml`):

```yaml
scrape_configs:
  - job_name: 'brique-42'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:8042']
    metrics_path: '/metrics'
```

### Dashboards Grafana

**Panels suggérés:**

1. **Volume de transactions**
   - Query: `rate(b42_transactions_total[5m])`
   - Type: Graph

2. **Latence HTTP**
   - Query: `histogram_quantile(0.95, b42_http_request_duration_ms)`
   - Type: Graph

3. **Taux de réussite webhooks**
   - Query: `rate(b42_webhook_deliveries_total{status="ok"}[5m])`
   - Type: Stat

4. **Distribution risque SIRA**
   - Query: `b42_sira_risk_score`
   - Type: Heatmap

## 🔧 Configuration Production

### Variables d'Environnement Critiques

```env
# Production essentials
NODE_ENV=production
PORT=8042
DATABASE_URL=postgresql://user:pass@host:5432/molam_connect_payments

# JWT (OBLIGATOIRE)
MOLAM_ID_JWT_PUBLIC="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# Redis (pour SSE)
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Intégrations
BRIQUE_41_URL=https://connect.molam.io
WALLET_URL=https://wallet.molam.io
TREASURY_URL=https://treasury.molam.io

# Security
RATE_LIMIT_MAX_REQUESTS=800

# SIRA (si externe)
SIRA_API_URL=https://sira.molam.io
SIRA_API_KEY=your-api-key
```

### Base de données PostgreSQL

**Extensions requises:**
```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

**Connexion pooling:**
- Min: 5 connections
- Max: 20 connections
- Idle timeout: 30s

**Indexes critiques:**
- `connect_payment_intents(connect_account_id, status)`
- `connect_charges(connect_account_id, status, created_at)`
- `connect_events_outbox(dispatched_at, sse_published_at)`

### Redis Configuration

**Mode: Standalone ou Sentinel**

```conf
# redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```

**Channels utilisés:**
- `molam:b42:events:account:{id}` - Events par compte
- `molam:b42:events:global` - Events globaux (admin)

## 🔒 Sécurité

### Checklist Production

- [ ] JWT RS256 avec clé publique Molam ID configurée
- [ ] CORS configuré pour domaines autorisés uniquement
- [ ] Rate limiting activé (800 req/min)
- [ ] Helmet.js activé (headers sécurité)
- [ ] HTTPS/TLS sur reverse proxy (nginx/traefik)
- [ ] Secrets en variables d'environnement (jamais en code)
- [ ] Database avec SSL enabled
- [ ] Redis avec password
- [ ] Logs sans données sensibles (pas de tokens/secrets)

### RBAC

**Roles disponibles:**
- `merchant_admin` - Contrôle total du compte marchand
- `merchant_finance` - Opérations financières uniquement
- `connect_platform` - Comptes marketplace/platform
- `pay_admin` - Administrateurs Molam Pay
- `compliance_ops` - Compliance & risque

## 🐛 Troubleshooting

### Le serveur ne démarre pas

```bash
# Vérifier les logs
npm run dev

# Erreurs communes:
# 1. DATABASE_URL invalide → Vérifier format et credentials
# 2. JWT public key manquante → Définir MOLAM_ID_JWT_PUBLIC
# 3. Port 8042 déjà utilisé → Changer PORT dans .env
```

### Workers ne traitent pas les événements

```bash
# Vérifier les tables
psql $DATABASE_URL -c "SELECT COUNT(*) FROM connect_events_outbox WHERE dispatched_at IS NULL;"

# Vérifier les webhooks
psql $DATABASE_URL -c "SELECT * FROM connect_webhook_deliveries WHERE status='retry';"

# Redémarrer les workers
pm2 restart b42-dispatcher b42-sse-broker
```

### SSE ne fonctionne pas

```bash
# Vérifier Redis
redis-cli ping
# Devrait retourner: PONG

# Vérifier les channels
redis-cli PUBSUB CHANNELS "molam:b42:events:*"

# Tester manuellement
redis-cli SUBSCRIBE "molam:b42:events:global"
```

### Métriques Prometheus vides

```bash
# Vérifier l'endpoint
curl http://localhost:8042/metrics

# Configurer Prometheus scraping
# Vérifier prometheus.yml et targets
```

## 📈 Performance

### Optimisations Recommandées

1. **Database Connection Pool**
   - Current: 20 connections max
   - Ajuster selon charge: `DATABASE_POOL_SIZE`

2. **Redis Persistence**
   - AOF enabled pour durabilité
   - RDB snapshots pour backup

3. **Worker Batching**
   - Dispatcher: 100 events/batch
   - SSE Broker: 100 events/batch
   - Ajustable dans le code si nécessaire

4. **Index Optimization**
   - Analyser slow queries: `EXPLAIN ANALYZE`
   - Ajouter indexes sur colonnes filtrées

## 🎯 Prochaines Étapes

1. **Tests d'intégration**
   - Créer tests end-to-end
   - Tester tous les workflows (automatic/manual capture)

2. **Load Testing**
   - k6 ou Artillery
   - Simuler 100-1000 TPS

3. **Alerting**
   - Grafana alertes sur métriques
   - PagerDuty/Slack pour incidents

4. **Documentation API**
   - OpenAPI/Swagger spec
   - Postman collection

---

**Brique 42 est prête pour le déploiement ! 🚀**

Pour toute question: [GitHub Issues](https://github.com/Molam-git/molam-connect/issues)
