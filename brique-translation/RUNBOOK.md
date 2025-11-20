# Runbook — Brique Translation Industrielle Molam

## 📘 Vue d'ensemble

Système de traduction industrielle pour Molam Connect avec LibreTranslate auto-hébergé, cache multi-niveaux, glossaire éditable par Ops, et pipeline de feedback pour entraînement SIRA.

## 🔑 Fonctionnalités clés

- **Cache multi-niveaux**: Overrides → PostgreSQL → LibreTranslate
- **Glossaire Ops**: UI dashboard pour corrections manuelles
- **Feedback loop**: Corrections utilisateurs pour SIRA
- **Audit immuable**: Traçabilité complète des actions Ops
- **Self-hosted**: LibreTranslate (open-source, gratuit)
- **Multi-namespace**: Pay, Shop, Talk, Eats isolés
- **Métriques Prometheus**: Cache hit ratio, latence, erreurs

## 📊 Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│            Translation Service               │
│                                              │
│  1. Check Overrides (Ops manual)            │
│  2. Check Cache (PostgreSQL)                │
│  3. Call LibreTranslate API                 │
│  4. Cache result                            │
└─────────────────────────────────────────────┘
       │                    │
       ▼                    ▼
┌─────────────┐      ┌──────────────┐
│  PostgreSQL │      │ LibreTranslate│
│  - Cache    │      │  (Docker)     │
│  - Overrides│      │  Open-source  │
│  - Feedback │      └──────────────┘
│  - Audit    │
└─────────────┘
       │
       ▼
┌─────────────────┐
│  SIRA Training  │
│  (Feedback →    │
│   Model fine-   │
│   tuning)       │
└─────────────────┘
```

## 🚀 Déploiement

### 1. Prérequis

```bash
# Versions requises
node -v    # v18+
docker -v  # 20+
psql --version  # PostgreSQL 15+
```

### 2. Configuration

```bash
# Clone repo
cd brique-translation

# Configure backend
cp backend/.env.example backend/.env

# Edit .env
vim backend/.env
```

Variables d'environnement:

```bash
DATABASE_URL=postgres://molam:molam@db:5432/molam
TRANSLATION_API=http://libretranslate:5000/translate
MOLAM_ID_PUBLIC="-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----"
PORT=8080
NODE_ENV=production
```

### 3. Démarrage (Docker Compose)

```bash
# Lancer tous les services
docker-compose up -d

# Vérifier que tout est up
docker-compose ps

# Services actifs:
# - db (PostgreSQL)
# - libretranslate (traduction)
# - backend (API Node.js)
# - frontend (React dashboard)
```

### 4. Migration base de données

```bash
# Option 1: Via npm
cd backend
npm install
npm run migrate

# Option 2: Direct psql
psql $DATABASE_URL -f ../database/migrations/001_init_translation.sql
```

### 5. Vérification

```bash
# Health check backend
curl http://localhost:8080/healthz
# {"ok":true,"service":"molam-translation"}

# Health check LibreTranslate
curl http://localhost:5000/languages
# [{"code":"en","name":"English"}...]

# Tester traduction
curl -X POST http://localhost:8080/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","sourceLang":"en","targetLang":"fr","namespace":"default"}'
# {"text":"Bonjour"}
```

## 🎯 Utilisation

### API Translation

```bash
# Traduire un texte
POST /api/translate
{
  "text": "Welcome to Molam",
  "sourceLang": "en",
  "targetLang": "fr",
  "namespace": "ui.labels"
}

# Response:
# {"text": "Bienvenue chez Molam"}
```

### Dashboard Ops

Accéder à http://localhost:3000

**Fonctionnalités:**
1. Créer override manuel
2. Lister overrides par namespace
3. Supprimer override
4. Voir audit trail complet

### Créer un Override (API)

```bash
curl -X POST http://localhost:8080/api/admin/overrides \
  -H "Authorization: Bearer $MOLAM_ID_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "pay",
    "source_text": "Molam Pay",
    "target_lang": "fr",
    "override_text": "Molam Pay"
  }'
