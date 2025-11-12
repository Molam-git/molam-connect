# Brique 58 - Disputes & Chargebacks Engine

Industrial-grade dispute management system for handling chargebacks from card networks (Visa/Mastercard/AMEX), banks, and merchant-initiated disputes.

## Overview

This engine provides end-to-end dispute lifecycle management including:
- **Network ingestion** via Kafka from connector services
- **Evidence management** with S3 WORM storage
- **SIRA ML integration** for auto-scoring and recommendations
- **Ops workflow** with action queue and multi-stage processing
- **Billing integration** for chargeback accounting
- **Merchant/Ops dashboards** for self-service and operations

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Network APIs   │────▶│  Kafka Topics    │────▶│ Disputes        │
│ (Visa/MC/AMEX)  │     │ network.dispute.*│     │ Consumer        │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                           │
                        ┌──────────────────────────────────┼──────────┐
                        │                                  ▼          │
                        │         ┌───────────────────────────────┐  │
                        │         │   Disputes Service (API)      │  │
                        │         │   • Create/Update disputes    │  │
                        │         │   • Evidence upload/download  │  │
                        │         │   • Timeline & stats          │  │
                        │         └──────────────┬────────────────┘  │
                        │                        │                   │
        ┌───────────────┼────────────────────────┼───────────────┐   │
        │               │                        │               │   │
        ▼               ▼                        ▼               ▼   │
┌───────────────┐ ┌──────────────┐  ┌─────────────────┐ ┌─────────────┐
│ Actions       │ │ SIRA         │  │ Evidence        │ │ Network     │
│ Worker        │ │ Scorer       │  │ (S3 + DB)       │ │ Connectors  │
│ • Submit      │ │ • ML score   │  │ • Upload files  │ │ • Visa      │
│ • Refund      │ │ • Auto rec.  │  │ • SHA-256 hash  │ │ • Mastercard│
│ • Credit      │ │              │  │ • Presigned URL │ │ • Sandbox   │
└───────────────┘ └──────────────┘  └─────────────────┘ └─────────────┘
        │                                                      │
        └──────────────────────────────────────────────────────┘
                             │
                             ▼
                ┌────────────────────────────┐
                │  PostgreSQL Database       │
                │  • disputes                │
                │  • dispute_evidence        │
                │  • dispute_events          │
                │  • dispute_actions         │
                │  • dispute_reconciliations │
                └────────────────────────────┘
```

## Database Schema

### Main Tables

1. **disputes** - Core dispute records
   - Fields: dispute_ref, origin, payment_id, merchant_id, amount, currency, status, reason_code, network_deadline, sira_score
   - Status flow: reported → evidence_requested → submitted → network_review → won/lost/settled → closed

2. **dispute_evidence** - Evidence documents
   - S3 storage with SHA-256 integrity checks
   - Types: invoice, shipping_proof, communication, receipt, refund_policy

3. **dispute_events** - Immutable timeline
   - All state changes and actions logged
   - Actor tracking (system/merchant/ops/network)

4. **dispute_actions** - Async action queue
   - Types: request_evidence, submit_to_network, auto_accept, auto_refute, refund, issue_credit, escalate, close
   - Retry logic with exponential backoff

5. **dispute_reconciliations** - Network settlement matching
   - Exact + fuzzy matching algorithms
   - Manual review for unmatched

## Features

### 1. Dispute Lifecycle Management

**Status Flow**:
```
reported → evidence_requested → submitted → network_review → resolved (won/lost/settled) → closed
```

- **Reported**: New dispute ingested from network
- **Evidence Requested**: System prompts merchant for evidence
- **Submitted**: Evidence sent to network connector
- **Network Review**: Awaiting network decision
- **Resolved**: Final outcome determined
- **Closed**: Dispute archived

### 2. Network Connectors

**Interface**: `NetworkConnector`
- `submitDispute()` - Send evidence package to network
- `checkStatus()` - Poll for updates
- `withdrawDispute()` - Cancel before resolution

**Available Connectors**:
- **Sandbox** (testing) - Mock responses, no real API calls
- **Visa** (production) - Via Visa Dispute Resolution API
- **Mastercard** (production) - Via Mastercard Dispute Manager
- **AMEX** (production) - Via Amex Dispute Platform

**Registry Pattern**:
```typescript
NetworkConnectorRegistry.register('visa', new VisaConnector());
const connector = NetworkConnectorRegistry.get('visa');
```

### 3. SIRA Integration

**ML-Powered Scoring**:
- Score: 0-1 (higher = more likely to lose)
- Risk level: low | medium | high | critical
- Recommended action: auto_accept | request_evidence | auto_refute | escalate_ops
- Win probability: 0-1
- Confidence: 0-1

**Auto-Actions**:
- High confidence (>0.9) auto-accept → Creates credit note automatically
- High confidence (>0.9) auto-refute → Submits evidence automatically

**Evidence Suggestions**:
- Reason code-based templates
- Example: Fraud (10.4) → proof_of_authorization, customer_communication, fraud_analysis

### 4. Evidence Management

**Upload Flow**:
1. Merchant uploads file via API/UI
2. File validated (size, mime-type)
3. SHA-256 hash computed
4. Upload to S3 with metadata
5. Database record created
6. Event logged in timeline

**S3 Structure**:
```
evidence/
  {merchant_id}/
    {dispute_id}/
      {timestamp}-{filename}
