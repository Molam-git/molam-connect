# Brique 118ter — Observabilité & Metrics

## 🎯 Objectif

Fournir une **infrastructure complète d'observabilité** pour le Playground Molam Connect avec export Prometheus, métriques custom et dashboards Grafana.

---

## ✨ Fonctionnalités

### Export Prometheus
- ✅ Endpoint `/metrics` au format Prometheus
- ✅ Métriques Node.js par défaut (CPU, mémoire, GC)
- ✅ Métriques custom playground
- ✅ Labels pour filtrage et agrégation

### Métriques Custom

**Counters** :
- `molam_playground_test_runs_total` - Nombre de tests exécutés
- `molam_playground_fuzzing_alerts_total` - Alertes de fuzzing/injection
- `molam_playground_rate_limit_hits_total` - Requêtes bloquées par rate-limit
- `molam_playground_rbac_violations_total` - Violations RBAC détectées
- `molam_playground_shared_sessions_total` - Sessions partagées créées
- `molam_playground_expired_sessions_total` - Sessions expirées nettoyées
- `molam_playground_snippets_generated_total` - Snippets de code générés
- `molam_playground_sira_suggestions_total` - Suggestions Sira générées

**Histograms** :
- `molam_playground_request_duration_seconds` - Durée des requêtes
- `molam_playground_payload_size_bytes` - Taille des payloads

**Gauges** :
- `molam_playground_active_users` - Utilisateurs actifs
- `molam_playground_db_connections` - Connexions DB (idle/active)
- `molam_playground_memory_usage_bytes` - Utilisation mémoire

---

## 🚀 Démarrage Rapide

### 1. Installation

```bash
# Serveur metrics
cd brique-118/src
npm install

# Tests
cd ../tests/jest
npm install
```

### 2. Démarrer le Serveur Metrics

```bash
cd brique-118/src
npm start
```

Le serveur démarre sur http://localhost:3000

**Endpoints** :
- `GET /metrics` - Export Prometheus
- `GET /health` - Health check
- `POST /api/playground/run` - Exécuter requête (génère métriques)

### 3. Accéder aux Métriques

```bash
curl http://localhost:3000/metrics
```

Résultat :
```
# HELP molam_playground_test_runs_total Nombre de tests exécutés dans le Playground
# TYPE molam_playground_test_runs_total counter
molam_playground_test_runs_total{status="success",method="GET",endpoint="/healthz"} 42
molam_playground_test_runs_total{status="failure",method="POST",endpoint="/v1/payments"} 3

# HELP molam_playground_fuzzing_alerts_total Nombre d'alertes déclenchées par fuzzing
# TYPE molam_playground_fuzzing_alerts_total counter
molam_playground_fuzzing_alerts_total{attack_type="sql_injection",severity="high"} 12
molam_playground_fuzzing_alerts_total{attack_type="xss",severity="medium"} 5
...
```

---

## 📊 Configuration Prometheus

### Configuration

Fichier : [`deploy/prometheus.yml`](./deploy/prometheus.yml)

```yaml
scrape_configs:
  - job_name: 'molam_playground'
    static_configs:
      - targets: ['localhost:3000']
        labels:
          service: 'playground-api'
```

### Démarrer Prometheus

```bash
# Avec Docker
docker run -d \
  -p 9090:9090 \
  -v $(pwd)/deploy/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus

# Accéder à Prometheus UI
open http://localhost:9090
```

### Requêtes PromQL Exemples

```promql
# Taux de succès des tests
rate(molam_playground_test_runs_total{status="success"}[5m])

# Taux d'alertes critiques
sum by (attack_type) (rate(molam_playground_fuzzing_alerts_total{severity="critical"}[1h]))

# P95 latence des requêtes
histogram_quantile(0.95, rate(molam_playground_request_duration_seconds_bucket[5m]))

# Violations RBAC par rôle
sum by (user_role) (molam_playground_rbac_violations_total)
```

---

## 📈 Dashboard Grafana

### Import Dashboard

1. Copier le fichier [`deploy/grafana-dashboard.json`](./deploy/grafana-dashboard.json)
2. Dans Grafana UI : **Dashboards** → **Import** → **Upload JSON**
3. Sélectionner la datasource Prometheus

### Panels Inclus

