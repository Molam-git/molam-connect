# Brique 47 - Disputes & Chargebacks

**Network Ingestion | Evidence WORM | SIRA Scoring | Ops Workflow | Settlement Automation**

Système industriel complet de gestion des litiges et chargebacks pour Molam Connect avec workflow Ops robuste, preuves immuables, intégration SIRA pour scoring/priorisation, et settlement automatique (credit notes, ledger adjustments, payout impacts).

## Position dans l'écosystème

```
Molam Pay (Module majeur)
├── Connect (Brique 41) - Comptes marchands
├── Connect Payments (Brique 42) - Traitement paiements
├── Checkout (Brique 43) - Orchestration
├── Anti-fraude (Brique 44) - Détection fraude temps réel
├── Webhooks (Brique 45) - Event delivery
├── Billing (Brique 46) - Facturation
└── Disputes & Chargebacks (Brique 47) - Gestion litiges ✅ NOUVEAU
```

## Fonctionnalités

### Ingestion Multi-Sources
- **Card Networks**: Visa, Mastercard (mTLS + signed payload)
- **Acquirers/Banks**: Direct integration avec vérification signature
- **Internal**: Disputes initiés par Molam Ops
- **Idempotence**: Par external_dispute_id (pas de duplicatas)

### Evidence Management (WORM)
- **Upload sécurisé**: Multipart avec hash SHA256
- **Stockage immutable**: S3 Object Lock ou versioning
- **Types supportés**: receipt, delivery_proof, communication_log, photo, video
- **Audit trail**: Chaque upload loggé dans investigations

### SIRA Integration
- **Score automatique**: 0-100 sur réception dispute
- **Priorisation**: High priority si score >80 OU amount >1000 USD
- **Recommandations ML**: Outcome predictions avec confiance
- **Learning loop**: Outcomes → SIRA training data

### Ops Workflow
- **Auto-assignment**: High priority → Ops queue automatique
- **SLA tracking**: Evidence deadline (default 5 jours)
- **Manual review**: Investigation UI avec timeline complète
- **Escalation**: Legal/SIRA pour cas complexes

### Settlement Automation
**merchant_won**:
- Release provisional hold
- Refund dispute fee (selon policy)
- Emit webhook: dispute.resolved

**cardholder_won**:
- Create chargeback record
- Post ledger entries (debit merchant, credit network)
- Generate credit_note via Billing (B46)
- Notify Treasury for payout adjustments
- Emit webhooks: dispute.resolved + chargeback.posted

**partial**:
- Pro-rata adjustments
- Partial credit_note
- Split settlement

## Architecture

```
brique-47/
├── migrations/
│   └── 001_b47_disputes.sql           # 5 tables
│
├── src/
│   ├── server.ts                       # Express API (port 8047)
│   │
│   ├── utils/
│   │   ├── db.ts                       # PostgreSQL connection
│   │   ├── authz.ts                    # JWT auth + RBAC
│   │   ├── s3.ts                       # WORM evidence storage
│   │   └── security.ts                 # mTLS + signature verification
│   │
│   ├── disputes/
│   │   ├── ingest.ts                   # Network/acquirer ingest
│   │   ├── processor.ts                # Auto-processing + SIRA
│   │   ├── decision.ts                 # Settlement logic
│   │   └── sira.ts                     # SIRA integration
│   │
│   ├── routes/
│   │   ├── disputes.ts                 # Merchant + ingest endpoints
│   │   ├── evidence.ts                 # Evidence upload/download
│   │   └── ops.ts                      # Ops dashboard API
│   │
│   └── workers/
│       └── dispute-processor.ts        # Background processing
│
└── web/
    └── src/
        ├── MerchantDisputes.tsx        # Merchant dispute portal
        └── OpsDisputes.tsx             # Ops investigation dashboard
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (5 tables)
- **Storage**: AWS S3 (WORM compliance) or local file storage
- **Authentication**: JWT (RS256) via Molam ID + mTLS for networks
- **Security**: RBAC (merchant_admin, pay_admin, ops_disputes, auditor)
- **AI**: SIRA integration for scoring and recommendations
- **Observability**: Prometheus metrics

## Installation

### 1. Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 2. Install dependencies
```bash
cd brique-47
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with:
# - DATABASE_URL
# - MOLAM_ID_JWT_PUBLIC
# - S3 credentials or USE_LOCAL_STORAGE=true
# - SIRA_URL (or MOCK_SIRA=true)
# - Network credentials (ACQUIRER_VISA_PUBLIC_KEY, etc.)
```

### 4. Create database
```bash
createdb molam_disputes
```

### 5. Run migrations
```bash
npm run migrate
```

### 6. Start services
```bash
# API Server
npm run dev  # Port 8047

