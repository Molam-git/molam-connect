# Brique 57 - Merchant Self-Service Fraud Toolkit

Industrial-grade merchant-facing fraud management tools for Molam Connect.

## Features

### 1. Whitelist & Blacklist Management
- **Entity Types**: Customers, cards, IP addresses, device fingerprints
- **Cache-First Lookup**: Redis-backed sub-10ms lookup for real-time fraud checks
- **Bulk Import**: CSV upload for batch list management
- **Scope-Based Rules**: Apply lists to specific countries, amounts, or payment methods
- **Audit Trail**: Complete history of all list modifications

### 2. Real-Time Fraud Alerts
- **Multi-Channel Delivery**: Webhook, email, Slack notifications
- **Event Types**:
  - High-risk payments (SIRA critical/high)
  - Blacklist hits
  - Velocity threshold exceeded
  - Chargeback notifications
  - Evidence due soon reminders
- **Configurable Thresholds**: Set min amounts, risk levels per alert type
- **24h Alert Feed**: Real-time dashboard with auto-refresh

### 3. Evidence Package Builder
- **Template-Based**: Auto-generated packages for common reason codes
- **Document Types**: Proof of delivery, invoices, customer communication, policies
- **S3 WORM Storage**: Immutable evidence with SHA-256 integrity checks
- **Draft & Submit Workflow**: Build packages over time, lock on submission
- **Integration**: Auto-link to Brique 55 disputes

### 4. Protection Level Subscriptions
- **Basic** (Free): Basic fraud detection, whitelist/blacklist, alerts
- **Premium** ($299/mo): + Advanced Radar rules, velocity checks, chargeback protection
- **Guaranteed** ($999/mo): + Chargeback guarantee, custom rules, priority support, 100% coverage

### 5. Fraud KPI Tracking
- **Real-Time Metrics**:
  - Fraud rate (high-risk payment %)
  - Chargeback rate
  - Blocked payments & volume saved
  - Average SIRA score
  - Whitelist/blacklist effectiveness
- **Daily Snapshots**: Historical trend analysis
- **Velocity Signals**: 1h and 24h payment counts/volumes

## Architecture

### Backend Services
```
src/
├── services/
│   ├── listsService.ts         # Whitelist/blacklist CRUD + cache sync
│   ├── notificationsService.ts # Multi-channel alert delivery
│   ├── evidenceService.ts      # Evidence package management + S3 upload
│   └── kpiService.ts           # Fraud metrics calculation + snapshots
├── routes/
│   └── merchantProtectionRoutes.ts  # RESTful API (all endpoints)
├── workers/
│   ├── alertsConsumer.ts       # Real-time alert processing (5s poll)
│   └── evidenceAssembler.ts   # Auto-generate evidence packages (30s poll)
└── utils/
    ├── db.ts                   # PostgreSQL connection pool
    ├── cache.ts                # Redis client + list lookup functions
    └── authz.ts                # JWT auth + RBAC middleware
```

### Database Schema (5 Tables)
```sql
merchant_lists              # Whitelist/blacklist entries
merchant_notifications      # Alert preferences per merchant
merchant_protections        # Protection level subscriptions
merchant_fraud_snapshots    # Daily KPI snapshots
evidence_packages           # Evidence package metadata + docs JSONB
molam_audit_logs            # Complete audit trail
```

### Frontend Components (React + Tailwind)
```
web/src/
├── ProtectionPanel.tsx     # Overview + KPIs + protection level upgrade
├── ListsManager.tsx        # Whitelist/blacklist CRUD + bulk import
├── AlertsFeed.tsx          # Real-time fraud alerts (24h)
└── EvidenceBuilder.tsx     # Evidence package creation + document upload
```

## API Endpoints

### Lists Management
- `POST /api/merchant-protection/lists` - Add entry to whitelist/blacklist
- `GET /api/merchant-protection/lists` - List all entries (filtered)
- `DELETE /api/merchant-protection/lists` - Remove entry
- `POST /api/merchant-protection/lists/bulk-import` - CSV bulk import
- `GET /api/merchant-protection/lists/check` - Check if entity is listed

