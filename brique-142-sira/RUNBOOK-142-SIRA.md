# Runbook — Brique 142-SIRA: AI-Generated Playbooks

## 📘 Vue d'ensemble

Système d'IA permettant à SIRA de proposer automatiquement des playbooks opérationnels basés sur:
- Motifs de fraude détectés (patterns)
- Incidents récurrents (bank failures, payout delays)
- Performance commerciale (churn signals, high-risk merchants)
- Données historiques (agents, zones, horaires)

## 🔑 Fonctionnalités clés

- **Suggestions IA**: SIRA génère playbooks avec confidence score et explainability
- **Multi-signature approvals**: Workflow de validation avec quorum configurable
- **Exécution sécurisée**: Actions idempotentes avec dry-run mode
- **Audit complet**: Journal immutable de toutes décisions ML et exécutions
- **gRPC Bridge**: Interface Python-Node via HTTP pour appels modèle

## 📊 Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────────┐
│   Events    │─────>│ SIRA Model   │─────>│  Suggested      │
│  (Kafka)    │      │  (Python)    │      │  Playbooks      │
└─────────────┘      └──────────────┘      └─────────────────┘
                            │                       │
                            │                       ▼
                     ┌──────────────┐      ┌─────────────────┐
                     │ SIRA Bridge  │      │  Ops Review UI  │
                     │   (HTTP)     │      │    (React)      │
                     └──────────────┘      └─────────────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │  Approval Flow  │
                                          │ (Multi-sig)     │
                                          └─────────────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │   Playbooks     │
                                          │   Execution     │
                                          └─────────────────┘
```

## 🚀 Démarrage rapide

### 1. Déployer la base de données

```bash
psql -U molam -d molam_ops -f database/migrations/142_sira_playbooks.sql
```

### 2. Démarrer SIRA Bridge (Python)

```bash
# Generate protobuf code
cd sira
python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. sira.proto

# Start bridge
export SIRA_MODEL_HOST="model-service:50051"
export SIRA_BRIDGE_PORT=8081
python sira_bridge.py
```

### 3. Démarrer les workers Node.js

```bash
# Playbook executor worker
export DATABASE_URL="postgresql://molam:password@localhost:5432/molam_ops"
export SIRA_BRIDGE_URL="http://localhost:8081"
ts-node workers/playbook_executor_worker.ts
```

### 4. Accéder aux UIs

- **SIRA Suggestions**: `http://ops.molam.com/sira/suggestions`
- **Approval Requests**: `http://ops.molam.com/approvals`

## 📝 Workflow principal

### 1. SIRA génère suggestion

SIRA observe événements et génère suggestion:

```typescript
// Automatique via Kafka consumer ou manuel:
POST /api/sira/generate
{
  "samples": [
    {
      "id": "evt123",
      "type": "chargeback",
      "amount": 500,
      "currency": "EUR",
      "occurred_at": "2025-01-15T10:00:00Z",
      "meta": {"country": "SN"}
    }
  ]
}

// Response:
{
  "id": "sug_abc123",
  "scenario": "massive_chargeback_wave_country_SN",
  "confidence": 0.9250,
  "justification": {
    "top_features": [
      {"name": "chargeback_rate_24h", "value": 0.15},
      {"name": "country", "value": "SN"}
    ]
  },
  "proposed_actions": [
    {"action": "create_alert", "params": {"severity": "critical"}},
    {"action": "freeze_accounts_by_list", "params": {"dry_run": true}}
  ]
}
```

### 2. Ops review suggestion

UI: `/sira/suggestions`

- Voir confidence score et explainability
- Examiner actions proposées
- Approuver ou rejeter

### 3. Approval workflow (multi-sig)

Si suggestion approuvée avec policy multi-sig:

```bash
# Create approval request
curl -X POST http://ops.molam.com/api/approvals \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "request_type": "playbook_activation",
    "reference_id": "playbook_xyz",
    "policy_id": "policy_abc",
    "metadata": {}
  }'

# Response:
{
  "id": "approval_123",
  "status": "open",
  "required_threshold": 2
}
```