# Dispute Processor Worker (in separate terminal)
npm run worker:processor
```

## API Endpoints

### Network/Acquirer Ingestion (mTLS)

- `POST /api/connect/disputes/ingest` - Ingest dispute from network

**Request**:
```json
{
  "external_dispute_id": "NET-VISA-123456",
  "payment_reference": "pay_abc123",
  "merchant_id": "merchant-uuid",
  "amount": 99.99,
  "currency": "USD",
  "reason_code": "FRAUD",
  "occurred_at": "2025-01-15T10:30:00Z"
}
```

**Security**: Requires mTLS + HMAC signature verification

### Merchant Portal

- `GET /api/connect/merchants/:merchantId/disputes` - List merchant disputes
- `GET /api/connect/disputes/:id` - View dispute details
- `POST /api/connect/disputes/:id/evidence` - Upload evidence (multipart)

### Ops Dashboard

- `GET /api/ops/disputes/queue` - Ops investigation queue
- `POST /api/ops/disputes/:id/assign` - Assign to ops agent
- `POST /api/connect/disputes/:id/decision` - Post decision (merchant_won/cardholder_won/partial)
- `POST /api/connect/disputes/:id/escalate` - Escalate to SIRA/Legal

### Evidence Management

- `POST /api/connect/disputes/:id/evidence` - Upload evidence
- `GET /api/connect/disputes/:id/evidence` - List evidence
- `GET /api/connect/evidence/:evidenceId/download` - Download (signed URL)

## Workflow

### 1. Dispute Ingestion

```bash
# From card network/acquirer
POST /api/connect/disputes/ingest
```

**Process**:
1. Verify mTLS certificate
2. Validate HMAC signature
3. Check idempotence (external_dispute_id)
4. Insert into disputes table (status: `received`)
5. Emit webhook: `dispute.received`
6. Trigger background processor

### 2. Auto-Processing (Worker)

```bash
npm run worker:processor
```

**Process**:
1. Fetch dispute details
2. Enrich with payment + merchant data
3. Call SIRA: `POST /sira/assess_dispute`
4. Calculate priority (score + amount thresholds)
5. If high priority → auto-assign to Ops queue
6. Send evidence request to merchant
7. Update status: `evidence_requested`
8. Emit webhook: `dispute.evidence_requested`

### 3. Merchant Evidence Submission

```bash
POST /api/connect/disputes/{id}/evidence
```

**Process**:
1. Authenticate merchant (JWT)
2. Validate file (size, type)
3. Calculate SHA256 hash
4. Upload to S3 (WORM)
5. Insert dispute_evidence record
6. Log investigation action
7. Emit webhook: `dispute.evidence_submitted`
8. Trigger SIRA analysis

### 4. Ops Decision

```bash
POST /api/connect/disputes/{id}/decision
```

**Request**:
```json
{
  "outcome": "cardholder_won",
  "outcome_amount": 99.99,
  "note": "Insufficient evidence provided"
}
```

**Process**:
1. Update dispute (outcome, outcome_amount)
2. Insert investigation log
3. Execute settlement flow based on outcome

**If cardholder_won**:
- Create chargeback record
- Post ledger entries (debit merchant account)
- Call Billing API: create credit_note
- Notify Treasury for payout adjustment
- Emit webhooks: `dispute.resolved` + `chargeback.posted`

**If merchant_won**:
- Release any provisional hold
- Refund dispute fee (if policy allows)
- Emit webhook: `dispute.resolved`

**If partial**:
- Pro-rata adjustments
- Partial credit_note
- Emit webhook: `dispute.resolved`

## Database Schema

### disputes (17 fields)
- Core dispute record
- Status: received → evidence_requested → under_review → decided → closed
- Outcome: merchant_won | cardholder_won | partial
- SIRA score, evidence deadline

### dispute_evidence (11 fields)
- Immutable evidence documents
- SHA256 hash for integrity
- S3 key with WORM storage
- Uploaded by: merchant | ops | system

### dispute_investigations (7 fields)
- Complete audit trail
- Every action logged (assign, note, escalate, decision, evidence)
- Actor tracking (ops, sira, system, merchant)

### chargebacks (9 fields)
- Posted chargebacks for reconciliation
- Bank reference, amount, currency
- Status: posted | reversed | recovered

### dispute_assignments (9 fields)
- Ops team workload tracking
- Priority: low | normal | high | critical
- SLA monitoring

## Security & Compliance

### Network Ingestion Security
1. **mTLS**: Mutual TLS authentication
2. **Signature Verification**: HMAC SHA256 with network keys
3. **IP Whitelisting**: Network-specific IP ranges
4. **Rate Limiting**: Per-network quotas

### Evidence Security
1. **WORM Storage**: Write-Once-Read-Many compliance
2. **Hash Verification**: SHA256 on upload and download
3. **Signed URLs**: Temporary access (5 minutes)
4. **Audit Trail**: Every access logged

### RBAC Roles
- **merchant_admin**: View disputes, upload evidence
- **pay_admin**: Full access, post decisions
- **ops_disputes**: Investigate, assign, recommend
- **auditor**: Read-only access to all data

## SIRA Integration

### Score Dispute
```typescript
// POST /sira/assess_dispute
{
  "dispute_id": "uuid",
  "merchant_id": "uuid",
  "amount": 99.99,
  "currency": "USD",
  "reason_code": "FRAUD",
  "payment_data": { ... },
  "merchant_history": { ... }
}

