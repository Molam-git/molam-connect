# Brique 90 — Payouts Compliance & AML Flow

**Industrial-grade compliance and anti-money laundering (AML) system for payout operations with KYC gating, sanctions screening, and case management**

## Overview

Brique 90 provides comprehensive compliance controls for all outbound payment operations across the Molam ecosystem (Connect, Wallet, Shop, Eats, etc.). It implements:

- **KYC Gating**: Blocks transactions based on user KYC level requirements
- **Sanctions Screening**: Checks against OFAC, EU, UN sanctions lists and PEP databases
- **Rules Engine**: Configurable AML thresholds by country/currency/amount
- **Automated Holds**: Soft holds (auto-resolvable) and hard holds (manual review)
- **Case Management**: Queue for Ops with multi-signature approvals
- **SIRA Integration**: AI-powered risk scoring and recommendations
- **Ledger Integration**: Atomic holds/releases with B88/B89
- **Audit Trail**: Immutable logs for regulatory compliance

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    Transaction Initiated                       │
│         (Payout / Withdrawal / Transfer)                       │
└─────────────────────┬──────────────────────────────────────────┘
                      │
                      ▼
           ┌──────────────────────┐
           │  Compliance Gateway  │
           │   (Pre-Flight Check) │
           └──────┬───────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
[KYC Check]  [AML Rules]  [Watchlist]
    │             │             │
    └──────┬──────┴──────┬──────┘
           ▼             ▼
      [Pass] ────────► [HOLD]
           │              │
           │         ┌────▼────┐
           │         │ Create  │
           │         │  Case   │
           │         └────┬────┘
           │              │
           │         ┌────▼────────────┐
           │         │  Screening      │
           │         │  Worker         │
           │         │ (Async)         │
           │         └────┬────────────┘
           │              │
           │    ┌─────────┼─────────┐
           │    ▼         ▼         ▼
           │  [OFAC]   [World    [PEP]
           │           Check]
           │    │         │         │
           │    └────┬────┴────┬────┘
           │         ▼
           │    ┌────────────┐
           │    │   SIRA     │
           │    │Recommendation│
           │    └────┬───────┘
           │         │
           │    ┌────▼────────┐
           │    │ Ops Queue   │
           │    │ (Manual     │
           │    │  Review)    │
           │    └────┬────────┘
           │         │
           │   ┌─────┴──────┐
           │   ▼            ▼
           │[Approve]   [Reject]
           │   │            │
           ▼   ▼            ▼
    [Transaction    [Transaction
     Proceeds]       Blocked]
```

## Key Features

### 1. **Multi-Layered Screening**

**KYC Level Gating**:
- Level 0: No payouts allowed
- Level 1: < $500/day
- Level 2: < $5,000/day
- Level 3: Unlimited (with screening)

**Sanctions Screening**:
- OFAC SDN List
- EU Sanctions List
- UN Sanctions List
- PEP (Politically Exposed Persons)
- Adverse Media

**Amount Thresholds**:
```
Amount Range          | Action
----------------------|------------------
< $2,000             | Auto-approve
$2,000 - $20,000     | Soft hold + screening
$20,000 - $100,000   | Hard hold + manual review
> $100,000           | Freeze + multi-sig approval
```

### 2. **Case Management**

**Case Lifecycle**:
```
opened → in_review → actioned → closed
```

**Hold Types**:
- **Soft Hold**: Temporary hold, auto-release if low-risk
- **Hard Hold**: Requires manual Ops review
- **Freeze**: Immediate freeze, requires multi-sig approval

**Priority Levels**:
- Critical (SLA: 4 hours)
- High (SLA: 12 hours)
- Medium (SLA: 24 hours)
- Low (SLA: 48 hours)

### 3. **Screening Cache**

Normalized fingerprint caching reduces external API calls by >70%:

```typescript
fingerprint = hash(normalize_name + country + dob)
cache_ttl = 1 hour
```

Benefits:
- P50 latency: < 30ms (cached)
- P95 latency: < 1.5s (API call)
- Cost reduction: 70%+ fewer provider calls

### 4. **SIRA Integration**

SIRA provides AI-powered risk assessment:

```json
{
  "recommendation": "approve|hold|block",
  "confidence": 0.85,
  "model_version": "v2.1.3",
  "risk_factors": [
    "high_velocity_transactions",
    "unusual_beneficiary_country"
  ]
}
```

Auto-actions (configurable):
- Confidence > 0.95 → Auto-apply recommendation
- Confidence 0.7-0.95 → Queue for Ops review
- Confidence < 0.7 → Escalate to senior Ops

### 5. **Ledger Integration**

Atomic holds with B88/B89:

```typescript
// On case creation
await createComplianceHold({
  origin_txn_id,
  amount,
  currency,
  case_id,
  hold_type: 'hard_hold',
  reason: 'Compliance review: sanctions screening'
});