### 4. Sign approval

```bash
# First signature
curl -X POST http://ops.molam.com/api/approvals/approval_123/sign \
  -H "Authorization: Bearer $TOKEN_USER1" \
  -d '{"comment": "Approved for fraud prevention"}'

# Second signature (threshold met!)
curl -X POST http://ops.molam.com/api/approvals/approval_123/sign \
  -H "Authorization: Bearer $TOKEN_USER2" \
  -d '{"comment": "Approved"}'

# Auto-approved! Playbook created.
```

### 5. Playbook execution

```bash
# Execute playbook
curl -X POST http://ops.molam.com/api/playbooks/playbook_xyz/execute \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"alert_id": "alert_456"}'

# Worker picks up execution and runs actions sequentially
```

## 🎯 Actions disponibles

### create_alert
```json
{
  "action": "create_alert",
  "params": {
    "severity": "critical|warning|info",
    "message": "Alert message"
  }
}
```

### freeze_accounts_by_list
```json
{
  "action": "freeze_accounts_by_list",
  "params": {
    "list": ["ACC123", "ACC456"],
    "reason": "fraud_prevention",
    "dry_run": true
  }
}
```

### escalate_ops
```json
{
  "action": "escalate_ops",
  "params": {
    "team": ["fraud_ops", "pay_admin"]
  }
}
```

### pause_bank
```json
{
  "action": "pause_bank",
  "params": {
    "bank_id": "BANK_XYZ",
    "reason": "high_failure_rate",
    "dry_run": false
  }
}
```

### reverse_transaction
```json
{
  "action": "reverse_transaction",
  "params": {
    "transaction_id": "TXN_789",
    "reason": "fraud_detected",
    "dry_run": false
  }
}
```

## 📈 Monitoring

### Suggestions générées (24h)

```sql
SELECT scenario, COUNT(*) as count, AVG(confidence) as avg_confidence
FROM suggested_playbooks
WHERE generated_at > NOW() - INTERVAL '24 hours'
GROUP BY scenario
ORDER BY count DESC;
```

### Taux d'approbation

```sql
SELECT
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM suggested_playbooks
WHERE generated_at > NOW() - INTERVAL '7 days'
GROUP BY status;
```

### Approvals en attente

```sql
SELECT ar.*,
       COUNT(s.id) as signatures,
       ar.required_threshold - COUNT(s.id) as signatures_needed
FROM approval_requests ar
LEFT JOIN approval_signatures s ON s.approval_request_id = ar.id
WHERE ar.status = 'open'
GROUP BY ar.id
HAVING COUNT(s.id) < ar.required_threshold;
```

### Playbooks les plus exécutés

```sql
SELECT p.name, COUNT(e.id) as executions,
       SUM(CASE WHEN e.status = 'succeeded' THEN 1 ELSE 0 END) as successful
FROM playbooks p
JOIN playbook_executions e ON e.playbook_id = p.id
WHERE e.initiated_at > NOW() - INTERVAL '30 days'
GROUP BY p.id, p.name
ORDER BY executions DESC
LIMIT 10;
```

### Model runs history

```sql
SELECT model_version,
       COUNT(*) as runs,
       AVG((metrics->>'precision')::numeric) as avg_precision
FROM sira_model_runs
WHERE run_at > NOW() - INTERVAL '7 days'
GROUP BY model_version
ORDER BY run_at DESC;
```

## 🔧 Dépannage

### SIRA Bridge non accessible

```bash
# Check bridge health
curl http://localhost:8081/health

# Check logs
docker logs sira-bridge

# Restart bridge
docker restart sira-bridge
```

### Suggestions non générées

```sql
-- Check recent model runs
SELECT * FROM sira_model_runs
ORDER BY run_at DESC LIMIT 10;

-- Check SIRA bridge connection
-- Node logs should show: "SIRA Integration: Connected to bridge"
```

### Approvals bloquées