### Notifications
- `POST /api/merchant-protection/notifications` - Set alert preference
- `GET /api/merchant-protection/notifications` - List all preferences
- `POST /api/merchant-protection/notifications/test` - Test channel

### Evidence Packages
- `POST /api/merchant-protection/evidence` - Create package
- `GET /api/merchant-protection/evidence` - List packages
- `GET /api/merchant-protection/evidence/:id` - Get package details
- `POST /api/merchant-protection/evidence/:id/documents` - Upload document
- `DELETE /api/merchant-protection/evidence/:id/documents/:doc_id` - Delete document
- `POST /api/merchant-protection/evidence/:id/submit` - Submit package (lock)
- `GET /api/merchant-protection/evidence/:id/documents/:doc_id/download` - Get presigned URL

### KPIs & Analytics
- `GET /api/merchant-protection/kpis` - Calculate fraud KPIs for date range
- `GET /api/merchant-protection/trend` - Get daily fraud snapshots
- `GET /api/merchant-protection/alerts` - List recent alerts (24h)
- `GET /api/merchant-protection/alerts/count` - Get alert count (cached)

### Protection Level
- `GET /api/merchant-protection/status` - Get current protection level
- `POST /api/merchant-protection/subscribe` - Subscribe to protection level

## Integration Points

### Brique 34 (Payments)
- Fetch payment details for evidence packages
- Payment metadata for fraud analysis

### Brique 44 (SIRA - ML Fraud Detection)
- Fetch SIRA scores for payment signals
- Evidence summary includes SIRA analysis

### Brique 45 (Webhooks)
- Publish fraud alert events to merchant webhooks
- Event types: `fraud.high_risk_payment`, `fraud.blacklist_hit`, etc.

### Brique 46 (Notifications)
- Send email/SMS alerts via notification service
- OTP/3DS challenge delivery

### Brique 55 (Disputes)
- Auto-generate evidence packages for new disputes
- Link evidence packages to dispute IDs

### Brique 56 (Radar Rules)
- Whitelist lowers SIRA score, blacklist auto-blocks
- Velocity signals from payment_signals table
- Action execution results feed alert system

## Workers

### Alerts Consumer (`alertsConsumer.ts`)
**Poll Interval**: 5 seconds

**Functions**:
1. Scan `payment_signals` for high/critical SIRA scores
2. Scan `radar_actions` for blocks/challenges
3. Check `disputes` for approaching deadlines
4. Send alerts via notification service
5. Increment Redis alert counter

### Evidence Assembler (`evidenceAssembler.ts`)
**Poll Interval**: 30 seconds

**Functions**:
1. Find disputes without evidence packages
2. Fetch payment + SIRA data
3. Generate evidence summary JSON
4. Determine required documents by reason code
5. Create draft evidence package

**Reason Code Templates**:
- `10.4` (Fraud): proof_of_delivery, shipping_receipt, customer_communication
- `13.1` (Services Not Provided): invoice, product_description, terms_of_service
- `13.2` (Cancelled Recurring): cancellation_policy, customer_communication, service_logs
- `13.7` (Cancelled Merch): cancellation_policy, refund_policy, customer_communication
- `83` (Fraud Card-Present): proof_of_authorization, customer_communication, invoice

## Security

### Authentication
- **JWT RS256**: Asymmetric token validation via Molam ID public key
- **Claims**: `sub` (user ID), `merchant_id`, `roles`, `exp`

### Authorization (RBAC)
- **merchant_admin**: Full access to merchant's fraud tools
- **connect_ops**: Read-only access to all merchants (ops override)
- **auditor**: Read-only audit log access

### Data Isolation
- All queries filtered by `merchant_id` from JWT token
- Evidence packages stored in merchant-specific S3 prefixes
- Redis cache keys namespaced by merchant

### Audit Trail
- All mutations logged to `molam_audit_logs`
- Fields: entity_type, entity_id, action, actor_id, changes, merchant_id, timestamp
- Immutable append-only log

## Redis Cache Strategy

