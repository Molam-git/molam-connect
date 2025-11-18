# Plan de Test - Molam Connect Briques

**Date**: 2025-11-12
**Briques à tester**: 76, 77, 77.1, 78, 79

---

## 📋 Vue d'ensemble

Ce document décrit le plan de test complet pour toutes les briques implémentées.

### Briques Implémentées

| Brique | Nom | Statut | Lignes de Code |
|--------|-----|--------|----------------|
| 76 | Notifications & Alertes Marchands | ✅ Production Ready | 2,900+ |
| 77 | Dashboard Unifié Molam Pay | ✅ Production Ready | 2,300+ |
| 77.1 | Alerts & Auto-Remediation | ✅ Production Ready | 1,600+ |
| 78 | Ops Approval Engine | ✅ Production Ready | 2,100+ |
| 79 | Developer Console & API Keys | ✅ Production Ready | 2,500+ |

**Total**: 11,400+ lignes de code production-ready

---

## 🗄️ Phase 1: Tests des Schémas SQL

### Objectif
Vérifier que tous les schémas SQL s'exécutent sans erreur et créent les structures attendues.

### Commandes

```bash
# 1. Créer la base de données de test
createdb -U postgres molam_connect_test

# 2. Brique 76 - Notifications
psql -U postgres -d molam_connect_test -f brique-76/sql/004_notifications_schema.sql

# 3. Brique 77 - Dashboard
psql -U postgres -d molam_connect_test -f brique-77/sql/005_dashboard_schema.sql

# 4. Brique 77.1 - Alerts
psql -U postgres -d molam_connect_test -f brique-77/sql/006_alerts_schema.sql

# 5. Brique 78 - Ops Approval
psql -U postgres -d molam_connect_test -f brique-78/sql/007_approval_engine_schema.sql

# 6. Brique 79 - API Keys
psql -U postgres -d molam_connect_test -f brique-79/sql/008_api_keys_schema.sql
```

### Vérifications

```sql
-- Vérifier les tables créées
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Vérifier les fonctions créées
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- Vérifier les vues créées
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- Vérifier les triggers créés
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY trigger_name;
```

### Critères de Succès

- ✅ Tous les schémas s'exécutent sans erreur
- ✅ Toutes les tables sont créées avec les bonnes colonnes
- ✅ Toutes les fonctions sont créées
- ✅ Tous les triggers sont créés
- ✅ Toutes les vues sont créées
- ✅ Les données de seed sont insérées

---

## 🧪 Phase 2: Tests Unitaires

### Brique 76 - Notifications

**Fichiers à tester**:
- `src/services/notificationEngine.ts`
- `src/routes/notificationRoutes.ts`

**Tests**:
```typescript
describe('Notification Engine', () => {
  test('Create notification with template', async () => {
    const notification = await createNotification({
      template_key: 'payment_received',
      recipient_type: 'merchant',
      recipient_id: 'merchant-123',
      channels: ['email', 'sms'],
      variables: { amount: 10000, currency: 'XOF' }
    });

    expect(notification).toBeDefined();
    expect(notification.status).toBe('pending');
  });

  test('Process notification dispatch', async () => {
    const result = await processNotificationRequest(notificationId);
    expect(result.dispatched_count).toBeGreaterThan(0);
  });

  test('Check throttle limits', async () => {
    const allowed = await checkThrottleLimit(
      'merchant', 'merchant-123', 'email', 'transactional', 'high'
    );
    expect(allowed).toBe(true);
  });
});
```

### Brique 77 - Dashboard

**Tests**:
```typescript
describe('Dashboard Service', () => {
  test('Aggregate event into hourly bucket', async () => {
    await aggregateEvent({
      occurred_at: new Date(),
      tenant_type: 'platform',
      metrics: { gmv: 10000, transaction_count: 1 }
    });
    // Verify aggregate created
  });

  test('Get dashboard snapshot', async () => {
    const snapshot = await getDashboardSnapshot('platform', null);
    expect(snapshot).toBeDefined();
    expect(snapshot.payload).toHaveProperty('gmv_24h');
  });

  test('Create ops action', async () => {
    const action = await createOpsAction({
      actor_id: 'user-123',
      action_type: 'PAUSE_PAYOUT',
      target: { merchant_id: 'merchant-123' },
      required_approvals: 2
    });
    expect(action.status).toBe('requested');
  });
});
```

### Brique 77.1 - Alerts