```

### Feedback Utilisateur

```bash
curl -X POST http://localhost:8080/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "sourceText": "Pay now",
    "wrongTranslation": "Paie maintenant",
    "correctedTranslation": "Payer maintenant",
    "targetLang": "fr",
    "userId": "user-123"
  }'
```

## 🔍 Monitoring

### Métriques Prometheus

Endpoint: http://localhost:8080/metrics

**Métriques clés:**

```promql
# Cache hit ratio (target: > 80%)
sum(rate(molam_translation_cache_hits_total[5m]))
/
sum(rate(molam_translation_requests_total[5m]))

# P95 latency (target: < 150ms cached, < 500ms uncached)
histogram_quantile(0.95,
  sum(rate(molam_translation_latency_seconds_bucket[5m])) by (le)
)

# Error rate (target: < 0.1%)
sum(rate(molam_translation_errors_total[5m]))
/
sum(rate(molam_translation_requests_total[5m]))
```

### Dashboard Grafana

Créer dashboard avec:

1. **Cache Performance**
   - Cache hit ratio (gauge)
   - Requests by namespace (graph)

2. **Latency**
   - P50, P95, P99 latency (graph)
   - Latency heatmap

3. **Errors**
   - Error rate (graph)
   - Errors by type (table)

4. **Overrides**
   - Total overrides per namespace (stat)
   - Override creation rate (graph)

## 🔧 Dépannage

### Problème: LibreTranslate ne démarre pas

**Symptômes:**
```bash
docker-compose logs libretranslate
# Error: Failed to download language models
```

**Solution:**
```bash
# Premier démarrage peut prendre 5-10min (téléchargement modèles)
docker-compose logs -f libretranslate

# Si échec persistant, réduire languages
# docker-compose.yml:
environment:
  - LT_LOAD_ONLY=en,fr  # au lieu de en,fr,ar,es,pt
```

### Problème: Base de données connection failed

**Symptômes:**
```bash
❌ Database connection failed: ECONNREFUSED
```

**Solution:**
```bash
# Vérifier PostgreSQL
docker-compose ps db
# Si pas running:
docker-compose up -d db

# Tester connexion
psql $DATABASE_URL -c "SELECT 1"

# Vérifier migrations appliquées
psql $DATABASE_URL -c "\dt"
# Doit afficher: translation_cache, translation_overrides, etc.
```

### Problème: Cache hit ratio faible (< 50%)

**Diagnostic:**
```sql
-- Vérifier taille cache
SELECT namespace, COUNT(*) as cached_entries
FROM translation_cache
GROUP BY namespace;

-- Vérifier si cache expire
SELECT namespace,
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as recent
FROM translation_cache
GROUP BY namespace;
```

**Solution:**
- Augmenter durée de vie cache (ajouter TTL dans code)
- Précharger traductions fréquentes
- Vérifier namespaces corrects

### Problème: Latence élevée (P95 > 500ms)

**Diagnostic:**
```bash
# Vérifier latence LibreTranslate
curl -w "@curl-format.txt" http://localhost:5000/translate \
  -X POST -d '{"q":"test","source":"en","target":"fr"}'

# curl-format.txt:
# time_total: %{time_total}s
```

**Solutions:**
1. **Augmenter threads LibreTranslate:**
   ```yaml
   environment:
     - LT_THREADS=8  # augmenter selon CPU
   ```

2. **Ajouter plus de replicas:**
   ```yaml
   deploy:
     replicas: 3
   ```

3. **Activer cache Redis (optionnel):**
   - Ajouter service Redis dans docker-compose
   - Modifier `translationService.ts` pour check Redis avant PostgreSQL

### Problème: RBAC JWT invalid_token

**Symptômes:**
```bash
curl /api/admin/overrides -H "Authorization: Bearer $TOKEN"
# {"error":"invalid_token"}
```

**Solution:**
```bash
# Vérifier MOLAM_ID_PUBLIC configuré
docker-compose exec backend printenv MOLAM_ID_PUBLIC

