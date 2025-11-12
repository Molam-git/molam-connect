# SIRA AI - Quick Start Guide
**Get started with AI-powered webhooks in 5 minutes**

## 🚀 Quick Setup

### 1. Apply Database Schema (30 seconds)

```bash
# Core schema (if not already applied)
psql -d molam -f migrations/001_create_devconsole_tables.sql

# SIRA enrichment
psql -d molam -f sql/002_sira_enrichment.sql
```

### 2. Start Services (1 minute)

```bash
# Install dependencies
npm install

# Build
npm run build

# Start API server
npm start &

# Start webhook worker with SIRA
node dist/workers/webhookDeliveryWorker.js &
```

### 3. Test SIRA Features (3 minutes)

```bash
export TOKEN="your_api_token"
export BASE_URL="http://localhost:3073"
```

## 🤖 AI-Guided Replay

### Scenario: Webhook keeps timing out

```bash
# 1. Create a webhook
curl -X POST $BASE_URL/webhooks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "your-app-id",
    "tenantType": "merchant",
    "tenantId": "your-tenant-id",
    "url": "https://slow-endpoint.com/webhook",
    "eventTypes": ["payment.completed"]
  }'

# Response includes webhook ID and secret

# 2. Webhook fails with timeout...
# Get the failed delivery ID from logs

# 3. Ask SIRA for AI analysis
curl -X POST $BASE_URL/sira/webhooks/DELIVERY_ID/analyze-replay \
  -H "Authorization: Bearer $TOKEN"

# SIRA responds:
{
  "analysis": {
    "strategy": "reduced_payload_with_extended_timeout",
    "expectedImprovement": "Reduced payload size by 60%, extended timeout to 30s",
    "aiConfidence": 0.85
  }
}

# 4. Queue intelligent replay
curl -X POST $BASE_URL/sira/webhooks/DELIVERY_ID/replay \
  -H "Authorization: Bearer $TOKEN"

# SIRA automatically:
# - Reduces payload by 60%
# - Extends timeout to 30s
# - Uses optimal retry delay
# Result: Delivery succeeds! ✅
```

## 🛡️ Fraud Detection

### Scenario: Suspicious API key activity

```bash
# 1. Run abuse analysis on any API key
curl -X POST $BASE_URL/sira/keys/KEY_ID/analyze-abuse \
  -H "Authorization: Bearer $TOKEN"

# SIRA detects patterns automatically:
{
  "analysis": {
    "patternsDetected": 2,
    "severity": 4,
    "autoActionTaken": true
  },
  "patterns": [
    {
      "type": "geo_impossible",
      "severity": "critical",
      "confidence": 0.95,
      "details": {
        "country1": "France",
        "country2": "Brazil",
        "timeDiffMinutes": 35
      },
      "actionTaken": "perm_ban"
    },
    {
      "type": "ip_rotation",
      "severity": "high",
      "details": {
        "uniqueIps": 47,
        "totalRequests": 320
      },
      "actionTaken": "temp_ban"
    }
  ]
}

# SIRA already took action! Key is banned. ✅

# 2. View all active abuse patterns
curl -X GET $BASE_URL/sira/abuse-patterns?severity=critical \
  -H "Authorization: Bearer $TOKEN"

# 3. Mark as false positive if needed
curl -X PATCH $BASE_URL/sira/abuse-patterns/PATTERN_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "false_positive",
    "dismissReason": "Legitimate VPN usage"
  }'
```

## 📊 Adaptive Profiles

### Scenario: Monitor webhook health

```bash
# 1. Get webhook adaptive profile
curl -X GET $BASE_URL/sira/webhooks/WEBHOOK_ID/profile \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "profile": {
    "avgLatency": 245.3,
    "p95Latency": 450.2,
    "successRate": 96.8,
    "failureRate": 3.2,
    "preferredStrategy": "exponential_backoff",
    "aiHealthScore": 0.82,
    "aiRecommendations": [
      "Consider enabling payload compression",
      "Endpoint response time is optimal"
    ],
    "totalDeliveries": 12540
  }
}

# SIRA automatically adjusts retry strategy based on profile! ✅
```

## 🔒 Immutable Audit

### Scenario: Compliance audit requested

```bash
# 1. Query audit log
curl -X GET "$BASE_URL/sira/audit-log?startDate=2025-01-01&endDate=2025-12-31&limit=1000" \
  -H "Authorization: Bearer $TOKEN"

# 2. Verify integrity (hash chain)
curl -X POST $BASE_URL/sira/audit-log/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startIndex": 1,
    "endIndex": 1000
  }'

# Response:
{
  "verification": {
    "valid": true
  },
  "message": "Audit log integrity verified successfully"
}

# 3. Export for compliance
curl -X GET "$BASE_URL/sira/audit-log/export?format=csv&startDate=2025-01-01&endDate=2025-12-31" \
  -H "Authorization: Bearer $TOKEN" \
  -o audit-2025.csv

# CSV downloaded with hash verification! ✅
```