| Panel | Type | Description |
|-------|------|-------------|
| Test Runs | Graph | Taux de tests par status |
| Fuzzing Alerts | Stat | Total des alertes |
| Rate Limit Hits | Stat | Requêtes bloquées |
| RBAC Violations | Stat | Violations détectées |
| Request Duration | Graph | p50, p95, p99 latence |
| Payload Size | Graph | Distribution tailles |
| Snippets Generated | Pie Chart | Par langage |
| Sira Suggestions | Table | Par type et sévérité |
| Shared Sessions | Bar Gauge | Par catégorie TTL |
| Memory Usage | Graph | Heap et RSS |
| Attack Types | Heatmap | Distribution temporelle |

---

## 🧪 Tests de Métriques

### Lancer les Tests

```bash
cd tests/jest
npm run test:metrics
```

### Tests Inclus

Fichier : [`tests/jest/trace.test.ts`](./tests/jest/trace.test.ts)

**Suites de tests** :
- ✅ Prometheus Endpoint (4 tests)
- ✅ Test Runs Counter (3 tests)
- ✅ Fuzzing Alerts Counter (3 tests)
- ✅ Rate Limit Hits Counter (2 tests)
- ✅ RBAC Violations Counter (2 tests)
- ✅ Shared Sessions Counter (1 test)
- ✅ Request Duration Histogram (2 tests)
- ✅ Payload Size Histogram (2 tests)
- ✅ Snippets Generated Counter (1 test)
- ✅ Sira Suggestions Counter (1 test)
- ✅ Health Endpoint (2 tests)
- ✅ Metric Labels (1 test)
- ✅ Metric Reset (1 test)
- ✅ Performance (2 tests)

**Total** : 27 tests

---

## 🔧 Utilisation dans le Code

### Import

```typescript
import {
  recordTestRun,
  recordFuzzingAlert,
  recordRateLimitHit,
  recordRBACViolation,
  recordSharedSession,
  recordRequestDuration,
  recordPayloadSize,
  recordSnippetGenerated,
  recordSiraSuggestion
} from './metrics';
```

### Exemples

```typescript
// Enregistrer un test run
recordTestRun('success', 'POST', '/v1/payments');

// Enregistrer une alerte de fuzzing
recordFuzzingAlert('sql_injection', 'critical');

// Enregistrer un rate limit hit
recordRateLimitHit('developer', '/api/playground/run');

// Enregistrer une violation RBAC
recordRBACViolation('developer', 'DELETE', '/api/playground/sessions/purge');

// Enregistrer une session partagée
recordSharedSession(86400); // 1 day TTL

// Enregistrer la durée d'une requête
const start = Date.now();
// ... execute request ...
const duration = (Date.now() - start) / 1000;
recordRequestDuration('POST', 200, duration);

// Enregistrer la taille d'un payload
const payloadSize = JSON.stringify(body).length;
recordPayloadSize('POST', payloadSize);

// Enregistrer un snippet généré
recordSnippetGenerated('node');

// Enregistrer une suggestion Sira
recordSiraSuggestion('missing_idempotency', 'warning');
```

---

## 🎬 Générer des Métriques de Test

### Script de Génération

Fichier : [`scripts/generate-metrics.ts`](./scripts/generate-metrics.ts)

```bash
# Démarrer le serveur
cd brique-118/src
npm start &

# Générer des métriques
cd brique-118/scripts
ts-node generate-metrics.ts
```

Le script génère :
- 100 test runs
- 30 fuzzing alerts
- 20 rate limit hits
- 15 RBAC violations
- 25 shared sessions
- 40 snippets
- 35 Sira suggestions

### Vérifier

```bash
curl http://localhost:3000/metrics | grep molam_playground
```

---

## 📊 CI/CD - GitHub Actions

**Workflow** : [`.github/workflows/playground-metrics.yml`](./.github/workflows/playground-metrics.yml)

### Jobs

**1. Metrics Tests** ✅
- Exécute les tests de métriques
- Vérifie que les counters s'incrémentent
- Upload coverage

**2. Prometheus Integration** ✅
- Démarre Prometheus en service
- Lance le serveur metrics
- Génère du trafic de test
- Vérifie que Prometheus scrape les métriques

**3. Grafana Dashboard Validation** ✅
- Valide le JSON du dashboard
- Vérifie la syntaxe

**4. Performance Benchmarks** ✅
- 10,000 updates de métriques < 1000ms
- Export métriques < 100ms

**5. Summary** ✅
- Rapport de synthèse
- Display dans GitHub Step Summary

### Triggers