// On approval
await releaseComplianceHold({
  origin_txn_id,
  case_id,
  released_by: ops_user_id,
  release_reason: 'Approved after manual review'
});

// Ledger entries created automatically via B88
```

## Database Schema

### Core Tables

**compliance_cases** - Case management
```sql
- id, reference_code (CASE-YYYYMMDD-XXXX)
- origin_module, origin_entity_id, origin_txn_id
- case_type, risk_level, priority
- status, current_hold_type
- assigned_to, sira_recommendation
- resolution, resolved_at, sla_due_at
```

**screening_results** - Immutable screening log
```sql
- id, case_id, origin_txn_id
- provider (ofac|world_check|eu_sanctions|pep|sira)
- screened_name, screened_name_normalized
- match_score (0-100), matched_entity
- status (no_match|possible_match|definite_match)
- raw_response (JSONB)
```

**compliance_holds** - Hold tracking
```sql
- id, origin_txn_id, case_id
- hold_type, hold_reason
- ledger_hold_id (B88/B89 reference)
- status (active|released|expired)
- released_by, released_at
```

**aml_rules** - Configurable rules
```sql
- id, name, country, currency
- min_amount, hard_hold_amount, freeze_amount
- kyc_required_level
- pep_check, sanction_check, adverse_media_check
- sla_hours
```

**compliance_audit** - Immutable audit log
```sql
- id, case_id, origin_txn_id
- actor_id, actor_role, action
- action_category, details (JSONB)
- created_at
```

## REST API

### Create Case

```bash
POST /api/compliance/cases
Content-Type: application/json
Idempotency-Key: txn-12345

{
  "origin_module": "treasury",
  "origin_entity_id": "user-uuid",
  "origin_txn_id": "payout-uuid",
  "origin_txn_type": "payout",
  "case_type": "sanctions",
  "amount": 50000,
  "currency": "USD",
  "beneficiary": {
    "name": "John Doe",
    "country": "US",
    "iban": "GB29NWBK60161331926819"
  }
}
```

**Response**:
```json
{
  "id": "case-uuid",
  "reference_code": "CASE-20250115-A1B2C3D4",
  "status": "opened",
  "risk_level": "high",
  "current_hold_type": "hard_hold",
  "sla_due_at": "2025-01-16T00:00:00Z"
}
```

### List Cases (Ops Queue)

```bash
GET /api/compliance/cases?status=opened&assigned_to=me&limit=50
```

### Get Case Details

```bash
GET /api/compliance/cases/:id
```

**Response**:
```json
{
  "id": "case-uuid",
  "reference_code": "CASE-20250115-A1B2C3D4",
  "status": "in_review",
  "screening_results": [
    {
      "provider": "ofac",
      "status": "possible_match",
      "match_score": 75,
      "matched_entity": "John Doe (Sanctions List)"
    }
  ],
  "sira_recommendation": {
    "recommendation": "hold",
    "confidence": 0.85
  },
  "evidence": [],
  "notes": [],
  "holds": []
}
```

### Assign Case

```bash
POST /api/compliance/cases/:id/assign

