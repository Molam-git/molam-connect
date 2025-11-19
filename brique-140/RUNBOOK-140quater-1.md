# Runbook — Sous-Brique 140quater-1: Self-Healing Offline Simulator

## 📘 Vue d'ensemble

Système de simulation isolée pour tester patches self-healing en sandbox sécurisé avant déploiement production.

## 🔑 Principes

- **Isolation**: Containers Docker avec network mode `none` (aucun accès réseau externe)
- **Repeatability**: Simulations déterministes via seed fixe
- **Safety**: Rollback automatique sur échec patch
- **Audit**: Journal immutable de toutes actions
- **Multi-tenant**: Support merchant/agent/internal scoping
- **Anonymization**: Redaction PII avant export training SIRA

## 🏗️ Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Ops UI    │────────▶│  API Router  │────────▶│  Queue      │
└─────────────┘         └──────────────┘         └──────┬──────┘
                                                         │
                                                         ▼
                                                  ┌─────────────┐
                                                  │   Worker    │
                                                  └──────┬──────┘
                                                         │
                                                         ▼
                                                  ┌─────────────┐
                                                  │  Docker     │
                                                  │  Sandbox    │
                                                  └─────────────┘
```

## 📊 Monitoring

### Métriques Prometheus

```bash
# Total runs par status
curl http://devportal:8140/api/simulator/metrics

# Exemple output:
# molam_simulator_runs_total{status="success"} 245
# molam_simulator_runs_total{status="failed"} 12
# molam_simulator_success_rate 0.953
# molam_simulator_avg_latency_ms 187
```

### Requêtes SQL

```sql
-- Runs récents
SELECT *
FROM sdk_simulation_runs_summary
WHERE run_at > NOW() - INTERVAL '24 hours'
ORDER BY run_at DESC
LIMIT 50;

-- Success rate par SDK language
SELECT
  s.sdk_language,
  COUNT(*) as total_runs,
  SUM(CASE WHEN sr.status = 'success' THEN 1 ELSE 0 END) as successful,
  AVG((sr.metrics->>'success_rate')::DECIMAL) as avg_success_rate
FROM sdk_simulation_runs sr
JOIN sdk_simulations s ON sr.simulation_id = s.id
WHERE sr.run_at > NOW() - INTERVAL '7 days'
GROUP BY s.sdk_language;

-- Erreurs anonymisées pour SIRA
SELECT
  error_signature,
  sdk_language,
  AVG(frequency) as avg_frequency,
  COUNT(*) as occurrences
FROM sdk_anonymized_errors
WHERE exported_to_sira = false
GROUP BY error_signature, sdk_language
ORDER BY occurrences DESC
LIMIT 20;
```

## 🚨 Alertes

### Taux échec élevé

```yaml
# Prometheus alert
- alert: SimulatorHighFailureRate
  expr: |
    (sum(rate(molam_simulator_runs_total{status="failed"}[10m])) /
     sum(rate(molam_simulator_runs_total[10m]))) > 0.2
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "Taux échec simulator élevé"
    description: "> 20% des simulations échouent"
```

### Simulations bloquées

```yaml
- alert: SimulatorQueueStuck
  expr: |
    sum(molam_simulator_runs_total{status="queued"}) > 10
  for: 30m
  labels:
    severity: critical
  annotations:
    summary: "Queue simulator bloquée"
    description: "Plus de 10 simulations en queue depuis 30min"
```

## 🔧 Dépannage

### Worker ne traite pas les runs

```bash
# 1. Vérifier status worker
kubectl logs -l app=simulator-worker --tail=100

# 2. Vérifier runs en queue
psql -d molam_connect -c "
  SELECT id, simulation_id, status, run_at
  FROM sdk_simulation_runs
  WHERE status = 'queued'
  ORDER BY run_at ASC;
"

# 3. Restart worker si bloqué
kubectl rollout restart deployment/simulator-worker

# 4. Purge runs très anciens (> 24h)
psql -d molam_connect -c "
  UPDATE sdk_simulation_runs
  SET status = 'timeout'
  WHERE status IN ('queued', 'running')
    AND run_at < NOW() - INTERVAL '24 hours';
"
```

### Container timeout

```bash
# 1. Vérifier timeout dans worker config
echo $MAX_RUN_TIME_MS  # Devrait être 180000 (3 min)

# 2. Vérifier logs container
kubectl logs simulator-worker | grep -A 10 "timeout"

# 3. Augmenter timeout si nécessaire (dev only)
# Edit src/simulator/worker.ts: MAX_RUN_TIME_MS = 5 * 60_000
```

### Images Docker manquantes

```bash
# 1. Lister images disponibles
docker images | grep molam/sim

# 2. Build image si manquante
cd brique-140/docker/simulator
docker build -t molam/sim-node:2025-01 .

# 3. Push to registry
docker push molam/sim-node:2025-01