```

**Download**:
- Presigned URLs (1h expiration)
- Access control via merchant_id check
- File integrity verification via hash

### 5. Actions Worker

**Queue Processing**:
- Poll interval: 5 seconds
- Batch size: 20 actions
- Priority support (0-10)
- FOR UPDATE SKIP LOCKED for concurrency

**Retry Logic**:
- Max attempts: 5
- Exponential backoff: 2^n seconds (max 5 minutes)
- Failed actions escalated to ops

**Action Types**:
```typescript
request_evidence    // Update status + send webhook
submit_to_network   // Assemble + submit via connector
auto_accept         // Mark lost + create credit note
auto_refute         // Auto-submit with high confidence
refund              // Create refund via B54
issue_credit        // Create credit note via B46
escalate            // Create ops ticket
close               // Archive dispute
```

### 6. Reconciliation

**Matching Algorithm**:
1. **Exact match**: network_ref = dispute_ref
2. **Fuzzy match**: amount + currency + date
3. **Manual review**: Unmatched cases flagged for ops

**Settlement Messages**:
- Ingested from network settlement files
- Matched to existing disputes
- Discrepancies create ops alerts

### 7. Billing Integration

**Chargeback Accounting** (Lost Disputes):
```sql
INSERT INTO credit_notes (
  merchant_id, reason, amount, currency, status, metadata
) VALUES (
  '{merchant_id}', 'chargeback', {dispute_amount}, '{currency}', 'issued',
  '{"dispute_id": "{dispute_id}"}'
);
```

**Fees**:
- Network fees (Visa: $15-25, Mastercard: $15-50)
- Molam service fees
- Deducted from merchant balance or next payout

### 8. Webhooks

**Events Published**:
- `dispute.created` - New dispute ingested
- `dispute.evidence_requested` - Merchant must submit evidence
- `dispute.submitted` - Evidence sent to network
- `dispute.updated` - Status changed
- `dispute.resolved` - Final outcome (won/lost/settled)

**Payload Example**:
```json
{
  "merchant_id": "mch_xxx",
  "event_type": "dispute.created",
  "payload": {
    "dispute_id": "disp_xxx",
    "dispute_ref": "CB-VISA-12345",
    "amount": 99.99,
    "currency": "USD",
    "reason_code": "10.4",
    "network_deadline": "2025-02-15T23:59:59Z"
  }
}
```

## API Endpoints

### Merchant Endpoints

```
GET    /api/disputes                    # List disputes
GET    /api/disputes/:id                # Get dispute details
GET    /api/disputes/:id/timeline       # Get event timeline
GET    /api/disputes/:id/evidence       # List evidence
POST   /api/disputes/:id/evidence       # Upload evidence (multipart)
GET    /api/disputes/:id/evidence/:eid/download  # Get download URL
GET    /api/disputes/merchant/stats     # Get dispute statistics
```

### Ops Endpoints

```
POST   /api/disputes/:id/submit         # Submit to network
POST   /api/disputes/:id/resolve        # Resolve (won/lost/settled)
PATCH  /api/disputes/:id/status         # Update status
DELETE /api/disputes/:id/evidence/:eid  # Delete evidence (pre-submission)
```

### Authentication

All endpoints require JWT Bearer token:
```
Authorization: Bearer {jwt_token}
```

**Required Roles**:
- Merchant: `merchant_admin`, `merchant_viewer`
- Ops: `pay_admin`, `finance_ops`

## Installation

```bash
cd brique-58
npm install
```

## Database Setup

```bash
psql -U postgres -d molam_connect -f migrations/058_disputes.sql
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/molam_connect

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=disputes-service
KAFKA_GROUP_ID=disputes-consumer-group

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
EVIDENCE_BUCKET_NAME=molam-dispute-evidence

