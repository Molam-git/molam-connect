# Brique 50 - Fiscal Reporting & Submission Automation

Automated fiscal reporting and submission system for multi-country tax compliance.

## Features

- **Multi-Country Support**: Generate fiscal reports for different countries (FR, SN, US, GB)
- **Multiple Formats**: CSV, XML, PDF, JSON
- **Multi-Channel Submission**: API, SFTP, Portal automation (Playwright)
- **HSM Signing**: Electronic signature support for compliance
- **SIRA Integration**: ML-based rejection prediction
- **WORM Storage**: 7-year retention compliance (S3 Object Lock)
- **Multi-Approval Workflow**: Finance + Compliance approval gates
- **Remediation Tracking**: Ops workflow for rejected/failed submissions
- **Audit Trail**: Immutable logging of all operations

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Fiscal Ops Dashboard                   │
│                    (React UI)                           │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Fiscal Reporting API (Express)             │
│  /api/fiscal/reports/generate                           │
│  /api/fiscal/reports/:id/submit                         │
│  /api/fiscal/channels                                   │
│  /api/fiscal/remediations                               │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Report Gen  │  │  Submission  │  │  Remediation │
│   Service    │  │   Service    │  │   Service    │
└──────────────┘  └──────────────┘  └──────────────┘
        │                  │                  │
        ├─────► Formatters (CSV, XML, PDF)   │
        ├─────► SIRA (Predict Reject)        │
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
        ┌──────────────────────────────────────┐
        │     Submission Connectors            │
        │  • API Connector                     │
        │  • SFTP Connector                    │
        │  • Portal Connector (Playwright)     │
        └──────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │      Tax Authorities                 │
        │  • DGI SN (API/SFTP)                 │
        │  • DGFiP FR (API)                    │
        │  • IRS US (Portal)                   │
        │  • HMRC GB (API)                     │
        └──────────────────────────────────────┘
```

## Database Schema

### Tables

1. **fiscal_reports** - Generated reports for legal entities
2. **fiscal_submission_channels** - Configured authority channels
3. **fiscal_submissions** - Submission attempts and history
4. **fiscal_remediations** - Ops remediation tasks
5. **fiscal_approvals** - Multi-signature approval workflow
6. **fiscal_audit_logs** - Immutable audit trail

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key configuration:

- `DATABASE_URL` - PostgreSQL connection
- `USE_LOCAL_STORAGE` - Use local files instead of S3
- `USE_HSM` - Enable HSM signing
- `SIRA_ENABLED` - Enable ML prediction
- `VAULT_*` - Authority credentials (stored in Vault)

## Database Migration

```bash
psql -U molam -d molam_fiscal -f migrations/050_fiscal_reporting.sql
```

## Usage

### Start Server

```bash
npm run dev    # Development
npm run build  # Production build
npm start      # Production server
```

### Start Worker

```bash
npm run worker
```

## API Endpoints

### Generate Report

```bash
POST /api/fiscal/reports/generate
{
  "legalEntity": "MOLAM_FR_SARL",
  "reportType": "vat_return",
  "periodStart": "2025-01-01",
  "periodEnd": "2025-01-31"
}
```

### Submit Report

```bash
POST /api/fiscal/reports/:id/submit
{
  "channelId": "uuid",
  "idempotencyKey": "optional-key"
}
```

### List Reports

```bash
GET /api/fiscal/reports?country=FR&status=ready
```

### List Channels

```bash
GET /api/fiscal/channels
```

### List Remediations

```bash
GET /api/fiscal/remediations
```

## Submission Channels

### API Connector

Direct API integration with authority endpoints.

**Example**: DGI SN API, DGFiP FR, HMRC GB

### SFTP Connector

Secure file transfer to authority SFTP servers.

**Example**: DGI SN SFTP

### Portal Connector

Browser automation using Playwright for authorities without APIs.

**Example**: IRS US eFile Portal

## SIRA Integration

ML-based rejection prediction before submission:

- **Score < 30%**: Auto-submit
- **Score 30-60%**: Warning, ops review recommended
- **Score > 60%**: Block submission, create remediation task

## Security

- **Vault**: Credentials stored in HashiCorp Vault
- **HSM**: Electronic signatures via CloudHSM/Azure Key Vault
- **mTLS**: Mutual TLS for API connectors
- **RBAC**: Role-based access control (finance_ops, tax_ops, compliance_admin)
- **WORM**: S3 Object Lock for 7-year retention

## Monitoring

Prometheus metrics:

- `b50_reports_generated_total` - Total reports generated
- `b50_submissions_total` - Total submissions by status/channel
- `b50_remediations_total` - Total remediation tasks

## Testing

```bash
npm test
```

## Deployment

1. Deploy database migrations
2. Configure Vault with authority credentials
3. Deploy API server (port 8050)
4. Deploy worker (cron/systemd)
5. Configure channels in database
6. Train Ops team on approval workflows

## Support

Contact: treasury-ops@molam.com