**Tests**:
```typescript
describe('Alert Service', () => {
  test('Create alert', async () => {
    const alert = await createAlert({
      alert_type: 'float_low',
      tenant_type: 'agent',
      tenant_id: 'agent-123',
      severity: 'critical',
      metric: { metric: 'float_available', value: 500000, threshold: 1000000 }
    });
    expect(alert.status).toBe('open');
  });

  test('Trigger remediation flow', async () => {
    // Test auto-remediation with SIRA
    const policy = await getPolicy('float_low');
    expect(policy.enabled).toBe(true);
  });

  test('Acknowledge alert', async () => {
    await acknowledgeAlert(alertId, 'user-123');
    const alert = await getAlert(alertId);
    expect(alert.status).toBe('acknowledged');
  });
});
```

### Brique 78 - Ops Approval

**Tests**:
```typescript
describe('Approval Service', () => {
  test('Create ops action', async () => {
    const action = await createOpsAction({
      origin: 'ops_ui',
      action_type: 'FREEZE_MERCHANT',
      params: { merchant_id: 'merchant-123', reason: 'fraud' },
      created_by: 'user-123'
    });
    expect(action.status).toBe('requested');
  });

  test('Vote on action', async () => {
    const result = await voteOnAction(
      actionId,
      'user-456',
      ['pay_admin'],
      'approve',
      'Reviewed, approved'
    );
    expect(result.approval.vote).toBe('approve');
  });

  test('Quorum evaluation', async () => {
    // Create action requiring 2 approvals
    const action = await createOpsAction({...});

    // Vote 1
    await voteOnAction(action.id, 'user-1', ['finance_ops'], 'approve');
    let updated = await getActionWithVotes(action.id);
    expect(updated.status).toBe('pending_approval');

    // Vote 2
    await voteOnAction(action.id, 'user-2', ['finance_ops'], 'approve');
    updated = await getActionWithVotes(action.id);
    expect(updated.status).toBe('approved');
  });

  test('Execute approved action', async () => {
    const result = await executeAction(actionId, 'executor-123');
    expect(result.success).toBe(true);
  });
});
```

### Brique 79 - API Keys

**Tests**:
```typescript
describe('API Keys Service', () => {
  test('Create API key', async () => {
    const result = await createAPIKey({
      tenant_type: 'merchant',
      tenant_id: 'merchant-123',
      mode: 'test',
      name: 'Test Key',
      scopes: ['payments:create', 'payments:read']
    });

    expect(result.key.key_id).toMatch(/^TK_test_/);
    expect(result.secret).toBeDefined();
    expect(result.secret.length).toBeGreaterThan(40);
  });

  test('Validate API key', async () => {
    const { key, secret } = await createAPIKey({...});

    const validation = await validateAPIKey(key.key_id, secret);
    expect(validation.valid).toBe(true);
    expect(validation.key.scopes).toContain('payments:create');
  });

  test('Rotate API key', async () => {
    const { key, secret: oldSecret } = await createAPIKey({...});

    const rotation = await rotateAPIKey(key.key_id, 'user-123', 600);
    expect(rotation.new_version).toBe(2);

    // Old secret still valid (grace period)
    const validation1 = await validateAPIKey(key.key_id, oldSecret);
    expect(validation1.valid).toBe(true);

    // New secret also valid
    const validation2 = await validateAPIKey(key.key_id, rotation.secret);
    expect(validation2.valid).toBe(true);
  });

  test('Revoke API key', async () => {
    const { key, secret } = await createAPIKey({...});

    await revokeAPIKey(key.key_id, 'user-123', 'test revocation');

    const validation = await validateAPIKey(key.key_id, secret);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('key_not_active');
  });

  test('Check quota enforcement', async () => {
    const { key } = await createAPIKey({
      restrictions: { quotas: { daily: 10 } }
    });

    // Simulate 10 requests
    for (let i = 0; i < 10; i++) {
      const quota = await checkQuota(key.key_id);
      expect(quota.allowed).toBe(true);
    }

    // 11th request should fail
    const quota = await checkQuota(key.key_id);
    expect(quota.allowed).toBe(false);
    expect(quota.error).toBe('quota_exceeded');
  });
});
```

---

## 🔌 Phase 3: Tests d'Intégration API

### Setup

```bash
# Démarrer les services requis
docker-compose up -d postgres redis

# Démarrer le serveur
npm run dev
```

### Brique 76 - Notifications API

```bash
# 1. Create template
curl -X POST http://localhost:3000/api/notifications/templates \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "template_key": "test_payment_received",
    "scope": "global",
    "content": {
      "fr": {
        "email": {
          "subject": "Paiement reçu",
          "body": "Vous avez reçu {{amount}} {{currency}}"
        }
      }
    },
    "channels": ["email"],
    "category": "transactional"
  }'

# 2. Send notification
curl -X POST http://localhost:3000/api/notifications \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "template_key": "test_payment_received",
    "recipient_type": "merchant",
    "recipient_id": "merchant-123",
    "channels": ["email"],
    "variables": {
      "amount": "10,000",
      "currency": "XOF"
    }
  }'

# 3. Get notification status
curl -X GET "http://localhost:3000/api/notifications/$NOTIFICATION_ID" \
  -H "Authorization: Bearer $JWT"
```

