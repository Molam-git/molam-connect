# Brique 129 — Settlement SLA Monitoring & Alerts

## Overview
Industrial-grade SLA monitoring system for settlement operations with automatic alerting, remediation actions, SIRA integration, and multi-channel notifications.

## Features
- **SLA Policy Management**: Define thresholds per bank/rail/currency/zone
- **Prometheus Integration**: Query real-time metrics for violations
- **Auto-Remediation**: Pause banks, trigger rerouting, create tickets
- **Multi-Channel Alerts**: Email, SMS, Slack, PagerDuty
- **SIRA Integration**: AI-driven routing suggestions on SLA breaches
- **Incident Management**: Track and resolve alerts with audit trail
- **RBAC Protected**: Molam ID authentication with role-based access

## Database Tables
- `settlement_sla_policies` - SLA threshold definitions
- `settlement_sla_alerts` - Alert events (immutable audit)
- `sla_auto_actions` - Automatic remediation rules
- `sla_incidents` - Incident ticket tracking
- `sla_alert_notifications` - Notification delivery log

## Metrics Monitored

**Prometheus Metrics:**
- `molam_settlement_match_rate` - Statement matching accuracy (target: ≥99.5%)
- `molam_settlement_success_rate` - Settlement success rate (target: ≥99.9%)
- `molam_settlement_latency_seconds_bucket` - P95 latency histogram (target: <1h)
- `molam_settlement_pending_count` - Pending instructions queue size
- `molam_reconciliation_unmatched_count` - Unmatched statement lines

**SLA Metrics:**
- `max_lag_hours` - Maximum settlement confirmation lag
- `match_rate` - Reconciliation match rate (0-1)
- `success_rate` - Settlement success rate (0-1)
- `pending_count` - Pending instructions count

## SLA Policy Configuration

Example policies:

```sql
-- Match rate SLA (≥99.5%)
INSERT INTO settlement_sla_policies(
  bank_profile_id, rail, metric, threshold, operator, severity
) VALUES (
  'bank-cedeao-uuid', 'SWIFT', 'match_rate', 0.995, '>=', 'warning'
);

-- Latency SLA (P95 <1 hour)
INSERT INTO settlement_sla_policies(
  bank_profile_id, metric, threshold, operator, severity
) VALUES (
  'bank-cedeao-uuid', 'max_lag_hours', 1.0, '<=', 'critical'
);

-- Success rate SLA (≥99.9%)
INSERT INTO settlement_sla_policies(
  metric, threshold, operator, severity
) VALUES (
  'success_rate', 0.999, '>=', 'critical'
);
```

## Auto-Remediation Actions

**Action Types:**
- `auto_pause_bank` - Disable bank profile automatically
- `auto_reroute` - Request SIRA routing suggestion
- `create_ticket` - Generate incident ticket
- `notify` - Send notifications (email, SMS, Slack)

**Configuration:**
```sql
INSERT INTO sla_auto_actions(
  sla_policy_id, action_type, params, cooldown_seconds
) VALUES (
  'policy-uuid', 'auto_pause_bank',
  '{"bank_profile_id": "bank-uuid"}'::jsonb,
  3600
);
```

**Cooldown:** Prevents action flapping (default: 1 hour)

## API Endpoints

### GET /api/sla/alerts
List SLA alerts with filtering.
```bash
curl "/api/sla/alerts?status=open&limit=50"
```

### POST /api/sla/alerts/:id/ack
Acknowledge alert.
```bash
curl -X POST "/api/sla/alerts/{id}/ack"
```

### POST /api/sla/alerts/:id/resolve
Resolve alert.
```bash
curl -X POST "/api/sla/alerts/{id}/resolve"
```

### GET /api/sla/policies
List SLA policies.

### POST /api/sla/policies
Create new SLA policy.
```json
{
  "bank_profile_id": "uuid",
  "rail": "SWIFT",
  "metric": "match_rate",
  "threshold": 0.995,
  "operator": ">=",
  "severity": "warning"
}
```