## 📝 API Version Tracking

### Scenario: Check deprecated API usage

```bash
# 1. List apps using deprecated versions
curl -X GET $BASE_URL/sira/version-contracts?deprecated=true \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "contracts": [
    {
      "appName": "ShopX",
      "apiVersion": "v1",
      "migrationStatus": "needs_upgrade",
      "recommendedVersion": "v3",
      "migrationDeadline": "2026-01-31T00:00:00Z",
      "daysUntilDeadline": 85,
      "alertSent": true
    }
  ]
}

# SIRA already sent alerts automatically! ✅
```

## 🎯 Common Use Cases

### Use Case 1: Failed Webhook Notification

```typescript
// app.ts
import { analyzeAndSuggestReplay, queueIntelligentReplay } from './services/siraEnriched';

// When webhook fails
webhookEvents.on('delivery_failed', async (deliveryId) => {
  // Get AI suggestion
  const strategy = await analyzeAndSuggestReplay(deliveryId);

  // Notify merchant
  await sendEmail({
    to: merchant.email,
    subject: 'Webhook Failure - AI Solution Available',
    body: `
      Your webhook delivery failed.

      SIRA AI Analysis:
      - Strategy: ${strategy.strategy}
      - Expected Improvement: ${strategy.expectedImprovement}
      - AI Confidence: ${(strategy.aiConfidence * 100).toFixed(0)}%

      [Click here to apply AI-guided replay]
    `
  });
});
```

### Use Case 2: Real-Time Fraud Monitoring

```typescript
// fraudMonitor.ts
import { detectAdvancedAbusePatterns } from './services/siraEnriched';

// Monitor every hour
setInterval(async () => {
  const activeKeys = await getActiveApiKeys();

  for (const key of activeKeys) {
    const patterns = await detectAdvancedAbusePatterns(key.id);

    if (patterns.length > 0) {
      // Critical patterns auto-banned by SIRA
      const critical = patterns.filter(p => p.severity === 'critical');

      if (critical.length > 0) {
        await alertSecurityTeam({
          keyId: key.id,
          patterns: critical,
          message: 'SIRA auto-banned API key due to fraud detection'
        });
      }
    }
  }
}, 3600000); // Every hour
```

### Use Case 3: Compliance Report Generation

```typescript
// complianceReport.ts
import { verifyAuditLogIntegrity } from './services/siraEnriched';

async function generateMonthlyComplianceReport() {
  const startDate = new Date('2025-01-01');
  const endDate = new Date('2025-01-31');

  // 1. Export audit log
  const auditEntries = await pool.query(
    `SELECT * FROM api_audit_log
     WHERE created_at >= $1 AND created_at <= $2
     ORDER BY chain_index ASC`,
    [startDate, endDate]
  );

  // 2. Verify integrity
  const verification = await verifyAuditLogIntegrity(
    auditEntries.rows[0].chain_index,
    auditEntries.rows[auditEntries.rows.length - 1].chain_index
  );

  // 3. Generate report
  const report = {
    period: { start: startDate, end: endDate },
    totalEntries: auditEntries.rows.length,
    integrityVerified: verification.valid,
    complianceFlags: ['PCI_DSS', 'BCEAO', 'SEC', 'GDPR'],
    fraudIncidents: await countFraudIncidents(startDate, endDate),
    hashChainValid: verification.valid
  };

  return report;
}
```

## 🧪 Testing SIRA Features

### Unit Tests

```typescript
// siraEnriched.test.ts
import { analyzeAndSuggestReplay } from './services/siraEnriched';

describe('AI-Guided Replay', () => {
  it('should suggest reduced payload for timeout errors', async () => {
    const deliveryId = 'test-delivery-timeout';
    const strategy = await analyzeAndSuggestReplay(deliveryId);

    expect(strategy.strategy).toBe('reduced_payload_with_extended_timeout');
    expect(strategy.customTimeout).toBe(30000);
    expect(strategy.aiConfidence).toBeGreaterThan(0.8);
  });

  it('should suggest JSON light for oversized payloads', async () => {
    const deliveryId = 'test-delivery-413';
    const strategy = await analyzeAndSuggestReplay(deliveryId);

    expect(strategy.strategy).toBe('json_light');
    expect(strategy.modifiedPayload).toBeDefined();
  });
});
```

## 📊 Monitoring SIRA

### Metrics to Track

```typescript
// metrics.ts
export const siraMetrics = {
  // AI Replay
  aiReplaySuccess: new Counter('sira_replay_success_total'),
  aiReplayFailure: new Counter('sira_replay_failure_total'),
  aiConfidenceScore: new Histogram('sira_ai_confidence'),

  // Fraud Detection
  fraudPatternsDetected: new Counter('sira_fraud_patterns_total'),
  autoActionsTaken: new Counter('sira_auto_actions_total'),
  falsePositives: new Counter('sira_false_positives_total'),

  // Audit
  auditEntriesWritten: new Counter('sira_audit_entries_total'),
  auditIntegrityChecks: new Counter('sira_integrity_checks_total'),
  auditIntegrityFailures: new Counter('sira_integrity_failures_total'),

  // Adaptive Profiles
  profileUpdates: new Counter('sira_profile_updates_total'),
  strategyChanges: new Counter('sira_strategy_changes_total')
};
```

