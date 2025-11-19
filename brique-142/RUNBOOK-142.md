# Runbook — Brique 142: Alerts & Playbooks UI

## 📘 Vue d'ensemble

Système temps réel d'alertes multi-canaux et playbooks automatisés pour réponse rapide aux incidents.

## 🔑 Fonctionnalités clés

- **Alertes temps réel**: 9 types (payout_delay, fraud_detected, bank_failover, etc.)
- **Multi-canal**: Email, SMS, Slack, Webhook, PagerDuty, Push
- **Playbooks**: Templates d'actions automatisables
- **Auto-execution**: SIRA peut déclencher playbooks automatiquement
- **Audit**: Journal immutable de toutes exécutions

## 📊 Workflow

### 1. Création alert (auto ou manuelle)

```bash
curl -X POST http://ops.molam.com/api/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "type": "fraud_detected",
    "severity": "critical",
    "message": "Suspicious pattern detected on account ACC123",
    "metadata": {
      "account_id": "ACC123",
      "risk_score": 0.95,
      "pattern": "rapid_transactions"
    },
    "priority": 90
  }'
```

### 2. Notifications automatiques

Selon configuration channels (Slack, Email, SMS, etc.), notifications envoyées automatiquement.

### 3. Auto-playbooks (si configurés)

Si playbook avec `auto_execute=true` et triggers matchent → exécution automatique.

### 4. Manuel acknowledgement

```bash
curl -X POST http://ops.molam.com/api/alerts/ALERT_ID/acknowledge \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Résolution

```bash
curl -X POST http://ops.molam.com/api/alerts/ALERT_ID/resolve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resolution_notes": "False positive, account verified"}'
```

## 🎯 Playbooks

### Créer playbook

```bash
curl -X POST http://ops.molam.com/api/playbooks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Freeze Suspicious Account",
    "description": "Auto-freeze on fraud detection",
    "triggers": {
      "alert_type": "fraud_detected",
      "severity": "critical"
    },
    "actions": [
      {"type": "freeze_account", "params": {"reason": "fraud"}},
      {"type": "notify_ops", "params": {"channel": "slack"}},
      {"type": "create_investigation", "params": {"priority": "high"}}
    ],
    "auto_execute": false,
    "require_approval": true
  }'
```

### Exécuter playbook

```bash
curl -X POST http://ops.molam.com/api/playbooks/PLAYBOOK_ID/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alert_id": "ALERT_ID"}'
```

## 🚨 Alertes courantes

### Payout Delay

```sql
INSERT INTO alerts(type, severity, message, metadata)
VALUES (
  'payout_delay',
  'warning',
  'Payout PAY123 delayed > 60 min',
  '{"payout_id":"PAY123", "delay_minutes":75}'
);
```

### Fraud Detected

```sql
INSERT INTO alerts(type, severity, message, metadata, priority)
VALUES (
  'fraud_detected',
  'critical',
  'High-risk pattern on account ACC456',
  '{"account_id":"ACC456", "risk_score":0.92}',
  95
);
```

## 📈 Monitoring

### Alertes non résolues

```sql
SELECT type, severity, COUNT(*) as count, MAX(detected_at) as latest
FROM alerts
WHERE status IN ('new', 'acknowledged')
GROUP BY type, severity
ORDER BY count DESC;
```

### Playbooks most used

```sql
SELECT
  p.name,
  COUNT(e.id) as executions,
  SUM(CASE WHEN e.status = 'success' THEN 1 ELSE 0 END) as successful
FROM playbooks p
LEFT JOIN playbook_executions e ON p.id = e.playbook_id
WHERE e.executed_at > NOW() - INTERVAL '7 days'
GROUP BY p.id, p.name
ORDER BY executions DESC;
```

### Channels delivery rate

```sql
SELECT
  c.name,
  c.channel_type,
  COUNT(n.id) as total,
  SUM(CASE WHEN n.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
  (SUM(CASE WHEN n.status = 'delivered' THEN 1 ELSE 0 END)::FLOAT / COUNT(n.id) * 100) as delivery_rate
FROM alert_notification_channels c
JOIN alert_notifications n ON c.id = n.channel_id
WHERE n.created_at > NOW() - INTERVAL '24 hours'
GROUP BY c.id, c.name, c.channel_type;
```

## 🔧 Dépannage

### Notifications non envoyées

```sql
SELECT * FROM alert_notifications
WHERE status IN ('pending', 'failed')
  AND created_at > NOW() - INTERVAL '1 hour';

-- Retry failed
UPDATE alert_notifications
SET status = 'pending', sent_at = NULL
WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour';
```

### Playbook stuck

```sql
-- Check stuck executions
SELECT * FROM playbook_executions
WHERE status = 'running'
  AND executed_at < NOW() - INTERVAL '10 minutes';

-- Force fail
UPDATE playbook_executions
SET status = 'failed', completed_at = NOW(),
    result = '{"error":"timeout"}'
WHERE id = 'EXEC_ID';
```

## 📊 KPIs

- **MTTR (Mean Time To Resolve)**: < 30 min pour critical
- **Notification delivery rate**: > 99%
- **Playbook success rate**: > 90%
- **Auto-playbooks triggered**: > 50/jour
- **False positive rate**: < 10%

## 🔐 Sécurité

- **RBAC**: ops, fraud_ops, pay_admin
- **Audit immutable**: Toutes exécutions tracées
- **Multi-sig**: Actions critiques require_approval
- **Rate limiting**: Max 100 alerts/min par source

## ✅ Checklist quotidienne

- [ ] Review critical alerts non résolues
- [ ] Vérifier notifications delivery rate > 95%
- [ ] Check playbooks stuck > 10min
- [ ] Review false positives
- [ ] Update alert rules si besoin

---

**Support:** #alerts-ops sur Slack