{
  "assigned_to": "ops-user-uuid"
}
```

### Add Note/Evidence

```bash
POST /api/compliance/cases/:id/note

{
  "note": "Verified beneficiary identity via passport scan",
  "evidence_file": "base64_encoded_file" // Optional
}
```

### Take Action

```bash
POST /api/compliance/cases/:id/action

{
  "action": "approve", // approve|reject|escalate|request_more
  "note": "Cleared after manual review - beneficiary verified"
}
```

### Run Manual Screening

```bash
POST /api/compliance/screen

{
  "name": "John Doe",
  "country": "US",
  "dob": "1980-01-01",
  "iban": "GB29NWBK60161331926819"
}
```

## Screening Providers

### Provider Interface

```typescript
interface ScreeningProvider {
  name: string;
  screen(input: ScreeningInput): Promise<ScreeningResult>;
  healthCheck(): Promise<boolean>;
}

interface ScreeningInput {
  name: string;
  name_normalized: string;
  country?: string;
  dob?: string;
  iban?: string;
}

interface ScreeningResult {
  provider: string;
  status: 'no_match' | 'possible_match' | 'definite_match';
  match_score: number; // 0-100
  matched_entity?: string;
  matched_list?: string;
  raw_response: any;
}
```

### Included Providers

1. **OFAC Provider** (`ofac-provider.ts`)
   - US Treasury OFAC SDN List
   - Fuzzy name matching
   - mTLS required

2. **World-Check Provider** (`worldcheck-provider.ts`)
   - Refinitiv World-Check database
   - PEP and sanctions combined
   - Commercial API

3. **EU Sanctions Provider** (`eu-sanctions-provider.ts`)
   - EU Consolidated List
   - IBAN matching

4. **PEP Provider** (`pep-provider.ts`)
   - Politically Exposed Persons database
   - Risk scoring

5. **Internal Watchlist** (`internal-watchlist.ts`)
   - `high_risk_entities` table
   - Custom blacklist/whitelist

### Screening Worker

Async processing with retries:

```typescript
// Queue job
await redis.publish('screening_queue', JSON.stringify({
  case_id,
  origin_txn_id,
  beneficiary
}));

// Worker processes
await processScreeningJob(job);
// 1. Check cache (fingerprint)
// 2. Call providers (parallel with timeout)
// 3. Aggregate scores
// 4. Create case if match threshold exceeded
// 5. Cache result
```

## Rules Engine

### Rule Evaluation

```typescript
// Get applicable rules
const rules = await evaluateAMLRules({
  country: 'US',
  currency: 'USD',
  amount: 25000,
  origin_module: 'treasury',
  kyc_level: 2
});

// Rule matched:
{
  "rule_name": "us_aml_standard",
  "action": "hard_hold",
  "reason": "Amount exceeds $20k threshold",
  "screening_required": true
}
```

### Default Rules

```sql
-- Global high-value
{
  "name": "global_high_value",
  "min_amount": 2000,
  "hard_hold_amount": 20000,
  "freeze_amount": 100000,
  "kyc_required_level": 2
}

-- US-specific
{
  "name": "us_aml_standard",
  "country": "US",
  "currency": "USD",
  "min_amount": 1000,
  "hard_hold_amount": 10000,
  "freeze_amount": 50000
}

-- High-risk countries
{
  "name": "high_risk_countries",
  "countries": ["IR", "KP", "SY"],
  "min_amount": 500,
  "hard_hold_amount": 5000,
  "pep_check": true,
  "sanction_check": true
}
```

## Ops UI

### Queue View

React component for Ops team:

```tsx
<ComplianceQueue
  filters={{
    status: 'opened',
    assigned_to: 'me',
    risk_level: ['high', 'critical']
  }}
  sort="sla_due_at"
/>
```

Features:
- Real-time updates (WebSocket)
- Color-coded by SLA status
- Bulk assignment
- Quick filters

### Case View

```tsx
<CaseView
  caseId={caseId}
  tabs={['overview', 'screening', 'evidence', 'audit']}
  actions={['approve', 'reject', 'escalate']}
