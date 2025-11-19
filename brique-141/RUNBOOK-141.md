# Runbook — Brique 141: Ops UI

## 📘 Vue d'ensemble

Interface opérationnelle pour gérer plans (payouts, sweeps, failover), approbations multi-signatures, et journal d'audit immutable.

## 🔑 Fonctionnalités clés

- **Plans opérationnels**: payout_batch, sweep, failover, freeze, pause_bank
- **Approbations multi-sig**: 1 à N signatures requises
- **Journal immutable**: Audit trail complet de toutes actions
- **Exécution orchestrée**: Worker queue avec idempotence
- **Rollback**: Support rollback manuel ou automatique

## 📊 Workflow complet

### 1. Créer plan (draft)

```bash
curl -X POST http://ops.molam.com/api/ops/plans \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "plan-2025-08-payout-eur",
    "name": "Monthly EUR Payouts",
    "description": "Payout batch for August 2025",
    "plan_type": "payout_batch",
    "payload": {
      "currency": "EUR",
      "cutoff_date": "2025-08-01",
      "total_amount": 250000,
      "simulate_before_execute": true
    },
    "required_approvals": 2
  }'
```

### 2. Stage plan

```bash
curl -X POST http://ops.molam.com/api/ops/plans/PLAN_ID/stage \
  -H "Authorization: Bearer $TOKEN"

# Response includes estimated_impact
```

### 3. Collect approvals

```bash
# First approver
curl -X POST http://ops.molam.com/api/ops/plans/PLAN_ID/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"signature": "..."}'

# Second approver
curl -X POST http://ops.molam.com/api/ops/plans/PLAN_ID/approve \
  -H "Authorization: Bearer $TOKEN2"
```

### 4. Execute plan

```bash
curl -X POST http://ops.molam.com/api/ops/plans/PLAN_ID/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: exec-unique-key-001"

# Returns: {"run_id": "..."}
```

### 5. Monitor execution

```bash
# Get runs
curl http://ops.molam.com/api/ops/plans/PLAN_ID/runs \
  -H "Authorization: Bearer $TOKEN"

# Get journal
curl http://ops.molam.com/api/ops/plans/PLAN_ID/journal \
  -H "Authorization: Bearer $TOKEN"
```

### 6. Rollback si nécessaire

```bash
curl -X POST http://ops.molam.com/api/ops/plans/PLAN_ID/rollback \
  -H "Authorization: Bearer $TOKEN"
```

## 🚨 Alertes

### Plan échoué

```yaml
- alert: OpsPlanFailed
  expr: |
    sum(rate(ops_plan_runs_total{status="failed"}[10m])) > 0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Ops plan execution failed"
```

### Approbations bloquées

```sql
-- Plans en attente d'approbations depuis > 24h
SELECT id, name, status, required_approvals,
       jsonb_array_length(approvals) as current_approvals
FROM ops_plans
WHERE status IN ('draft', 'staged')
  AND created_at < NOW() - INTERVAL '24 hours';
```

## 🔧 Dépannage

### Plan stuck en "executing"

```sql
-- Vérifier runs
SELECT * FROM ops_plan_runs
WHERE plan_id = 'PLAN_ID'
ORDER BY run_at DESC;

-- Si stuck, forcer failed
UPDATE ops_plan_runs
SET status = 'failed', result = '{"error": "timeout"}'
WHERE id = 'RUN_ID' AND status = 'running';
```

### Worker ne traite pas la queue

```bash
# Restart worker
kubectl rollout restart deployment/ops-worker

# Vérifier queue
psql -c "SELECT * FROM ops_plan_runs WHERE status = 'queued';"
```

## 📈 KPIs

- **Plans créés/jour**: > 10
- **Taux succès exécution**: > 95%
- **Temps moyen approbation**: < 4h
- **Plans en attente**: < 5

## 🔐 Sécurité

- **RBAC**: pay_admin, finance_ops, ops, auditor
- **Idempotency**: Toutes exécutions via Idempotency-Key
- **Audit**: Journal immutable (append-only)
- **Multi-sig**: 2+ approvals pour actions critiques

## ✅ Checklist quotidienne

- [ ] Vérifier plans en attente (> 24h)
- [ ] Review plans failed (analyse root cause)
- [ ] Vérifier queue depth < 5
- [ ] Export journal pour compliance
- [ ] Vérifier métriques Prometheus

---

**Support:** #ops-plans sur Slack
