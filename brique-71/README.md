# Brique 71 - KYC Review Ops UI

## 📋 Status: FOUNDATION COMPLETE (SQL Schema Ready)

**Version:** 1.0.0
**Date:** 2025-11-10

---

## 🎯 Overview

Industrial-grade KYC/AML compliance platform with multi-signature workflow, SIRA ML risk scoring, and immutable audit trails.

### Key Features

✅ **Multi-Level KYC System**
- P0 (Basic) - Email/phone verified
- P1 (ID Verified) - Government ID validated
- P2 (Professional/Business) - Business docs validated
- P3 (Bank Partner) - Banking license verified

✅ **SIRA ML Risk Scoring**
- Automated risk assessment
- Auto-approval for low-risk cases
- Priority queue management
- Intelligent escalation

✅ **Multi-Signature Approvals**
- Configurable per legal entity
- Role-based signature requirements
- High-value transaction protection

✅ **Document Management**
- Encrypted storage (S3/WORM)
- OCR data extraction
- Liveness detection
- Redaction for Ops UI

✅ **Immutable Audit Trail**
- Append-only logs
- Complete action history
- Compliance-ready exports

---

## 📊 Database Schema (✅ COMPLETE)

### Tables Implemented (8 tables)

1. **kyc_requests** - Main KYC tracking
   - User, account type, country
   - Status workflow (pending → in_review → approved/rejected)
   - SIRA score and decision
   - Assignment and priority
   - 6 indexes for performance

2. **kyc_documents** - Evidence storage
   - Document types (ID, proof of address, business docs)
   - S3 encrypted storage
   - OCR extracted data
   - Liveness scores
   - Verification status

3. **kyc_reviews** - Ops actions log
   - All operator actions
   - Notes and evidence
   - IP and user agent tracking

4. **kyc_approvals + kyc_approval_signatures** - Multi-sig workflow
   - Required signatures count
   - Collected signatures tracking
   - Role-based requirements
   - Signature metadata (IP, method, OTP)

5. **kyc_audit** - Immutable audit trail
   - Append-only log
   - Action tracking
   - Payload history

6. **kyc_config** - Policy configuration
   - Per legal entity/country
   - Auto-approve thresholds
   - Required documents
   - Multi-sig rules

7. **kyc_levels** - KYC level definitions
   - Capabilities per level
   - Transaction limits
   - Required documents

8. **kyc_sira_feedback** - ML training data
   - SIRA predictions vs actual outcomes
   - Model versioning

### Triggers & Functions

- ✅ `update_kyc_updated_at()` - Auto-update timestamps
- ✅ `create_kyc_audit_on_status_change()` - Auto-audit on status change
- ✅ `check_required_documents()` - Validate document completeness

### Views

- ✅ `kyc_ops_queue` - Priority queue with wait times and document status

---

## 🏗️ Architecture

```
┌─────────────┐
│   User      │
│  Submits    │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│  KYC Request     │◄──── SIRA Risk Scoring
│  (pending)       │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐      ┌────────────────┐
│  Auto-Screening  │────▶ │ Auto-Approve?  │
│  OCR + Liveness  │      │ (SIRA < 0.20)  │
└──────┬───────────┘      └────────┬───────┘
       │                           │
       │ No                        │ Yes
       ▼                           ▼
┌──────────────────┐      ┌────────────────┐
│  Ops Queue       │      │   Approved     │
│  (priority sort) │      │  (P1 granted)  │
└──────┬───────────┘      └────────────────┘
       │
       ▼
┌──────────────────┐
│  Manual Review   │
│  (Ops checks)    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Multi-Sig Needed?│
│  (P2/P3/High $$) │
└──────┬───────────┘
       │
       ├─ Yes ──▶ Multi-Sig Approval ──▶ Approved
       │
       └─ No ──▶ Single Approval ──▶ Approved/Rejected
```

---

## 🎯 KYC Levels