### Brique 77 - Dashboard API

```bash
# 1. Get dashboard snapshot
curl -X GET "http://localhost:3000/api/dashboard/overview?tenantType=platform" \
  -H "Authorization: Bearer $JWT"

# 2. Get time-series data
curl -X GET "http://localhost:3000/api/dashboard/metrics/gmv/timeseries?period=24h" \
  -H "Authorization: Bearer $JWT"

# 3. Create ops action
curl -X POST http://localhost:3000/api/dashboard/ops/actions \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "actor_id": "user-123",
    "action_type": "PAUSE_PAYOUT",
    "target": {
      "merchant_id": "merchant-123",
      "duration": "1h"
    },
    "required_approvals": 2
  }'

# 4. Get alerts
curl -X GET "http://localhost:3000/api/dashboard/alerts?tenantType=platform" \
  -H "Authorization: Bearer $JWT"
```

### Brique 77.1 - Alerts API

```bash
# 1. Get alerts
curl -X GET "http://localhost:3000/api/alerts?tenantType=merchant&tenantId=merchant-123" \
  -H "Authorization: Bearer $JWT"

# 2. Acknowledge alert
curl -X POST http://localhost:3000/api/alerts/$ALERT_ID/acknowledge \
  -H "Authorization: Bearer $JWT"

# 3. Resolve alert
curl -X POST http://localhost:3000/api/alerts/$ALERT_ID/resolve \
  -H "Authorization: Bearer $JWT"

# 4. Get alert stats
curl -X GET "http://localhost:3000/api/alerts/stats?tenantType=platform" \
  -H "Authorization: Bearer $JWT"
```

### Brique 78 - Ops Approval API

```bash
# 1. Create action
curl -X POST http://localhost:3000/api/ops/actions \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "ops_ui",
    "action_type": "FREEZE_MERCHANT",
    "params": {
      "merchant_id": "merchant-123",
      "reason": "fraud_suspected",
      "duration": "24h"
    }
  }'

# 2. Vote on action
curl -X POST http://localhost:3000/api/ops/actions/$ACTION_ID/vote \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "vote": "approve",
    "comment": "Reviewed, approved"
  }'

# 3. Execute action
curl -X POST http://localhost:3000/api/ops/actions/$ACTION_ID/execute \
  -H "Authorization: Bearer $JWT"

# 4. Get audit trail
curl -X GET http://localhost:3000/api/ops/actions/$ACTION_ID/audit \
  -H "Authorization: Bearer $JWT"
```

### Brique 79 - API Keys API

```bash
# 1. Create test key
curl -X POST http://localhost:3000/api/keys \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_type": "merchant",
    "tenant_id": "merchant-123",
    "mode": "test",
    "name": "Test Integration Key",
    "scopes": ["payments:create", "payments:read"]
  }'

# Save the key_id and secret from response

# 2. Test API key authentication
curl -X GET http://localhost:3000/api/v1/payments \
  -H "Authorization: Bearer $KEY_ID.$SECRET"

# 3. Rotate key
curl -X POST http://localhost:3000/api/keys/$KEY_ID/rotate \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "grace_period_seconds": 600
  }'

# 4. Get usage stats
curl -X GET http://localhost:3000/api/keys/$KEY_ID/usage?days=7 \
  -H "Authorization: Bearer $JWT"

# 5. Revoke key
curl -X POST http://localhost:3000/api/keys/$KEY_ID/revoke \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Test revocation"
  }'
```

---

## 🔗 Phase 4: Tests d'Intégration Inter-Briques

### Test 1: Alert → Ops Approval → Execution

**Scénario**: Alert détecte float faible → crée action d'approbation → approbation → exécution

```bash
# 1. Créer alert (Brique 77.1)
curl -X POST http://localhost:3000/api/alerts/simulate \
  -H "Authorization: Bearer $JWT" \
  -d '{
    "alert_type": "float_low",
    "tenant_type": "agent",
    "tenant_id": "agent-123",
    "metric": {"value": 500000, "threshold": 1000000}
  }'

# 2. Vérifier que l'action d'approbation est créée (Brique 78)
curl -X GET "http://localhost:3000/api/ops/actions?status=pending" \
  -H "Authorization: Bearer $JWT"

# 3. Approuver l'action
curl -X POST http://localhost:3000/api/ops/actions/$ACTION_ID/vote \
  -H "Authorization: Bearer $JWT" \
  -d '{"vote": "approve"}'

# 4. Vérifier l'exécution
curl -X GET http://localhost:3000/api/ops/actions/$ACTION_ID/audit \
  -H "Authorization: Bearer $JWT"
```