### Dashboard Queries

```sql
-- Top failing webhooks (candidates for AI replay)
SELECT w.id, w.url, wp.failure_rate, wp.ai_health_score
FROM webhooks w
JOIN webhook_profiles wp ON w.id = wp.webhook_id
WHERE wp.failure_rate > 30
ORDER BY wp.failure_rate DESC
LIMIT 10;

-- Recent fraud patterns
SELECT pattern_type, COUNT(*), AVG(confidence_score)
FROM api_abuse_patterns
WHERE detected_at >= NOW() - INTERVAL '7 days'
GROUP BY pattern_type
ORDER BY COUNT(*) DESC;

-- Audit log growth
SELECT DATE(created_at) as date, COUNT(*) as entries
FROM api_audit_log
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- AI replay success rate
SELECT
  DATE(created_at) as date,
  COUNT(*) as total,
  SUM(CASE WHEN succeeded = true THEN 1 ELSE 0 END) as succeeded,
  ROUND(100.0 * SUM(CASE WHEN succeeded = true THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM webhook_replay_queue
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## 🎓 Best Practices

### 1. Enable Auto-Actions Carefully

```typescript
// Start with alerts only
SIRA_AUTO_ACTION_ENABLED=false

// Monitor for 2 weeks, review patterns
// Then enable auto-actions for specific patterns
await updateAbusePattern(patternId, { autoActionEnabled: true });
```

### 2. Review AI Suggestions

```typescript
// Always log AI decisions for review
const strategy = await analyzeAndSuggestReplay(deliveryId);

logger.info('SIRA AI Suggestion', {
  deliveryId,
  strategy: strategy.strategy,
  confidence: strategy.aiConfidence,
  improvement: strategy.expectedImprovement
});

// Queue replay only if confidence > 80%
if (strategy.aiConfidence > 0.80) {
  await queueIntelligentReplay(deliveryId, userId);
}
```

### 3. Regular Integrity Checks

```typescript
// Daily audit integrity verification
cron.schedule('0 2 * * *', async () => {
  const yesterday = await getAuditIndexRange('yesterday');
  const verification = await verifyAuditLogIntegrity(
    yesterday.startIndex,
    yesterday.endIndex
  );

  if (!verification.valid) {
    await alertSecurityTeam({
      severity: 'CRITICAL',
      message: `Audit log integrity compromised at index ${verification.brokenAt}`
    });
  }
});
```

## 🚨 Troubleshooting

### Issue: AI replay not working

```bash
# Check webhook profile exists
psql -d molam -c "SELECT * FROM webhook_profiles WHERE webhook_id = 'YOUR_WEBHOOK_ID';"

# If empty, trigger profile update
curl -X GET $BASE_URL/sira/webhooks/WEBHOOK_ID/profile -H "Authorization: Bearer $TOKEN"

# Check replay queue
psql -d molam -c "SELECT * FROM webhook_replay_queue WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10;"
```

### Issue: Fraud detection not triggering

```bash
# Check audit log has recent entries
psql -d molam -c "SELECT COUNT(*) FROM api_audit_log WHERE created_at >= NOW() - INTERVAL '24 hours';"

# If zero, ensure API calls are being logged
# Check if writeImmutableAudit() is called in middleware

# Manually trigger abuse analysis
curl -X POST $BASE_URL/sira/keys/KEY_ID/analyze-abuse -H "Authorization: Bearer $TOKEN"
```

### Issue: Audit integrity check failing

```bash
# Find broken link
psql -d molam -c "
SELECT a1.chain_index, a1.hash, a2.prev_hash
FROM api_audit_log a1
JOIN api_audit_log a2 ON a2.chain_index = a1.chain_index + 1
WHERE a2.prev_hash != a1.hash
LIMIT 1;
"

# This indicates tampering - contact security team immediately
```

## 📚 Next Steps

1. ✅ **Read Full Documentation:** [SIRA_ENRICHMENT.md](./SIRA_ENRICHMENT.md)
2. ✅ **Review Code:** [src/services/siraEnriched.ts](./src/services/siraEnriched.ts)
3. ✅ **API Reference:** [README.md](./README.md#sira-ai-enriched-features)
4. ✅ **Deploy to Production:** Follow deployment guide above

## 💡 Tips

- Start with AI suggestions in **advisory mode** (alerts only)
- Enable auto-actions after 2 weeks of monitoring
- Review false positives weekly
- Run integrity checks daily
- Export audit logs monthly for compliance

---

**Questions?** Contact sira-support@molam.com

**Brique 73 v2.1 - SIRA AI Enriched**
*Ready to deploy in production!*