| Level | Name | Description | Max Transaction | Daily Volume | Required Docs |
|-------|------|-------------|-----------------|--------------|---------------|
| **P0** | Basic | Email/phone verified | $0 | $0 | None |
| **P1** | ID Verified | Government ID | $1,000 | $5,000 | ID + Selfie |
| **P2** | Professional | Business verified | $50,000 | $200,000 | ID + Business docs |
| **P3** | Bank Partner | Banking license | Unlimited | Unlimited | Bank license |

---

## 🔧 Configuration

### Per Legal Entity/Country

```sql
-- View config
SELECT * FROM kyc_config WHERE legal_entity = 'molam_sn' AND country = 'SN';

-- Update auto-approve threshold
UPDATE kyc_config
SET auto_approve_threshold = 0.15,  -- SIRA score < 0.15 = auto-approve
    multi_sig_amount_threshold = 10000.00
WHERE legal_entity = 'molam_sn' AND country = 'SN' AND account_type = 'personal';
```

### Multi-Sig Rules

**Default Policy:**
- P1 upgrade: Single approval (kyc_ops)
- P2 upgrade: 2 approvals (kyc_lead + compliance)
- P3 upgrade: 2 approvals (kyc_lead + compliance)
- High amount (>$10k transaction): 2 approvals

**Configurable per legal entity**

---

## 🚀 Implementation Status

### ✅ Completed (25%)

| Component | File | Status |
|-----------|------|--------|
| SQL Schema | migrations/001_create_kyc_tables.sql | ✅ Complete (~450 lines) |
| Package Config | package.json, tsconfig.json | ⏳ Pending |
| Database Connection | src/db.ts | ⏳ Pending |

### ⏳ To Be Implemented (75%)

| Component | Priority | Estimated Lines |
|-----------|----------|-----------------|
| SIRA KYC Service | HIGH | ~400 |
| KYC Engine | HIGH | ~500 |
| Document Service | HIGH | ~300 |
| KYC Worker | HIGH | ~300 |
| REST API Routes | HIGH | ~500 |
| RBAC Middleware | MEDIUM | ~200 |
| Ops UI (React) | MEDIUM | ~800 |
| Prometheus Metrics | MEDIUM | ~250 |
| Webhooks | MEDIUM | ~150 |
| OCR Integration | LOW | ~200 |
| Liveness Integration | LOW | ~200 |
| Tests | MEDIUM | ~400 |

**Total Remaining:** ~4,200 lines

---

## 💡 Usage Flows

### Flow 1: Personal Account Auto-Approval

```
1. User submits KYC request (P0 → P1 upgrade)
   ↓
2. Uploads ID front/back + selfie
   ↓
3. OCR extracts name, DOB, ID number
   ↓
4. Liveness detection: Score 85/100 (pass)
   ↓
5. SIRA evaluation: Score 0.12 (low risk)
   ↓
6. Auto-approved (within 2 seconds)
   ↓
7. KYC level upgraded to P1
   ↓
8. Molam ID claims updated (JWT)
   ↓
9. Wallet limits increased
```

### Flow 2: Business Account Multi-Sig

```
1. Merchant submits KYC request (P1 → P2 upgrade)
   ↓
2. Uploads business registration, tax cert
   ↓
3. SIRA evaluation: Score 0.55 (medium risk)
   ↓
4. Routed to Ops queue (high priority)
   ↓
5. Ops reviewer #1 verifies documents
   ↓
6. Ops reviewer #1 initiates approval
   ↓
7. Multi-sig required (P2 upgrade)
   ↓
8. Compliance officer signs approval
   ↓
9. Both signatures collected → Approved
   ↓
10. KYC level upgraded to P2
    ↓
11. Instant payout capability enabled
```

### Flow 3: High-Risk Manual Review