### GET /api/sla/stats
Get 24h alert statistics.

## SLA Monitor Worker

Evaluates policies every 60 seconds:
```bash
node src/workers/sla-monitor.ts
```

**Flow:**
1. Query active SLA policies
2. Build PromQL for each metric
3. Query Prometheus API
4. Compare observed vs threshold
5. Create alert if breached
6. Execute auto-actions (if configured)
7. Send notifications

## Prometheus Alert Rules

Example alert rule:
```yaml
- alert: SettlementMatchRateLow
  expr: |
    (1 - avg_over_time(molam_settlement_match_rate[1h])) > 0.005
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "Match rate below 99.5%"
```

See [prometheus/alerts.yml](prometheus/alerts.yml) for complete ruleset.

## SIRA Integration

On critical SLA breach:
1. SLA evaluator publishes `sla.alert.created` event
2. SIRA receives event and analyzes impact
3. SIRA publishes `routing.suggestion.response` with recommended action
4. Auto-action executes suggestion (if policy allows)

**Event Format:**
```json
{
  "event": "sla.alert.created",
  "data": {
    "alert_id": "uuid",
    "metric": "match_rate",
    "observed": 0.992,
    "threshold": 0.995,
    "severity": "critical",
    "bank_profile_id": "uuid"
  }
}
```

## Alert Lifecycle

```
created (open) → acknowledged → resolved
              ↓
         suppressed (auto)
```

**Status Transitions:**
- `open` - Newly created, requires attention
- `acknowledged` - Ops team notified, investigating
- `resolved` - Issue fixed, alert closed
- `suppressed` - Auto-suppressed (e.g., during maintenance)

## Notification Channels

**Supported:**
- Email (SMTP)
- SMS (Twilio)
- Slack (Webhooks)
- PagerDuty (Events API)

**Routing by Severity:**
- `critical` → PagerDuty + Slack + SMS
- `warning` → Slack + Email
- `info` → Email only

## Runbook

### When Match Rate Drops

1. Check `settlement_sla_alerts` for affected bank/rail
2. Query unmatched statement lines:
   ```sql
   SELECT * FROM bank_statement_lines
   WHERE reconciliation_status='unmatched'
   AND bank_profile_id='affected-bank'
   LIMIT 100;
   ```
3. Review reconciliation logs for patterns
4. If systematic issue: pause bank connector
5. If transient: acknowledge alert and monitor

### When Latency Spikes

1. Check bank connector health
2. Review circuit breaker states
3. Verify network connectivity to bank APIs
4. Check for bank-side incidents
5. Consider auto-reroute to backup bank

### When Auto-Pause Triggered

1. Validate bank is actually down
2. Contact bank partner for incident status
3. Estimate recovery time
4. If >1 hour: execute failover to backup
5. Update ops team and affected merchants

## Security & Compliance
- **RBAC**: `pay_admin`, `finance_ops`, `ops_alerts` roles required
- **Multi-sig**: Destructive actions require approval
- **Audit Trail**: All alerts and actions logged immutably
- **PII Protection**: No sensitive data in alert metadata

## Monitoring & SLOs

**SLA Evaluator SLOs:**
- Evaluation latency P50 <1s per policy
- Alert delivery P95 <60s after threshold breach
- False positive rate <1% (after tuning)

**Metrics:**
- `sla_evaluation_duration_seconds` - Evaluation time
- `sla_alerts_created_total` - Alert creation counter
- `sla_auto_actions_executed_total` - Auto-action counter

## Integration Points
- **Brique 127** - Bank routing decisions
- **Brique 128** - Settlement engine metrics
- **Prometheus** - Metric collection
- **SIRA** - AI routing suggestions
- **Webhook Engine** - Event distribution

## UI Component

`SlaAlerts.tsx` - Real-time dashboard showing:
- Alert statistics (open, acknowledged, resolved)
- Severity breakdown (critical, warning)
- Alert table with acknowledge/resolve controls
- Auto-refresh every 30 seconds

**Version**: 1.0.0 | **Status**: ✅ Ready