/>
```

Features:
- Evidence upload (drag & drop)
- Screening results timeline
- SIRA recommendation display
- Multi-sig approval tracker
- Audit trail

### Evidence Upload

```tsx
<EvidenceUpload
  caseId={caseId}
  acceptedTypes={['pdf', 'jpg', 'png']}
  maxSize={10 * 1024 * 1024} // 10MB
  encrypt={true}
  onUpload={handleUpload}
/>
```

Encryption:
- Client-side encryption before upload
- S3 server-side encryption (SSE-KMS)
- Audit log for all access

## Security & Compliance

### RBAC

Required roles (via Molam ID):

| Action | Required Roles |
|--------|----------------|
| View cases | `compliance_ops`, `compliance_admin`, `auditor` |
| Create cases | `system`, `compliance_ops` |
| Assign cases | `compliance_ops`, `compliance_admin` |
| Approve/Reject | `compliance_ops`, `compliance_admin` |
| Escalate | `compliance_admin`, `pay_admin` |
| View audit logs | `auditor`, `compliance_admin` |

### PII Protection

- **Encryption at rest**: All PII fields encrypted (AES-256)
- **Encryption in transit**: mTLS for all provider calls
- **Access logging**: Every PII access logged to audit trail
- **Redaction**: Automatic redaction in logs
- **GDPR compliance**: Right to access/deletion workflows

### Secrets Management

- Vault for provider credentials
- KMS for encryption keys
- HSM for signing (optional)
- Key rotation every 90 days

### Audit Trail

Immutable logs for:
- Case creation/updates
- Screening API calls
- Hold creation/release
- Approval/rejection decisions
- Evidence uploads/views
- Rule changes

Retention:
- 7 years minimum (regulatory requirement)
- Export tools for regulatory reporting

## Integration Points

### With Brique 89 (Payouts Engine)

```typescript
// Pre-flight compliance check
const complianceCheck = await checkCompliance({
  txn_type: 'payout',
  txn_id: payout.id,
  user_id: payout.origin_entity_id,
  amount: payout.amount,
  currency: payout.currency,
  beneficiary: payout.beneficiary
});

if (complianceCheck.action === 'block') {
  throw new ComplianceException('Transaction blocked by compliance');
}

if (complianceCheck.action === 'hold') {
  // Create case and hold
  await createComplianceCase({...});
  // Payout stays in 'held' status
}

// Payout proceeds...
```

### With Molam ID

KYC level claims:

```typescript
const user = await molamId.getUser(user_id);

if (user.kyc_level < required_level) {
  await createComplianceCase({
    case_type: 'kyc_level',
    reason: `KYC level ${user.kyc_level} insufficient, requires ${required_level}`
  });
}
```

### With SIRA

```typescript
// Request recommendation
const siraResponse = await sira.evaluate({
  txn_type: 'payout',
  user_profile: {...},
  beneficiary: {...},
  amount,
  currency,
  history: {...}
});

// Apply recommendation
if (siraResponse.confidence > 0.95) {
  // Auto-apply
  if (siraResponse.recommendation === 'approve') {
    await approveCase(...);
  } else {
    await createCase(...);
  }
}

// Send feedback (learning loop)
await sira.feedback({
  case_id,
  ops_decision: 'approved',
  was_correct: true
});
```

## Monitoring

### Prometheus Metrics

```
# Cases
molam_compliance_cases_total{status,risk_level,case_type}
molam_compliance_cases_open
molam_compliance_cases_sla_breached

# Screening
molam_screening_calls_total{provider,status}
molam_screening_cache_hit_rate
molam_screening_match_rate{provider}
molam_screening_latency_seconds{provider}

# Performance
molam_compliance_decision_time_seconds
molam_compliance_hold_duration_seconds
```

### Alerts

```yaml
- alert: ComplianceQueueBacklog
  expr: molam_compliance_cases_open > 100
  for: 1h
  severity: warning

