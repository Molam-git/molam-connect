# Brique 87 — Reconciliation Rules Engine & Auto-Adjustments

**Industrial-grade rules engine for automated bank statement reconciliation and adjustments**

## Overview

Brique 87 extends Brique 86 with a powerful, flexible rules engine that allows Ops teams to define, test, and activate automatic reconciliation rules without code changes.

## Key Features

### Rule Engine
- **DSL-based Conditions**: JSON-based condition language (all/any/not + operators)
- **Flexible Actions**: Auto-match, create adjustments, escalate, notify
- **Multi-Mode Operation**: dry_run → staging → active
- **Priority-based Execution**: Rules execute in priority order
- **Stop-on-Match**: Optional early termination when rule matches

### Safety & Governance
- **Multi-Signature Approval**: High-value rules require multiple approvers
- **Approval Thresholds**: Configurable amount thresholds for auto-execution
- **Dry-Run Mode**: Test rules before activation
- **Staging Mode**: Monitor rules without auto-execution
- **Immutable Audit Trail**: All executions logged

### Scope & Targeting
- **Multi-Tenant**: Bank-profile and currency-specific rules
- **Global Rules**: Apply across all banks/currencies
- **Origin Module**: Target specific payment types (payout, wallet, invoice)

## Architecture

```
Statement Line → Rules Engine → Condition Evaluator → Action Dispatcher
                      ↓                                        ↓
                 Rule Execution Log                   Ledger Adjustments
                                                       Payout Updates
                                                       Notifications
```

## Rule Types

### 1. Auto-Match by Regex
Extract references from descriptions and match payouts.

```json
{
  "condition": {
    "all": [
      {"field": "description", "op": "regex", "value": "REF:([A-Z0-9\\-]+)"},
      {"field": "reconciliation_status", "op": "equals", "value": "unmatched"}
    ]
  },
  "actions": [
    {"type": "auto_match_payout", "use_ref_group": 1, "set_payout_status": "settled"}
  ]
}
```

### 2. Auto-Adjust Fee
Create ledger adjustments for bank fees.

```json
{
  "condition": {
    "all": [
      {"field": "amount", "op": "between", "value": [100, 1000000]},
      {"field": "description", "op": "regex", "value": "FRAIS|FEE|COMMISSION"}
    ]
  },
  "actions": [
    {
      "type": "create_adjustment",
      "ledger_code": "ADJ-BANK-FEE",
      "amount_formula": "expected - settled",
      "memo": "Auto adjustment for bank fee"
    }
  ]
}
```

### 3. Partial Settlement Handler
Handle partial settlements with tolerance.

```json
{
  "condition": {
    "all": [
      {"field": "amount", "op": "lt", "value": "__expected__"},
      {"field": "amount", "op": "gte", "value": "__expected_minus_tolerance__"}
    ]
  },
  "actions": [
    {"type": "mark_payout_partial", "create_adjustment": true},
    {"type": "notify_ops", "channel": "treasury", "severity": "warning"}
  ]
}
```

### 4. Low-Value Auto-Ignore
Ignore micro-transactions below threshold.

```json
{
  "condition": {
    "all": [
      {"field": "amount", "op": "lt", "value": 1.00},
      {"field": "transaction_type", "op": "equals", "value": "credit"}
    ]
  },
  "actions": [
    {"type": "mark_ignored", "reason": "low_value_threshold"}
  ]
}
```

### 5. High-Value Escalation
Escalate high-value unmatched lines to Ops.

```json
{
  "condition": {
    "all": [
      {"field": "amount", "op": "gt", "value": 100000},
      {"field": "reconciliation_status", "op": "equals", "value": "unmatched"}
    ]
  },
  "actions": [
    {"type": "escalate_to_ops", "severity": "high"},
    {"type": "notify_ops", "channel": "treasury", "severity": "critical"}
  ]
}
```

## Condition DSL

### Logical Operators

**all** (AND):
```json
{"all": [condition1, condition2, ...]}
```

**any** (OR):
```json
{"any": [condition1, condition2, ...]}
```

**not** (NOT):
```json
{"not": condition}
```

### Comparison Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match (case-insensitive) | `{"field": "currency", "op": "equals", "value": "EUR"}` |
| `not_equals` | Not equal | `{"field": "status", "op": "not_equals", "value": "matched"}` |
| `lt` | Less than | `{"field": "amount", "op": "lt", "value": 1000}` |
| `lte` | Less than or equal | `{"field": "amount", "op": "lte", "value": 1000}` |
| `gt` | Greater than | `{"field": "amount", "op": "gt", "value": 100000}` |
| `gte` | Greater than or equal | `{"field": "amount", "op": "gte", "value": 100000}` |
| `between` | Range (inclusive) | `{"field": "amount", "op": "between", "value": [100, 1000]}` |
| `in` | In array | `{"field": "currency", "op": "in", "value": ["EUR", "USD", "GBP"]}` |
| `regex` | Regex match | `{"field": "description", "op": "regex", "value": "REF:([A-Z0-9]+)"}` |
| `contains` | String contains | `{"field": "description", "op": "contains", "value": "PAYMENT"}` |
| `starts_with` | String starts with | `{"field": "reference", "op": "starts_with", "value": "PO_"}` |
| `ends_with` | String ends with | `{"field": "reference", "op": "ends_with", "value": "_001"}` |

