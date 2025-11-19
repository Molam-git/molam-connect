# Brique 130 — Treasury Audit & Regulatory Exports

## Overview
Industrial-grade audit and regulatory compliance system with immutable logging, HMAC-signed audit trails, multi-format export generation, and WORM storage for 10-year retention.

## Features
- **Immutable Audit Logs**: Append-only, HMAC-signed (tamper-proof)
- **Multi-Format Exports**: BCEAO, BCE, FED, SEC, ISO20022
- **Scheduled Exports**: Daily, weekly, monthly, quarterly
- **WORM Storage**: 10-year retention (S3 Glacier, compliance mode)
- **Auditor Access**: Read-only API keys for regulators
- **SIRA Integration**: Anomaly detection in compliance data
- **RBAC Protected**: Molam ID with `auditor_readonly`, `finance_ops`, `pay_admin`

## Database Tables
- `treasury_audit_logs` - Immutable audit trail (HMAC signed)
- `treasury_export_jobs` - Export job tracking
- `treasury_export_schedules` - Automated export schedules
- `auditor_accounts` - External regulator access
- `compliance_anomalies` - SIRA-detected anomalies

## Audit Log Events

**Event Types:**
- `payout` - Payout created/executed/failed
- `reconciliation` - Statement reconciled
- `sla_alert` - SLA threshold breached
- `float_move` - Treasury float movement
- `export_generated` - Regulatory export created
- `settlement` - Settlement instruction processed
- `routing_decision` - Bank routing selected

**HMAC Signature:**
```typescript
const signature = crypto
  .createHmac("sha256", AUDIT_SECRET)
  .update(JSON.stringify(payload))
  .digest("hex");
```

## Regulatory Export Formats

### BCEAO (West Africa)
**Format**: CSV, XML
**Content**: Daily balances, interbank flows, currency operations
**Frequency**: Daily (auto), Monthly (manual)

**CSV Structure:**
```csv
Date,Type,Actor,Entity,Amount,Currency,Description
2025-01-18,payout,system,uuid-123,1000.00,XOF,Settlement to merchant
```

### BCE (Europe)
**Format**: XML
**Content**: SEPA compliance, MiFID reporting
**Frequency**: Weekly

**XML Structure:**
```xml
<TreasuryReport xmlns="urn:bce:treasury:v1">
  <ReportHeader>
    <Generator>Molam Treasury</Generator>
    <GeneratedAt>2025-01-18T10:00:00Z</GeneratedAt>
  </ReportHeader>
  <Transactions>
    <Transaction>
      <ID>uuid-123</ID>
      <Type>payout</Type>
      <Timestamp>2025-01-18T09:30:00Z</Timestamp>
    </Transaction>
  </Transactions>
</TreasuryReport>
```

### FED (United States)
**Format**: JSON
**Content**: ACH/SWIFT reports, SAR (Suspicious Activity Reports)
**Frequency**: Daily

**JSON Structure:**
```json
{
  "report_type": "FED_TREASURY_REPORT",
  "generated_at": "2025-01-18T10:00:00Z",
  "period_start": "2025-01-01",
  "period_end": "2025-01-18",
  "transactions": [...]
}
```

### SEC (Securities)
**Format**: CSV
**Content**: Transaction logs with HMAC signatures
**Frequency**: On-demand

## API Endpoints

### POST /api/treasury/exports
Create export job.
```json
{
  "format": "BCEAO_CSV",
  "period_start": "2025-01-01",
  "period_end": "2025-01-31"
}
```

### GET /api/treasury/exports
List export jobs.
```bash
curl "/api/treasury/exports?limit=50&status=completed"
```

### GET /api/treasury/exports/:id
Get export details with checksum.

### GET /api/treasury/exports/:id/download
Download completed export (presigned URL).

### GET /api/treasury/audit-logs
Query audit logs.
```bash
curl "/api/treasury/audit-logs?event_type=payout&start_date=2025-01-01&limit=1000"
```

### GET /api/treasury/exports/stats
Get export statistics (30 days).

## Audit Logging

**Log Event:**
```typescript
await logAuditEvent({
  eventType: 'payout',
  actor: 'user-uuid',
  entityId: 'payout-uuid',
  payload: {
    amount: 1000,
    currency: 'XOF',
    merchant_id: 'merchant-uuid'
  }
});
```

**Verify Integrity:**
```typescript
const isValid = await verifyAuditLogIntegrity(logId);
// Returns true if HMAC signature matches
```

## Export Worker

Processes pending jobs every 60 seconds:
```bash
node src/workers/export-worker.ts
```