# Vérifier format clé publique
# Doit être: -----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
# Avec \n littéraux (pas newlines)

# Tester JWT
node -e "
const jwt = require('jsonwebtoken');
const pub = process.env.MOLAM_ID_PUBLIC.replace(/\\n/g, '\n');
const token = process.argv[1];
console.log(jwt.verify(token, pub, {algorithms:['RS256']}));
" "$TOKEN"
```

## 📈 KPIs et SLOs

| Métrique | Target | Alert Threshold |
|----------|--------|-----------------|
| Cache hit ratio | ≥ 80% | < 70% |
| P95 latency (cached) | < 50ms | > 100ms |
| P95 latency (uncached) | < 500ms | > 800ms |
| Error rate | < 0.1% | > 1% |
| Availability | 99.9% | < 99.5% |

## 🔐 Sécurité

### RBAC Roles

- **pay_admin**: Full access (create, delete overrides, view audit)
- **translation_ops**: Manage overrides
- **billing_ops**: View overrides
- **auditor**: View audit only

### Best Practices

1. **Rotation secrets**: Rotate `MOLAM_ID_PUBLIC` monthly
2. **Rate limiting**: Ajouter rate limit sur `/api/translate` (ex: 100 req/min/user)
3. **Input validation**: Limite 10KB par texte source
4. **Audit logging**: Tous les changements loggés dans `translation_audit`

## 📊 Queries SQL Utiles

### Top namespaces par volume

```sql
SELECT namespace, COUNT(*) as translations
FROM translation_cache
GROUP BY namespace
ORDER BY translations DESC
LIMIT 10;
```

### Overrides non utilisés (candidates à cleanup)

```sql
SELECT o.id, o.source_text, o.target_lang, o.created_at
FROM translation_overrides o
LEFT JOIN translation_cache c
  ON c.source_text = o.source_text
  AND c.target_lang = o.target_lang
WHERE c.id IS NULL
  AND o.created_at < NOW() - INTERVAL '90 days';
```

### Feedback haute priorité (> 5 corrections même source)

```sql
SELECT source_text, target_lang, COUNT(*) as corrections
FROM translation_feedback
GROUP BY source_text, target_lang
HAVING COUNT(*) > 5
ORDER BY corrections DESC;
```

### Audit par utilisateur

```sql
SELECT user_id, action, COUNT(*) as count
FROM translation_audit
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id, action
ORDER BY count DESC;
```

## ✅ Checklist Quotidienne

- [ ] Vérifier cache hit ratio (Grafana)
- [ ] Vérifier P95 latency < 500ms
- [ ] Vérifier error rate < 0.1%
- [ ] Review nouveaux overrides (audit trail)
- [ ] Check feedback queue (corrections en attente)
- [ ] Vérifier disk usage PostgreSQL
- [ ] Backup translation_overrides

## 🔄 Maintenance

### Backup

```bash
# Backup overrides
pg_dump $DATABASE_URL -t translation_overrides -t translation_audit \
  > backup_$(date +%Y%m%d).sql

# Backup cache (optionnel, peut être reconstruit)
pg_dump $DATABASE_URL -t translation_cache > cache_backup.sql
```

### Cleanup ancien cache (optionnel)

```sql
-- Supprimer cache low-confidence > 90 jours
DELETE FROM translation_cache
WHERE confidence < 0.5
  AND created_at < NOW() - INTERVAL '90 days';
```

### Migration vers M2M-100 (future)

1. Déployer M2M-100 en parallèle de LibreTranslate
2. A/B test: 10% traffic → M2M-100
3. Comparer BLEU score sur feedback
4. Basculer 100% si amélioration > 10%

## 📞 Support

- **Slack**: #molam-translation
- **Ops Dashboard**: http://ops.molam.com/translation
- **Runbook**: https://docs.molam.com/translation/runbook
- **On-call**: PagerDuty escalation

---

**Dernière mise à jour**: 2025-01-19
**Responsable**: Équipe Platform
**Version**: 1.0.0