### Field Paths

Access nested fields with dot notation:
- `line.amount` - Statement line amount
- `line.description` - Statement line description
- `metadata.bank_code` - Custom metadata field

## Action Types

### auto_match_payout
Match payout using extracted reference.

```json
{
  "type": "auto_match_payout",
  "use_ref_group": 1,
  "regex_pattern": "REF:([A-Z0-9\\-]+)",
  "set_payout_status": "settled",
  "release_hold": true
}
```

### create_adjustment
Create ledger adjustment entry.

```json
{
  "type": "create_adjustment",
  "ledger_code": "ADJ-BANK-FEE",
  "amount_formula": "expected - settled",
  "adjustment_type": "fee_withholding",
  "memo": "Auto adjustment for bank fee"
}
```

### mark_payout_partial
Mark payout as partially settled.

```json
{
  "type": "mark_payout_partial",
  "create_adjustment": true
}
```

### mark_ignored
Mark line as ignored.

```json
{
  "type": "mark_ignored",
  "reason": "low_value_threshold"
}
```

### escalate_to_ops
Add to manual review queue.

```json
{
  "type": "escalate_to_ops",
  "severity": "high",
  "assign_to_role": "finance_ops"
}
```

### notify_ops
Send notification to Ops team.

```json
{
  "type": "notify_ops",
  "channel": "treasury",
  "severity": "critical",
  "title": "High-value unmatched transaction",
  "message": "Requires immediate review"
}
```

## API Reference

### Create Rule
```http
POST /api/rules
Content-Type: application/json

{
  "name": "Bank Fee Auto-Adjustment - CEDEAO XOF",
  "description": "Automatically adjust for bank fees on CEDEAO transfers",
  "bank_profile_id": "uuid",
  "currency": "XOF",
  "priority": 100,
  "condition": {...},
  "actions": [...],
  "mode": "dry_run",
  "approval_required": false
}
```

### List Rules
```http
GET /api/rules?bank_profile_id=uuid&mode=active&limit=50&offset=0
```

### Get Rule
```http
GET /api/rules/:id
```

### Update Rule
```http
PUT /api/rules/:id
```

### Test Rule
```http
POST /api/rules/:id/test
{
  "sample_size": 100
}
```

Response:
```json
{
  "rule": {...},
  "totalSamples": 100,
  "matchCount": 23,
  "matchRate": 23.0,
  "sampleResults": [...]
}
```

### Activate Rule
```http
POST /api/rules/:id/activate
{
  "user_id": "uuid",
  "mode": "active"
}
```

### Approve Rule
```http
POST /api/rules/:id/approve
{
  "user_id": "uuid",
  "approved": true,
  "comment": "Approved after testing"
}
```

### Get Executions
```http
GET /api/rules/:id/executions?limit=100&offset=0
```

### Get Metrics
```http
GET /api/rules/:id/metrics?date_from=2023-11-01&date_to=2023-11-30
```

## Workflow

### 1. Create Rule (Dry-Run)
```typescript
const rule = {
  name: "BankFeeAutoAdjust_SN_XOF",
  bank_profile_id: "CEDEAO_BANK_SN",
  currency: "XOF",
  condition: {
    all: [
      { field: "amount", op: "between", value: [1000, 1000000] },
      { field: "description", op: "regex", value: "FRAIS RETENU" }
    ]
  },
  actions: [
    { type: "create_adjustment", ledger_code: "ADJ-FEE", amount_formula: "expected - settled" },
    { type: "notify_ops", channel: "treasury" }
  ],
  mode: "dry_run"
};

const created = await fetch('/api/rules', {
  method: 'POST',
  body: JSON.stringify(rule)
});
```

### 2. Test Rule
```typescript
const testResults = await fetch(`/api/rules/${ruleId}/test`, {
  method: 'POST',
  body: JSON.stringify({ sample_size: 100 })
});

console.log(`Match rate: ${testResults.matchRate}%`);
```

### 3. Review Test Results
Check execution logs to verify:
- No false positives
- Actions are correct
- Formula calculations are accurate

### 4. Promote to Staging
```typescript
await fetch(`/api/rules/${ruleId}`, {
  method: 'PUT',
  body: JSON.stringify({ mode: 'staging' })
});
```

Monitor for 48 hours. Staging mode evaluates conditions but doesn't auto-execute actions.

### 5. Activate with Approval
If rule requires approval (high-value):

```typescript
// Get two approvers
await fetch(`/api/rules/${ruleId}/approve`, {
  method: 'POST',
  body: JSON.stringify({
    user_id: 'approver1_id',
    approved: true,
    comment: 'Tested on 100 samples, 95% match rate'
  })
});

await fetch(`/api/rules/${ruleId}/approve`, {
  method: 'POST',
  body: JSON.stringify({
    user_id: 'approver2_id',
    approved: true,
    comment: 'Reviewed and approved'
  })
});

// Activate
await fetch(`/api/rules/${ruleId}/activate`, {
  method: 'POST',
  body: JSON.stringify({ mode: 'active', auto_execute: true })
});
```