# Service URLs
PAYMENTS_URL=http://localhost:8034
SIRA_URL=http://localhost:8044
WEBHOOKS_URL=http://localhost:8045
BILLING_URL=http://localhost:8046
MOLAM_ID_URL=http://localhost:8001
```

## Running

### API Server
```bash
npm run dev      # Development
npm start        # Production
```

### Workers
```bash
# Terminal 1 - Kafka Consumer (ingestion)
npm run worker:ingest

# Terminal 2 - Actions Processor
npm run worker:actions

# Terminal 3 - Reconciliation
npm run worker:reconciliation
```

## Testing

### Create Test Dispute
```bash
# Publish to Kafka
kafka-console-producer --broker-list localhost:9092 --topic network.dispute.created

# JSON payload:
{
  "reference": "CB-VISA-TEST-001",
  "network": "visa",
  "merchant_id": "mch_abc123",
  "payment_id": "pay_xyz789",
  "amount": 9999,
  "currency": "USD",
  "reason_code": "10.4",
  "created_at": "2025-01-15T10:00:00Z"
}
```

### Upload Evidence (curl)
```bash
curl -X POST http://localhost:8058/api/disputes/{dispute_id}/evidence \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@invoice.pdf" \
  -F "evidence_type=invoice"
```

### Submit to Network
```bash
curl -X POST http://localhost:8058/api/disputes/{dispute_id}/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Submitting with all evidence"}'
```

## Network Deadline Computation

**Rules** (configurable per network):
- Visa: 20 days evidence window, 30 days response
- Mastercard: 45 days evidence + response
- AMEX: 20 days evidence + response
- Default: 14 days evidence, 30 days response

**Computation**:
```typescript
deadline = dispute.created_at + network.evidenceWindow days
```

If network provides explicit deadline in payload, that is used instead.

## Reason Code Mapping

| Code | Description | Category | Evidence Required |
|------|-------------|----------|-------------------|
| 10.4 | Fraud - Card Absent | fraud | Yes |
| 13.1 | Services Not Provided | service | Yes |
| 13.2 | Cancelled Recurring | subscription | Yes |
| 13.3 | Not as Described | quality | Yes |
| 13.5 | Misrepresentation | misrepresentation | Yes |
| 13.7 | Cancelled Merchandise | cancellation | Yes |
| 83   | Fraud - Card Present | fraud | Yes |

## Metrics (Prometheus)

```
molam_disputes_created_total{merchant_id, origin, network}
molam_dispute_resolution_duration_seconds{outcome, merchant_id}
```

**Grafana Dashboards**:
- Disputes by status (pie chart)
- Resolution time histogram
- Win/loss rate by merchant
- Action queue depth

## SLA & Performance

- **Dispute ingestion**: <1s (Kafka → DB)
- **Evidence upload**: <5s (20MB file)
- **SIRA scoring**: <2s
- **Action processing**: <30s per action
- **Network submission**: <10s (varies by connector)

**SLO**:
- 99.9% uptime
- P95 API latency: <500ms
- Resolution time: <30 days (target)

## Security

- **JWT Authentication**: RS256 asymmetric tokens
- **RBAC**: merchant_admin, pay_admin, finance_ops
- **Evidence encryption**: S3 server-side encryption (AES-256)
- **File integrity**: SHA-256 hashing
- **Audit trail**: All actions logged to molam_audit_logs
- **Rate limiting**: 100 req/min per merchant

## Compliance

- **PCI DSS**: No raw card data stored
- **GDPR**: Customer data anonymization support
- **SOC 2**: Immutable audit logs, access controls
- **WORM Storage**: Evidence retention (7 years)

## Troubleshooting

### Dispute not ingested
- Check Kafka consumer logs
- Verify topic: `network.dispute.created`
- Check dispute_ref uniqueness

### Evidence upload fails
- Check S3 credentials
- Verify bucket permissions
- Check file size (<20MB)

### Action stuck in queue
- Check worker logs
- Verify network connector availability
- Check max_attempts and retry logic

### Reconciliation unmatched
- Check network_ref format
- Review fuzzy match thresholds
- Manual ops review required

## Future Enhancements

1. **Pre-Arbitration** - Second-level disputes
2. **Representments** - Counter-disputes
3. **Fraud Ring Detection** - Cross-merchant analysis
4. **ML Evidence Quality** - Score evidence strength
5. **Auto-Evidence** - Fetch from merchant APIs
6. **Multi-Currency** - Automatic FX handling
7. **Batch Submission** - Bulk network uploads
8. **Mobile App** - Merchant evidence capture

## License

Proprietary - Molam Finance Inc.