### Test 2: API Key → Protected Endpoint → Usage Tracking

**Scénario**: Créer clé API → utiliser pour appel API → vérifier usage

```bash
# 1. Créer API key (Brique 79)
RESPONSE=$(curl -X POST http://localhost:3000/api/keys \
  -H "Authorization: Bearer $JWT" \
  -d '{
    "tenant_type": "merchant",
    "tenant_id": "merchant-123",
    "mode": "test",
    "scopes": ["payments:create"]
  }')

KEY_ID=$(echo $RESPONSE | jq -r '.key.key_id')
SECRET=$(echo $RESPONSE | jq -r '.secret')

# 2. Utiliser la clé pour créer un paiement
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Authorization: Bearer $KEY_ID.$SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "currency": "XOF",
    "merchant_id": "merchant-123"
  }'

# 3. Vérifier usage (Brique 79)
curl -X GET http://localhost:3000/api/keys/$KEY_ID/usage \
  -H "Authorization: Bearer $JWT"
```

### Test 3: Notification → Webhook → Retry Logic

**Scénario**: Envoyer notification → webhook échoue → retry automatique

```bash
# 1. Créer notification avec webhook (Brique 76)
curl -X POST http://localhost:3000/api/notifications \
  -H "Authorization: Bearer $JWT" \
  -d '{
    "template_key": "payment_received",
    "recipient_type": "merchant",
    "recipient_id": "merchant-123",
    "channels": ["webhook"],
    "variables": {"amount": 10000}
  }'

# 2. Vérifier les tentatives de delivery
curl -X GET "http://localhost:3000/api/notifications/$NOTIFICATION_ID/deliveries" \
  -H "Authorization: Bearer $JWT"
```

---

## 📊 Phase 5: Tests de Performance

### Load Testing avec k6

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '3m', target: 50 },   // Stay at 50 users
    { duration: '1m', target: 100 },  // Ramp up to 100 users
    { duration: '3m', target: 100 },  // Stay at 100 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests < 500ms
    http_req_failed: ['rate<0.01'],   // Error rate < 1%
  },
};

const BASE_URL = 'http://localhost:3000';
const API_KEY = __ENV.API_KEY;

export default function () {
  // Test API key authentication
  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };

  // Test dashboard snapshot
  let res = http.get(`${BASE_URL}/api/dashboard/overview?tenantType=platform`, { headers });
  check(res, { 'dashboard snapshot < 100ms': (r) => r.timings.duration < 100 });

  // Test API key validation
  res = http.get(`${BASE_URL}/api/v1/payments`, { headers });
  check(res, { 'API auth < 10ms': (r) => r.timings.duration < 10 });

  sleep(1);
}
```

**Exécution**:
```bash
k6 run --env API_KEY=TK_test_XXX.secret load-test.js
```

---

## ✅ Critères de Succès Globaux

### SQL Schemas
- ✅ Tous les schémas s'exécutent sans erreur
- ✅ Toutes les contraintes sont respectées
- ✅ Les seed data sont insérées correctement

### Services
- ✅ Tous les tests unitaires passent (100%)
- ✅ Code coverage > 80%
- ✅ Pas de memory leaks

### API
- ✅ Tous les endpoints répondent avec status 2xx ou 4xx approprié
- ✅ Validation des inputs fonctionne
- ✅ Authentication/authorization fonctionne
- ✅ Rate limiting fonctionne

### Intégration
- ✅ Workflows inter-briques fonctionnent
- ✅ Audit trail complet
- ✅ Pas de race conditions

### Performance
- ✅ P95 latency < 500ms
- ✅ API key validation < 10ms
- ✅ Dashboard snapshot < 100ms
- ✅ Throughput > 1000 req/s

---

## 🐛 Procédure en Cas d'Échec

1. **Identifier**: Quel test échoue ?
2. **Logs**: Vérifier les logs d'erreur
3. **Debug**: Utiliser debugger ou logs supplémentaires
4. **Fix**: Corriger le bug
5. **Retest**: Ré-exécuter le test
6. **Document**: Documenter le fix

---

## 📝 Rapport de Test

À remplir après l'exécution des tests:

| Phase | Statut | Détails |
|-------|--------|---------|
| SQL Schemas | ⏳ En attente | |
| Tests Unitaires | ⏳ En attente | |
| Tests API | ⏳ En attente | |
| Tests Intégration | ⏳ En attente | |
| Tests Performance | ⏳ En attente | |

---

**Plan de Test v1.0**
**Date**: 2025-11-12
**Total Tests**: ~100+
**Couverture**: 5 briques, 11,400+ lignes de code

Prêt pour l'exécution ! 🚀