**Flow:**
1. Fetch pending export jobs
2. Query audit logs for period
3. Generate content in requested format
4. Calculate SHA-256 checksum
5. Upload to S3 (WORM storage)
6. Mark job as completed
7. Log export generation event

## Scheduled Exports

Configure automated exports:
```sql
INSERT INTO treasury_export_schedules(format, frequency, enabled)
VALUES ('BCEAO_CSV', 'daily', true);
```

**Frequency Options:**
- `daily` - Every day at 00:00 UTC
- `weekly` - Every Monday at 00:00 UTC
- `monthly` - 1st of month at 00:00 UTC
- `quarterly` - 1st of Jan/Apr/Jul/Oct at 00:00 UTC

## Auditor Access

Create read-only API key for regulators:
```sql
INSERT INTO auditor_accounts(regulator, contact_email, api_key, permissions, expires_at)
VALUES (
  'BCEAO',
  'audit@bceao.int',
  'ak_bceao_xxxxxxxxxxxxx',
  '{"can_view":["exports","audit_logs"]}'::jsonb,
  '2026-12-31'
);
```

**API Usage:**
```bash
curl -H "X-API-Key: ak_bceao_xxxxxxxxxxxxx" \
  "https://api.molam.com/api/treasury/audit-logs"
```

## SIRA Anomaly Detection

SIRA analyzes exports for:
- **Reconciliation Mismatches**: Match rate < threshold
- **Balance Inconsistencies**: Ledger vs bank statement gaps
- **Unusual Delays**: Settlement lag spikes
- **Suspicious Patterns**: High-frequency micro-transactions

**Anomaly Alert:**
```json
{
  "export_job_id": "uuid",
  "anomaly_type": "high_mismatch_rate",
  "severity": "critical",
  "description": "Match rate dropped to 97% (threshold: 99.5%)",
  "metadata": {
    "observed_rate": 0.97,
    "threshold": 0.995,
    "period": "2025-01-18"
  }
}
```

## WORM Storage

**S3 Object Lock Configuration:**
```json
{
  "ObjectLockEnabled": "Enabled",
  "ObjectLockConfiguration": {
    "ObjectLockEnabled": "Enabled",
    "Rule": {
      "DefaultRetention": {
        "Mode": "COMPLIANCE",
        "Years": 10
      }
    }
  }
}
```

**Lifecycle Policy:**
- Day 0-90: S3 Standard
- Day 90-365: S3 Intelligent-Tiering
- Day 365+: S3 Glacier Deep Archive

## Security & Compliance

**HMAC Secret Management:**
- Stored in Vault/KMS
- Rotated annually
- Multi-region backup

**Access Control:**
- `auditor_readonly` - Read audit logs & exports only
- `finance_ops` - Create exports, view all data
- `pay_admin` - Full access including auditor account management

**Data Retention:**
- Audit logs: Indefinite (append-only)
- Export files: 10 years (WORM)
- Compliance anomalies: 5 years

## Monitoring & SLOs

**Metrics:**
- `export_job_duration_seconds` - Export generation time
- `export_job_file_size_bytes` - Export file sizes
- `audit_log_signature_verification_failures` - Tamper detection

**SLOs:**
- Export generation P95 <5min
- Audit log ingestion P99 <100ms
- Signature verification 100% success

## Runbook

### Daily Export Generation
1. Scheduled job triggers at 00:00 UTC
2. Worker fetches audit logs for previous day
3. Generate CSV/XML/JSON per regulator requirements
4. Calculate checksum
5. Upload to S3 with WORM lock
6. Send notification to ops@molam.com

### External Audit Request
1. Regulator contacts compliance team
2. Finance Ops creates auditor account with expiry
3. Generate API key with read-only permissions
4. Provide API documentation and endpoints
5. Monitor access in audit logs
6. Revoke access after audit completion

### Signature Verification Failure
1. Alert triggered (potential tampering)
2. Freeze affected records
3. Notify security team + legal
4. Perform forensic analysis
5. Generate incident report
6. Restore from backup if necessary

## Integration Points
- **All Briques** - Audit logging integration
- **S3/Glacier** - WORM storage
- **Vault** - HMAC secret management
- **SIRA** - Compliance anomaly detection
- **Webhook Engine** - Export completion notifications

## UI Component

`ExportsPage.tsx` - Ops dashboard showing:
- Export statistics (pending, running, completed, failed)
- Create export form (format, period selection)
- Jobs table with download links
- Real-time status updates
- Checksum verification

**Version**: 1.0.0 | **Status**: ✅ Ready