# 4. Pull sur workers
kubectl exec -it simulator-worker-xxx -- docker pull molam/sim-node:2025-01
```

### Patch non appliqué en simulation

```bash
# 1. Vérifier patch exists
psql -d molam_connect -c "
  SELECT id, description, patch_code
  FROM sdk_self_healing_registry
  WHERE id = 'PATCH_ID';
"

# 2. Vérifier simulation référence patch
psql -d molam_connect -c "
  SELECT id, name, patch_reference
  FROM sdk_simulations
  WHERE id = 'SIM_ID';
"

# 3. Check logs container
psql -d molam_connect -c "
  SELECT artifact_s3_key
  FROM sdk_simulation_runs
  WHERE id = 'RUN_ID';
"

# 4. Download logs
aws s3 cp s3://molam-simulator-logs/RUN_ID.log .
grep "patch_applied" RUN_ID.log
```

## 🔄 Workflow complet

### 1. Créer simulation

```bash
# Via API
curl -X POST http://devportal:8140/api/simulator \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantType": "internal",
    "name": "HMAC Signature Test",
    "description": "Test patch HMAC avec 30% errors",
    "sdkLanguage": "node",
    "scenario": {
      "error": "signature_mismatch",
      "error_frequency": 0.3,
      "latency_ms": 500,
      "total_requests": 100,
      "success_threshold": 0.85
    },
    "patchReference": "PATCH_UUID"
  }'
```

### 2. Lancer run

```bash
curl -X POST http://devportal:8140/api/simulator/SIM_ID/run \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H "Idempotency-Key: ops-test-001" \
  -H "Content-Type: application/json" \
  -d '{"seed": 12345}'
```

### 3. Monitor run

```bash
# Poll status
curl http://devportal:8140/api/simulator/SIM_ID/runs/RUN_ID \
  -H "Authorization: Bearer $OPS_TOKEN"

# Response:
# {
#   "run": {
#     "status": "success",
#     "metrics": {
#       "success_rate": 0.92,
#       "avg_latency_ms": 187,
#       "total_requests": 100,
#       "failed_requests": 8
#     }
#   }
# }
```

### 4. Approuver patch

```bash
# Si success et no regressions
curl -X POST http://devportal:8140/api/simulator/runs/RUN_ID/approve-patch \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approval_notes": "Validated in sandbox, ready for staging"
  }'
```

### 5. Déployer en staging

```bash
# Mark patch as staged
psql -d molam_connect -c "
  UPDATE sdk_patch_approvals
  SET status = 'staged'
  WHERE simulation_run_id = 'RUN_ID';
"

# Deploy canary (5% traffic)
kubectl set env deployment/sdk-service PATCH_ROLLOUT_PERCENTAGE=5

# Monitor metrics
curl http://devportal:8140/metrics | grep patch_success_rate

# If success > 95% after 1h, promote to 100%
kubectl set env deployment/sdk-service PATCH_ROLLOUT_PERCENTAGE=100
```

## 🧪 Templates de simulation

### Template 1: HMAC Signature

```json
{
  "error": "signature_mismatch",
  "error_frequency": 0.3,
  "latency_ms": 500,
  "total_requests": 100,
  "success_threshold": 0.85
}
```

### Template 2: Timeout Network

```json
{
  "error": "timeout",
  "error_frequency": 0.2,
  "latency_ms": 1000,
  "total_requests": 200,
  "success_threshold": 0.90
}
```

### Template 3: Invalid Currency

```json
{
  "error": "invalid_currency",
  "error_frequency": 0.1,
  "latency_ms": 300,
  "total_requests": 150,
  "success_threshold": 0.95
}
```

## 🔐 Sécurité

### Isolation réseau

```bash
# Vérifier network mode des containers
docker inspect CONTAINER_ID | jq '.[0].HostConfig.NetworkMode'
# Output: "none"

# Aucun accès externe autorisé
```

### Secrets

```bash
# Secrets JAMAIS injectés dans simulations
# Redaction automatique des PII avant anonymization

# Vérifier redaction
psql -d molam_connect -c "
  SELECT context_hash, error_signature
  FROM sdk_anonymized_errors
  LIMIT 10;
"
# context_hash devrait être SHA256, pas de PII visible
```

### Permissions

```bash
# Seuls roles ops/dev peuvent créer/run simulations
# Role auditor pour lecture seule

# Vérifier RBAC
kubectl get rolebindings | grep simulator
```

## 📈 KPIs

- **Taux succès simulations**: > 95%
- **Temps moyen run**: < 2 minutes
- **Queue depth**: < 5 runs en attente
- **Patch approval rate**: > 80% (simulations success → approval)
- **SIRA training exports**: > 100/jour (anonymized errors)

## 🏁 Checklist quotidienne

- [ ] Vérifier queue depth < 5
- [ ] Vérifier success rate > 95%
- [ ] Review failed runs (analyse root cause)
- [ ] Export anonymized errors vers SIRA (< 24h old)
- [ ] Vérifier aucun timeout/stuck depuis > 1h
- [ ] Review pending patch approvals
- [ ] Monitor staging canary metrics

---

**Support:** #simulator-ops sur Slack