```
1. User submits KYC with suspicious patterns
   ↓
2. SIRA evaluation: Score 0.88 (high risk)
   ↓
3. Routed to priority Ops queue (priority = 1)
   ↓
4. Ops reviewer investigates
   ↓
5. Requests additional information
   ↓
6. User uploads more evidence
   ↓
7. Ops escalates to compliance team
   ↓
8. Compliance reviews and approves
   ↓
9. Multi-sig collected
   ↓
10. Approved with monitoring flag
```

---

## 🔒 Security Features

### Document Storage
- Encrypted at rest (S3 server-side encryption)
- WORM (Write-Once-Read-Many) for compliance
- Signed URLs with time expiration
- Access audit logging

### Redaction
- PII automatically redacted for Ops UI
- Original stored separately for legal/compliance
- Configurable redaction rules per document type

### Access Control
- RBAC with roles: kyc_ops, kyc_lead, compliance, auditor
- IP whitelisting for Ops portal
- mTLS for internal service communication
- Session timeout (15 minutes idle)

### Audit Trail
- Append-only log (no modifications/deletions)
- SHA-256 hash of each audit entry
- Signed exports for regulatory submissions
- 7-year retention (configurable per jurisdiction)

---

## 📊 SIRA Risk Factors (Planned)

### Input Features
1. **User History**
   - Account age
   - Transaction volume/frequency
   - Previous KYC attempts
   - Wallet activity

2. **Document Quality**
   - OCR confidence score
   - Liveness detection score
   - Document expiry date
   - Image quality metrics

3. **Behavioral Signals**
   - IP geolocation match
   - Device fingerprint
   - Submission time patterns
   - Multiple accounts detection

4. **External Data**
   - Sanctions lists (OFAC, UN)
   - PEP (Politically Exposed Person) databases
   - Adverse media screening
   - Credit bureau data (if available)

### Risk Score Interpretation

| Score | Risk Level | Action | Example |
|-------|------------|--------|---------|
| 0.00-0.20 | 🟢 Low | Auto-approve | First-time user, good docs, no red flags |
| 0.20-0.40 | 🟡 Medium-Low | Ops review (low priority) | Minor doc quality issues |
| 0.40-0.60 | 🟠 Medium | Ops review (normal priority) | Partial doc match, IP mismatch |
| 0.60-0.80 | 🔴 High | Ops review (high priority) | Multiple red flags, PEP match |
| 0.80-1.00 | ⛔ Very High | Escalate to compliance | Sanctions list hit, fraud indicators |

---

## 📈 Metrics (Planned)

### Prometheus Metrics
- `kyc_requests_total{status, account_type, country}`
- `kyc_auto_approve_rate{country}`
- `kyc_time_to_review_seconds{priority}`
- `kyc_sira_score_histogram{country}`
- `kyc_document_verification_latency_seconds{doc_type}`
- `kyc_multi_sig_approval_time_hours`
- `kyc_rejection_rate{country, reason}`
- `kyc_queue_size{priority}`

### Dashboards
- Queue size and wait times
- Auto-approval rate by country
- Ops reviewer throughput
- SIRA accuracy (via feedback loop)
- Document verification latency
- Compliance SLA tracking

### SLOs
- Auto-decision latency P95 < 200ms
- Time-to-first-review median < 2 hours
- Multi-sig approval time P95 < 24 hours
- Queue backlog < 500 requests

---

## 🔗 Integration Points

### Required Integrations
1. **Molam ID** - Update KYC claims in JWT
2. **Molam Wallet** - Adjust transaction limits
3. **OCR Service** - Document data extraction
4. **Liveness Detection** - Selfie verification
5. **Sanctions Screening** - OFAC/UN lists

### Optional Integrations
6. **Webhook Service (B45)** - Event publishing
7. **Analytics Service** - Business intelligence
8. **Notification Service** - Email/SMS alerts
9. **Treasury (B34/B35)** - Payout limit updates

---

## 📚 API Endpoints (Planned)