### 6. Monitor Performance
```typescript
const metrics = await fetch(`/api/rules/${ruleId}/metrics`);

console.log(`
  Executions: ${metrics.executions_total}
  Matches: ${metrics.matches_total}
  Match Rate: ${metrics.match_rate_pct}%
  Avg Time: ${metrics.avg_execution_time_ms}ms
  Errors: ${metrics.errors_total}
`);
```

## Performance

- **Evaluation Latency**: P50 < 5ms, P95 < 50ms per rule
- **Throughput**: 1000+ lines/sec on single worker
- **Rule Compilation**: Rules cached in memory for fast lookup
- **Horizontal Scaling**: Workers partitioned by bank_profile_id

## Security & RBAC

### Required Roles

| Action | Required Roles |
|--------|----------------|
| View rules | `ops_role` |
| Create/edit rules | `recon_ops`, `finance_ops` |
| Approve rules | `recon_ops`, `finance_ops`, `pay_admin` |
| Activate rules | `recon_ops`, `finance_ops` |
| Delete rules | `pay_admin` |

### Approval Workflow

Rules requiring approval:
- `approval_required = true`
- Amount > `approval_threshold`
- Minimum `min_approvers` signatures required
- Approvers must have appropriate roles
- Cannot approve own rule

## SIRA Integration

Rules engine sends events to SIRA:

```json
{
  "event_type": "recon.rule_executed",
  "rule_id": "uuid",
  "rule_name": "BankFeeAutoAdjust",
  "match_count": 23,
  "total_executions": 100,
  "match_rate_pct": 23.0,
  "false_positive_estimate": 0.5,
  "bank_profile_id": "uuid",
  "timestamp": "2023-11-15T10:00:00Z"
}
```

SIRA uses this data to:
- Auto-tune rule thresholds
- Suggest new rules based on patterns
- Flag low-precision rules for review
- Participate in risk scoring

## Monitoring

### Prometheus Metrics

- `rule_engine_executions_total` - Total rule executions
- `rule_engine_matches_total` - Total matches
- `rule_engine_evaluation_seconds` - Evaluation latency
- `rule_engine_errors_total` - Errors by rule
- `rule_engine_match_rate` - Match rate by rule

### Grafana Dashboard

```
┌─────────────────────────────────────────┐
│  Rules Engine Dashboard                 │
├─────────────────────────────────────────┤
│                                         │
│  Active Rules:         12               │
│  Executions (24h):     1,234            │
│  Match Rate:           94.2%            │
│  Avg Latency:          8ms              │
│                                         │
│  [Graph: Match Rate by Rule]            │
│  [Graph: Execution Volume]              │
│  [Graph: Error Rate]                    │
│                                         │
└─────────────────────────────────────────┘
```

## Testing

Run comprehensive tests:

```bash
npm run test:rules
```

Test coverage:
- ✅ Condition evaluator (all operators)
- ✅ Action dispatcher (all action types)
- ✅ Rules engine orchestration
- ✅ Approval workflow
- ✅ Dry-run mode
- ✅ Formula evaluation

## Deployment

```bash
# 1. Run migrations
psql -d molam_connect -f migrations/001_b87_rules_engine.sql

# 2. Build
npm run build

# 3. Start server (includes rules engine)
npm start

# 4. Verify
curl http://localhost:3087/health
```

## Rollback

If a rule causes issues:

```bash
# 1. Disable rule immediately
curl -X PUT http://localhost:3087/api/rules/:id \
  -d '{"enabled": false}'

# 2. Review execution logs
curl http://localhost:3087/api/rules/:id/executions

# 3. If needed, reverse actions
# (create compensating transactions)

# 4. Delete or fix rule
curl -X DELETE http://localhost:3087/api/rules/:id
```

## Best Practices

1. **Always Start with Dry-Run**: Test rules thoroughly before activation
2. **Use Staging Mode**: Monitor rule behavior without auto-execution
3. **Set Approval Thresholds**: Require human approval for high-value rules
4. **Monitor Match Rates**: Alert on sudden drops in match rate
5. **Version Rules**: Keep history of rule changes for audit
6. **Test on Historical Data**: Use `/test` endpoint with sufficient samples
7. **Start Conservative**: Begin with strict conditions, loosen gradually
8. **Document Formula**: Add clear comments to amount formulas
9. **Set Priorities**: Ensure most specific rules run first
10. **Review Regularly**: Audit rule performance monthly

## Examples

See `examples/` directory for complete rule examples:
- Bank fee adjustments (West Africa)
- Partial settlement handling (EU)
- Reference extraction patterns (global)
- High-value escalation (all regions)

## Support

- **Documentation**: `/docs/rules-engine`
- **Slack**: #brique-87-rules-engine
- **On-call**: ops-oncall@molam.com