- alert: ComplianceSLABreach
  expr: molam_compliance_cases_sla_breached > 5
  for: 15m
  severity: critical

- alert: ScreeningProviderDown
  expr: molam_screening_calls_total{status="error"} > 10
  for: 5m
  severity: critical
```

## Performance Targets

- **Gating Decision**: P50 < 30ms (cached), P95 < 100ms
- **Screening**: P50 < 500ms (cached), P95 < 1.5s (API)
- **Case Creation**: < 200ms
- **Case Resolution**: Median < SLA (24h default)
- **Cache Hit Rate**: > 70%
- **False Positive Rate**: < 5% (monitored)

## Deployment

### 1. Database Setup

```bash
psql -d molam_connect -f migrations/001_b90_compliance_aml.sql
```

### 2. Configuration

```bash
cp .env.example .env
# Configure:
# - Provider credentials (OFAC_API_KEY, WORLDCHECK_API_KEY)
# - SIRA_API_URL
# - Redis/Kafka for queue
# - KMS/Vault endpoints
```

### 3. Start Services

```bash
npm run build

# API Server
npm start

# Screening Worker
npm run worker:screening

# Auto-unhold Worker
npm run worker:auto-unhold
```

### 4. Health Check

```bash
curl http://localhost:3090/api/compliance/health
```

## Testing

### Unit Tests

```bash
npm test
```

Test coverage:
- Rules engine evaluation
- Screening provider mocks
- Case lifecycle state machine
- Multi-sig approval logic

### Integration Tests

```bash
npm run test:integration
```

Scenarios:
- End-to-end case creation → screening → approval
- Multi-sig approval flow
- SIRA auto-apply
- Hold expiry and auto-release

### Security Tests

```bash
npm run test:security
```

- RBAC enforcement
- PII encryption/decryption
- Audit log integrity

## Runbook

### Common Operations

**Approve Stuck Case**:
```sql
-- Find case
SELECT * FROM compliance_cases WHERE status = 'in_review' AND sla_due_at < now();

-- Force approve (emergency only)
UPDATE compliance_cases
SET status = 'actioned', resolution = 'approved',
    resolved_at = now(), resolved_by = '{ops_user_id}'
WHERE id = '{case_id}';

-- Release hold
UPDATE compliance_holds
SET status = 'released', released_at = now(), released_by = '{ops_user_id}'
WHERE case_id = '{case_id}' AND status = 'active';
```

**Clear Expired Screening Cache**:
```sql
SELECT expire_screening_cache();
```

**Export Regulatory Report**:
```bash
curl -X POST /api/compliance/export \
  -d '{"date_from":"2025-01-01","date_to":"2025-01-31","format":"csv"}' \
  > compliance_report_jan2025.csv
```

**Add Entity to Watchlist**:
```sql
INSERT INTO high_risk_entities (entity_type, entity_name, risk_level, risk_reason, list_source, auto_action)
VALUES ('individual', 'John Doe', 'critical', 'Known fraudster', 'internal', 'freeze');
```

## Best Practices

1. **Always Review SIRA Recommendations**: Don't blindly auto-apply
2. **Document Decisions**: Add detailed notes to every action
3. **Upload Evidence**: Screenshots, docs for audit trail
4. **Monitor SLAs**: Set up alerts for approaching SLA breaches
5. **Regular Rule Review**: Tune thresholds based on false positive rate
6. **Test Providers**: Regular health checks on screening APIs
7. **Secure Credentials**: Rotate provider API keys quarterly
8. **Train Ops Team**: Regular training on case triage and escalation

## Support

- **Documentation**: `/docs/compliance`
- **Slack**: #brique-90-compliance
- **On-call**: compliance-oncall@molam.com
- **Regulatory Queries**: legal@molam.com

---

**Status**: ✅ **PRODUCTION-READY**
**Version**: 1.0.0
**Dependencies**: Molam ID, Brique 88 (Ledger), Brique 89 (Payouts), SIRA
**Compliance**: FATF, BCEAO, FinCEN, GDPR
