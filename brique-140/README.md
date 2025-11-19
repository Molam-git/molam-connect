# Brique 140 — Developer Portal

## 📋 Vue d'ensemble

Le **Developer Portal** est le système de gestion complet des clés API, usage tracking, rate limiting et onboarding pour Molam Connect/Pay. Inspiré des meilleures pratiques de Stripe, Twilio et AWS.

### Fonctionnalités principales
- ✅ **Gestion clés API** : Test/Live, rotation, révocation
- ✅ **Usage tracking** : Temps réel avec agrégats quotidiens
- ✅ **Rate limiting** : Token bucket + sliding window (Redis Lua)
- ✅ **Sandbox** : Environnement test complet avec cartes simulées
- ✅ **Playground** : Interface interactive pour tester l'API
- ✅ **Webhooks** : Configuration et delivery tracking
- ✅ **Monitoring** : Prometheus metrics + alerting
- ✅ **Audit trail** : Logs immutables de toutes opérations

---

## 🚀 Démarrage rapide

### Prérequis
- Node.js >= 18
- PostgreSQL >= 13
- Redis >= 6
- Kafka (optionnel, pour usage tracking)

### Installation

```bash
# 1. Installer dépendances
cd brique-140
npm install

# 2. Configuration
cp .env.example .env
# Éditer .env avec vos credentials

# 3. Base de données
psql -U postgres -d molam_connect -f database/migrations/140_dev_portal.sql

# 4. Démarrer
npm run dev

# 5. Vérification
curl http://localhost:8140/healthz
```

---

## 📚 Architecture

### Tables principales
1. **dev_accounts** - Comptes développeurs
2. **dev_apps** - Applications
3. **dev_app_keys** - Clés API (secrets in Vault)
4. **api_usage_events** - Événements d'usage
5. **api_usage_rollups_day** - Agrégats quotidiens
6. **api_key_quotas** - Rate limits & quotas
7. **dev_portal_audit** - Audit logs

### Composants
- **API Server** (Express) - Port 8140
- **Kafka Consumer** - Usage ingestion
- **Redis** - Rate limiting
- **Vault** - Secret management
- **Prometheus** - Metrics

---

## 🔑 Gestion des clés API

### Créer une clé

```bash
POST /api/dev/apps/:appId/keys
Content-Type: application/json
Authorization: Bearer {JWT}

{
  "key_type": "api_key",
  "environment": "test",
  "name": "My Test Key"
}

# Response
{
  "key_id": "ak_test_abc123",
  "secret": "sk_test_xyz....", # SHOWN ONCE
  "expires_at": "2025-04-15T00:00:00Z"
}
```

### Utiliser une clé

```bash
# HMAC signature = HMAC-SHA256(secret, request_body)
curl -X POST https://api.molam.com/v1/payments \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ak_test_abc123:HMAC_SIGNATURE" \
  -d '{"amount":1000,"currency":"XOF"}'
```

### Rotation

```bash
POST /api/dev/keys/:keyId/rotate
Authorization: Bearer {JWT}

# Retourne nouvelle clé
# Ancienne clé reste valide 7 jours (grace period)
```

### Révocation

```bash
POST /api/dev/keys/:keyId/revoke
Authorization: Bearer {JWT}

{
  "reason": "Key compromised"
}
```

---

## 📊 Usage Tracking

### Événements collectés
- Endpoint appelé
- Status code
- Latency (ms)
- Bytes transférés
- Country/IP

### Agrégats disponibles
- Calls par jour
- Error rate
- P95/P99 latency
- Volume de données

### API

```bash
GET /api/dev/apps/:appId/usage?days=30
Authorization: Bearer {JWT}

# Response
[
  {
    "day": "2025-01-15",
    "calls": 15234,
    "errors": 45,
    "avg_latency_ms": 125.4
  }
]
```

---

## ⚡ Rate Limiting

### Configuration par défaut
- **Burst**: 600 req
- **Sustained**: 100 req/min
- **Daily quota**: 1M req

### Configurer limites

```sql
UPDATE api_key_quotas
SET burst_limit = 1000,
    sustained_limit = 200,
    daily_quota = 5000000
WHERE key_id = 'ak_live_xyz';
```

### Overage Actions
- `block` - Bloquer requêtes
- `warn` - Logger warnings
- `charge` - Facturer surcharge

---

## 🧪 Tests

### Unit tests
```bash
npm test
```

### E2E tests (Playwright)
```bash
npx playwright test
```

### Load tests (k6)
```bash
k6 run loadtest/k6_script.js
```

---

## 📈 Monitoring

### Métriques Prometheus

```
# Endpoint
GET /metrics

# Exemples métriques
http_request_duration_seconds
api_key_auth_attempts_total
api_key_usage_total
active_api_keys
```

### Alertes recommandées
- High error rate (> 5%)
- High latency (P95 > 1s)
- Quota near limit (> 90%)
- Failed auth attempts (> 100/min)

---

## 🔒 Sécurité

### Best practices
1. ✅ Secrets one-time preview
2. ✅ HMAC signature verification
3. ✅ JWT authentication (Molam ID)
4. ✅ Rate limiting per key
5. ✅ Audit logs immutables
6. ✅ Key rotation with grace period
7. ✅ Vault/KMS for secrets
8. ✅ mTLS for privileged ops

### Incident Response

**Key compromise:**
```bash
# 1. Immediate revoke
POST /api/dev/keys/:keyId/revoke

# 2. Notify owner
# 3. Check audit logs
SELECT * FROM dev_portal_audit
WHERE target->>'key_id' = 'ak_live_compromised'
ORDER BY created_at DESC;

# 4. Review usage
SELECT * FROM api_usage_events
WHERE key_id = 'ak_live_compromised'
AND occurred_at > NOW() - INTERVAL '7 days';
```

---

## 🚢 Déploiement

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 8140
CMD ["node", "dist/server.js"]
```

### Kubernetes (Helm)

```bash
# Install
helm install devportal ./deploy/helm/devportal

# Upgrade
helm upgrade devportal ./deploy/helm/devportal

# Rollback
helm rollback devportal
```

---

## 📞 Support

- **Documentation:** https://docs.molampay.com/devportal
- **Issues:** GitHub Issues
- **Slack:** #dev-portal

---

## 📄 Licence

MIT © Molam Pay