```
POST   /api/kyc/requests              # Create KYC request
GET    /api/kyc/requests/:id          # Get request status
POST   /api/kyc/requests/:id/documents # Upload document
GET    /api/kyc/requests/:id/documents # List documents
POST   /api/kyc/requests/:id/assign   # Assign to Ops user
POST   /api/kyc/requests/:id/approve  # Approve (single)
POST   /api/kyc/requests/:id/reject   # Reject with reason
POST   /api/kyc/requests/:id/more-info # Request more information
POST   /api/kyc/requests/:id/escalate # Escalate to compliance
GET    /api/kyc/queue                 # Ops queue (filtered)
POST   /api/kyc/approvals             # Create multi-sig approval
POST   /api/kyc/approvals/:id/sign    # Sign approval
GET    /api/kyc/config                # Get KYC config
PUT    /api/kyc/config/:id            # Update config (admin)
GET    /api/kyc/audit/:id             # Get audit trail
```

---

## 🎨 Ops UI Components (Planned)

### Main Views
1. **Queue Dashboard** - Sortable/filterable list
2. **Request Detail** - Timeline, documents, notes
3. **Document Viewer** - Zoom, pan, redaction toggle
4. **Multi-Sig Modal** - Signature collection UI
5. **Config Editor** - Policy management
6. **Analytics Dashboard** - Charts and metrics

### Features
- Real-time updates (WebSocket)
- Keyboard shortcuts (approve, reject, next)
- Bulk operations
- Evidence comparison view
- Document OCR overlay
- Audit timeline visualization

---

## 🧪 Testing Strategy

### Unit Tests
- SIRA risk calculation
- Multi-sig collection logic
- Document validation
- Auto-approval rules

### Integration Tests
- End-to-end KYC flow
- Multi-sig workflow
- Document upload & OCR
- Webhook publishing

### Security Tests
- Access control enforcement
- Document encryption
- Audit log immutability
- Redaction correctness

---

## 📋 Deployment Checklist

### Database
- [ ] Run SQL migrations
- [ ] Verify indexes created
- [ ] Test triggers
- [ ] Seed KYC levels and config

### Services
- [ ] Deploy KYC API service
- [ ] Deploy KYC worker
- [ ] Configure S3/WORM storage
- [ ] Set up KMS for encryption

### Integrations
- [ ] Connect Molam ID
- [ ] Connect OCR service
- [ ] Connect Liveness service
- [ ] Configure sanctions screening

### Monitoring
- [ ] Set up Prometheus scraping
- [ ] Create Grafana dashboards
- [ ] Configure alerts (queue size, latency)

### Security
- [ ] Review RBAC permissions
- [ ] Test document encryption
- [ ] Audit log export test
- [ ] Penetration testing

---

## 🎯 Success Metrics

- **Auto-Approval Rate**: Target >60% for eligible P1 upgrades
- **SIRA Accuracy**: Target >95% (measured via feedback loop)
- **Time-to-Review**: Median <2 hours
- **Multi-Sig SLA**: P95 <24 hours
- **False Positive Rate**: <3%
- **Queue Backlog**: <500 requests at peak

---

## 🚀 Next Steps

### Phase 1: Core Implementation (2-3 weeks)
1. SIRA KYC service
2. KYC engine (create, review, approve)
3. Document management service
4. REST API endpoints
5. KYC worker (auto-assignment)

### Phase 2: Ops Tools (2 weeks)
6. Ops UI (queue, detail, viewer)
7. Multi-sig workflow UI
8. Evidence viewer with redaction
9. Analytics dashboard

### Phase 3: Integrations (2 weeks)
10. Molam ID integration
11. OCR service integration
12. Liveness detection
13. Sanctions screening
14. Webhook publishing

### Phase 4: Production Readiness (1 week)
15. Load testing
16. Security review
17. Compliance audit
18. Documentation finalization

**Estimated Total:** 7-8 weeks to production

---

**Document Version:** 1.0.0
**Status:** SQL Schema Complete (25%), Core Implementation Pending
**Next Milestone:** SIRA service + KYC engine