### Keys
```
whitelist:{merchant_id}:{entity_type}:{value}  → "1" (24h TTL)
blacklist:{merchant_id}:{entity_type}:{value}  → "1" (24h TTL)
alerts:count:{merchant_id}                     → count (24h TTL)
```

### Lookup Flow
1. Check Redis cache (sub-1ms)
2. If miss, query PostgreSQL
3. Cache result for 24h
4. Return result

### Invalidation
- On list entry add/remove: immediate invalidation
- On merchant list changes: preload all entries

## Metrics (Prometheus)

```
molam_merchant_list_add_total{merchant_id, list_type, entity_type}
molam_merchant_list_remove_total{merchant_id, list_type, entity_type}
molam_merchant_alerts_processed_total{merchant_id, event_type}
```

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/molam_connect

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
EVIDENCE_BUCKET_NAME=molam-evidence-packages

# Authentication
JWT_PUBLIC_KEY_URL=http://localhost:8001/api/auth/public-key

# Service URLs
PAYMENTS_URL=http://localhost:8034
SIRA_URL=http://localhost:8044
WEBHOOKS_URL=http://localhost:8045
NOTIFICATIONS_URL=http://localhost:8046
MOLAM_ID_URL=http://localhost:8001

# Server
PORT=8057
```

## Installation

```bash
cd brique-57
npm install
```

## Database Setup

```bash
psql -U postgres -d molam_connect -f migrations/057_merchant_protection.sql
```

## Running

### API Server
```bash
npm run dev
# or
npm start
```

### Workers
```bash
# Terminal 1 - Alerts Consumer
npm run worker:alerts

# Terminal 2 - Evidence Assembler
npm run worker:evidence
```

### Frontend (Development)
```bash
cd web
npm install
npm run dev
```

## Testing

### Add to Whitelist
```bash
curl -X POST http://localhost:8057/api/merchant-protection/lists \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "list_type": "whitelist",
    "entity_type": "customer",
    "value": "cust_abc123",
    "reason": "VIP customer"
  }'
```

### Check if Blacklisted
```bash
curl "http://localhost:8057/api/merchant-protection/lists/check?entity_type=ip&value=192.168.1.1" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Fraud KPIs
```bash
curl "http://localhost:8057/api/merchant-protection/kpis?start_date=2025-01-01&end_date=2025-01-31" \
  -H "Authorization: Bearer $TOKEN"
```

### Create Evidence Package
```bash
curl -X POST http://localhost:8057/api/merchant-protection/evidence \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dispute_id": "disp_xyz789",
    "package_type": "chargeback_rebuttal"
  }'
```

### Upload Document
```bash
curl -X POST http://localhost:8057/api/merchant-protection/evidence/pkg_123/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@invoice.pdf" \
  -F "document_type=invoice"
```

## Performance

- **List Lookup**: <10ms (Redis cache hit)
- **KPI Calculation**: <500ms (30-day range)
- **Evidence Upload**: <2s (10MB file to S3)
- **Alert Delivery**: <100ms (webhook publish)

## Compliance

- **GDPR**: Audit logs for data access, merchant data isolation
- **PCI DSS**: No raw card data stored, SHA-256 integrity checks
- **SOC 2**: Immutable audit trail, RBAC enforcement
- **WORM Storage**: S3 Object Lock for evidence integrity

## Future Enhancements

1. **Multi-Sig Approvals**: Require multiple merchant admins for critical actions
2. **Custom Evidence Templates**: Merchant-defined document checklists
3. **ML-Based Recommendations**: Suggest whitelist/blacklist entries from patterns
4. **Real-Time WebSocket Alerts**: Push notifications to merchant dashboard
5. **Fraud Ring Detection**: Cross-merchant fraud pattern analysis (ops-only)
6. **Automated Evidence Generation**: Fetch documents from merchant systems via API
7. **Chargeback Insurance**: Premium tier auto-refund on lost disputes
8. **Fraud Score Tuning**: Merchant-adjustable SIRA score thresholds

## License

Proprietary - Molam Finance Inc.