```sql
-- Find stuck approvals
SELECT ar.*, COUNT(s.id) as current_sigs
FROM approval_requests ar
LEFT JOIN approval_signatures s ON s.approval_request_id = ar.id
WHERE ar.status = 'open'
  AND ar.requested_at < NOW() - INTERVAL '1 day'
GROUP BY ar.id;

-- Manually approve if needed (use with caution)
UPDATE approval_requests
SET status = 'approved'
WHERE id = 'approval_123';
```

### Playbook executions failed

```sql
-- Check failed executions
SELECT * FROM playbook_executions
WHERE status = 'failed'
  AND initiated_at > NOW() - INTERVAL '1 hour'
ORDER BY initiated_at DESC;

-- View error details
SELECT id, result->>'error' as error
FROM playbook_executions
WHERE status = 'failed'
LIMIT 10;

-- Retry execution
UPDATE playbook_executions
SET status = 'pending', updated_at = NOW()
WHERE id = 'exec_123';
```

## 🔐 Sécurité

### mTLS pour gRPC

```bash
# Configure TLS cert for model connection
export SIRA_MODEL_CERT="/path/to/cert.pem"

# Bridge will use secure channel
python sira_bridge.py
```

### RBAC roles

- **pay_admin**: Approuve playbooks critiques, signe approvals
- **fraud_ops**: Review suggestions fraude, signe approvals
- **compliance**: Signe approvals pour actions critiques
- **ops**: Review suggestions low-risk, execute playbooks
- **auditor**: Read-only access pour audit

### Audit trail

Toutes actions loggées dans `molam_audit_logs`:

```sql
SELECT actor, action, target_type, created_at, details
FROM molam_audit_logs
WHERE action LIKE '%approval%'
  OR action LIKE '%playbook%'
ORDER BY created_at DESC
LIMIT 100;
```

## 📊 KPIs

- **Suggestion acceptance rate**: > 60%
- **Model confidence (avg)**: > 0.75
- **Approval time (median)**: < 2 hours
- **Playbook execution success rate**: > 95%
- **False positive rate**: < 15%
- **MTTR avec auto-playbooks**: < 15 min

## ✅ Checklist quotidienne

- [ ] Review pending suggestions (> 0.8 confidence)
- [ ] Check approval requests en attente
- [ ] Verify playbook execution success rate > 95%
- [ ] Review failed executions et retry si besoin
- [ ] Check SIRA bridge health
- [ ] Verify model runs (at least 1 per day)
- [ ] Review audit logs pour anomalies

## 🧪 Tests

### Run Jest tests (Node)

```bash
npm test tests/approvals.test.ts
```

### Run Pytest tests (Python)

```bash
# Start bridge first
python sira/sira_bridge.py &

# Run tests
pytest tests/test_sira_bridge.py -v

# Stop bridge
pkill -f sira_bridge
```

## 🚀 Deployment

### Docker Compose

```yaml
version: '3.8'
services:
  sira-bridge:
    build: ./sira
    ports:
      - "8081:8081"
    environment:
      - SIRA_MODEL_HOST=model-service:50051
      - SIRA_MODEL_CERT=/certs/model.pem
    volumes:
      - ./certs:/certs

  playbook-worker:
    build: ./workers
    environment:
      - DATABASE_URL=postgresql://molam:pass@db:5432/molam_ops
      - SIRA_BRIDGE_URL=http://sira-bridge:8081
    depends_on:
      - sira-bridge
      - db
```

### Kubernetes

```bash
# Apply manifests
kubectl apply -f k8s/sira-bridge-deployment.yaml
kubectl apply -f k8s/playbook-worker-deployment.yaml

# Check pods
kubectl get pods -l app=sira-bridge
kubectl get pods -l app=playbook-worker

# Check logs
kubectl logs -f deployment/sira-bridge
kubectl logs -f deployment/playbook-worker
```

## 📞 Support

- **Slack**: #sira-ops
- **Docs**: https://docs.molam.com/sira-playbooks
- **Incidents**: PagerDuty → sira-critical

---

**Dernière mise à jour**: 2025-01-18