- ✅ Push vers `main` ou `develop`
- ✅ Pull Request
- ✅ Manual dispatch

---

## 🏗️ Architecture

```
┌─────────────┐
│  Playground │
│     API     │──┐
└─────────────┘  │
                 │ record metrics
┌─────────────┐  │
│    Tests    │──┤
│   (Jest)    │  │
└─────────────┘  │
                 ▼
            ┌──────────┐
            │ prom-    │
            │ client   │
            └────┬─────┘
                 │
                 │ GET /metrics
                 ▼
            ┌──────────┐
            │Prometheus│
            │  Server  │
            └────┬─────┘
                 │
                 │ query
                 ▼
            ┌──────────┐
            │ Grafana  │
            │Dashboard │
            └──────────┘
```

---

## 📈 Métriques Disponibles

### Counters

| Métrique | Labels | Description |
|----------|--------|-------------|
| `test_runs_total` | status, method, endpoint | Tests exécutés |
| `fuzzing_alerts_total` | attack_type, severity | Alertes fuzzing |
| `rate_limit_hits_total` | user_role, endpoint | Rate limits |
| `rbac_violations_total` | user_role, attempted_action, resource | Violations RBAC |
| `shared_sessions_total` | ttl_category | Sessions partagées |
| `expired_sessions_total` | - | Sessions expirées |
| `snippets_generated_total` | language | Snippets générés |
| `sira_suggestions_total` | suggestion_type, severity | Suggestions Sira |

### Histograms

| Métrique | Labels | Buckets | Description |
|----------|--------|---------|-------------|
| `request_duration_seconds` | method, status_code | 0.1, 0.5, 1, 2, 5, 10 | Durée requêtes |
| `payload_size_bytes` | method | 100, 1k, 10k, 100k, 1M | Taille payloads |

### Gauges

| Métrique | Labels | Description |
|----------|--------|-------------|
| `active_users` | - | Utilisateurs actifs |
| `db_connections` | state (idle/active) | Connexions DB |
| `memory_usage_bytes` | type (heapUsed/heapTotal/rss) | Mémoire processus |

---

## 🔍 Alerting Rules (Exemples)

```yaml
groups:
  - name: playground_alerts
    rules:
      # Taux d'erreur élevé
      - alert: HighErrorRate
        expr: rate(molam_playground_test_runs_total{status="failure"}[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate in playground"

      # Attaques critiques
      - alert: CriticalAttackDetected
        expr: sum(increase(molam_playground_fuzzing_alerts_total{severity="critical"}[5m])) > 5
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Critical attack attempts detected"

      # Rate limiting excessif
      - alert: ExcessiveRateLimiting
        expr: rate(molam_playground_rate_limit_hits_total[5m]) > 10
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Many requests being rate limited"

      # Violations RBAC suspectes
      - alert: RBACViolationSpike
        expr: increase(molam_playground_rbac_violations_total[15m]) > 20
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Unusual RBAC violation activity"
```

---

## 🐛 Debugging

### Vérifier les Métriques

```bash
# Endpoint metrics
curl http://localhost:3000/metrics

# Health check
curl http://localhost:3000/health

# Specific metric
curl http://localhost:3000/metrics | grep test_runs_total
```

### Logs

Le serveur logs toutes les requêtes avec timing automatique.

### Reset Metrics (Tests)

```typescript
import { resetMetrics } from './metrics';

resetMetrics(); // Reset tous les compteurs
```

---

## 🏆 Avantages

✅ **Observabilité complète** - Toutes les métriques critiques
✅ **Standard Prometheus** - Compatible écosystème
✅ **Dashboards Grafana** - Visualisation prête à l'emploi
✅ **Performance** - < 1ms par update métrique
✅ **27 tests** - Coverage complète
✅ **CI/CD intégré** - Tests automatiques
✅ **Production ready** - Prêt pour monitoring

---

## 📝 Ressources

### Documentation
- [Prometheus Documentation](https://prometheus.io/docs/)
- [prom-client npm](https://github.com/siimon/prom-client)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
- [PromQL Guide](https://prometheus.io/docs/prometheus/latest/querying/basics/)

### Exemples
- [Metrics Code](./src/metrics.ts)
- [Server Code](./src/server.ts)
- [Tests](./tests/jest/trace.test.ts)
- [Generator Script](./scripts/generate-metrics.ts)

---

**Brique 118ter** ✅ Production Ready
**Molam Connect** — Observabilité de classe mondiale 📊