// Response
{
  "score": 85,
  "confidence": 0.92,
  "recommended_outcome": "cardholder_won",
  "flags": ["high_risk_merchant", "velocity_spike"],
  "factors": [
    { "name": "merchant_dispute_rate", "weight": 0.3 },
    { "name": "transaction_pattern", "weight": 0.25 }
  ]
}
```

### Merchant Risk Score
```typescript
// GET /sira/score?merchantId=...
{
  "score": 75,
  "dispute_count_30d": 12,
  "dispute_rate": 0.08,
  "avg_resolution_time_hours": 72
}
```

## Webhooks

Events emitted via Brique 45:

- `dispute.received` - New dispute ingested
- `dispute.evidence_requested` - Evidence requested from merchant
- `dispute.evidence_submitted` - Merchant uploaded evidence
- `dispute.assigned` - Ops assignment
- `dispute.under_review` - Investigation started
- `dispute.resolved` - Final decision posted
- `chargeback.posted` - Chargeback recorded
- `chargeback.reversed` - Chargeback reversed (merchant won)

## Integration Points

### Brique 46 (Billing)
```typescript
// On cardholder_won
await fetch(`${BILLING_URL}/api/internal/credit-notes`, {
  method: "POST",
  body: JSON.stringify({
    merchant_id: dispute.merchant_id,
    amount: dispute.outcome_amount,
    currency: dispute.currency,
    reason: "dispute_chargeback",
    reference: dispute.id
  })
});
```

### Brique 34-35 (Treasury)
```typescript
// On chargeback.posted
await fetch(`${TREASURY_URL}/api/internal/chargebacks`, {
  method: "POST",
  body: JSON.stringify({
    dispute_id: dispute.id,
    merchant_id: dispute.merchant_id,
    amount: dispute.outcome_amount,
    currency: dispute.currency,
    type: "debit_merchant"
  })
});
```

### Brique 45 (Webhooks)
```typescript
// Emit events
await publishEvent("merchant", merchantId, "dispute.resolved", {
  dispute_id: dispute.id,
  outcome: "cardholder_won",
  amount: 99.99,
  currency: "USD"
});
```

## Metrics

Available at `/metrics`:

```
b47_disputes_received_total{source,reason_code}
b47_disputes_resolved_total{outcome}
b47_resolution_time_seconds{outcome}
b47_evidence_uploads_total{doc_type}
b47_sira_score_avg{merchant_id}
b47_chargebacks_posted_total{currency}
b47_ops_queue_size{priority}
```

## SLO Targets

- **Ingestion latency**: p95 < 200ms
- **Auto-assignment**: < 30s for high priority
- **Evidence request delivery**: < 5 minutes
- **Resolution time**: Median < 5 days
- **SIRA scoring**: < 2s per dispute

## Testing

### Unit Tests
```bash
npm test
```

Tests include:
- Ingest idempotence
- Evidence hash verification
- SIRA integration mocks
- Decision settlement flows

### Integration Tests
```typescript
// Test: Full dispute flow
test("dispute e2e flow", async () => {
  // 1. Ingest dispute
  const dispute = await ingestDispute({ ... });

  // 2. Merchant uploads evidence
  await uploadEvidence(dispute.id, fileBuffer);

  // 3. Ops posts decision
  await postDecision(dispute.id, "merchant_won");

  // 4. Verify settlement
  const chargeback = await getChargeback(dispute.id);
  expect(chargeback).toBeNull(); // merchant won
});
```

## Deployment

### 1. Database Migration
```bash
npm run migrate
```

### 2. Configure mTLS
- Generate certificates for network integrations
- Configure nginx/ALB for mTLS termination
- Whitelist network IPs

### 3. Deploy Service
```bash
# Build
npm run build

# Start API server
npm start

# Start worker
npm run worker:processor
```

### 4. Register Network Credentials
- Add acquirer public keys to .env
- Configure signature verification
- Test with sandbox disputes

### 5. Enable Ops UI
- Train ops team on workflow
- Set up escalation procedures
- Configure SLA alerting

## Edge Cases & Policies

### Duplicate Disputes
- Same payment_id + reason_code → merge
- Keep one canonical dispute
- Link related disputes

### Late Evidence
- Accept after deadline
- Mark as "late" in investigations
- Outcome weighed accordingly

### Merchant Insolvency
- Trigger reserve recovery
- Mark in SIRA
- Suspend new disputes

### Cross-Border
- Currency adjustments via Treasury
- Credit notes in billing currency
- FX rate at dispute date

## License

ISC

## Contact

Molam Team - [GitHub](https://github.com/Molam-git)
