# Brique 69bis — Advanced Reporting & Export

> Extension of Brique 69 with scheduled reports, multi-format exports, and custom dashboard views.

## Overview

Brique 69bis adds powerful reporting and export capabilities to the Analytics Dashboard:

- **Multi-format Export**: Generate reports in CSV, Excel (XLSX), or PDF
- **Scheduled Reports**: Automated report generation with CRON expressions
- **Email Delivery**: Automatic email notifications with secure download links
- **Custom Views**: Save and share custom dashboard configurations
- **Audit Trail**: Complete logging of all exports and report generation
- **Secure Storage**: S3/MinIO integration with presigned URLs (24h expiration)

## Features

### Export Formats

#### CSV
- Raw data export
- Lightweight and fast
- Compatible with all tools
- Best for data analysis

#### Excel (XLSX)
- Formatted spreadsheets
- Multiple sheets (data + summary)
- Auto-fitted columns
- Styled headers
- Best for business users

#### PDF
- Professional reports with charts
- Print-ready format
- Executive summaries
- Best for presentations

### Scheduled Reports

Create automated reports that run on a schedule:

```typescript
POST /api/analytics/reports/schedule
{
  "name": "Weekly Performance Report",
  "format": "xlsx",
  "cronExpr": "0 8 * * 1",  // Every Monday at 8:00 AM
  "queryParams": {
    "granularity": "day",
    "metrics": ["gross_volume_usd", "net_revenue_usd"],
    "dimensions": ["day", "country"]
  },
  "recipients": [
    { "email": "finance@merchant.com", "role": "finance" },
    { "email": "ops@merchant.com", "role": "ops" }
  ],
  "deliveryMethod": "email"  // or "webhook" or "both"
}
```

**CRON Schedules**:
- Daily: `0 8 * * *` (8:00 AM every day)
- Weekly: `0 8 * * 1` (Monday 8:00 AM)
- Monthly: `0 8 1 * *` (1st of month, 8:00 AM)

### Custom Views

Save dashboard configurations for quick access:

```typescript
POST /api/analytics/views
{
  "name": "CEDEAO Performance",
  "description": "Focus on West African markets",
  "viewConfig": {
    "dateRange": {
      "from": "2025-07-01",
      "to": "2025-07-31"
    },
    "granularity": "day",
    "metrics": ["gross_volume_usd", "tx_count"],
    "dimensions": ["country", "product_id"],
    "filters": {
      "region": "CEDEAO"
    },
    "sortBy": "gross_volume_usd",
    "sortOrder": "desc"
  },
  "isPublic": false,  // Private to user
  "sharedWith": ["user-id-1", "user-id-2"]  // Share with specific users
}
```

## API Endpoints

### Reports & Export

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `/api/analytics/reports/export` | POST | `analytics:view` | Generate report immediately |
| `/api/analytics/reports/schedule` | POST | `analytics:ops` | Create scheduled report |
| `/api/analytics/reports/schedules` | GET | `analytics:view` | List schedules |
| `/api/analytics/reports/schedules/:id` | PATCH | `analytics:ops` | Update schedule |
| `/api/analytics/reports/schedules/:id` | DELETE | `analytics:ops` | Delete schedule |
| `/api/analytics/reports/history` | GET | `analytics:view` | Export history |
| `/api/analytics/reports/templates` | GET | `analytics:view` | Pre-configured templates |

### Custom Views

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `/api/analytics/views` | POST | `analytics:view` | Create custom view |
| `/api/analytics/views` | GET | `analytics:view` | List views (own + shared + public) |
| `/api/analytics/views/:id` | GET | `analytics:view` | Get specific view |
| `/api/analytics/views/:id` | PATCH | `analytics:view` | Update view (owner only) |
| `/api/analytics/views/:id` | DELETE | `analytics:view` | Delete view (owner only) |

## Quick Start

### 1. Generate Immediate Export

```bash
curl -X POST http://localhost:8082/api/analytics/reports/export \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "xlsx",
    "reportName": "Q3 Performance Report",
    "queryParams": {
      "from": "2025-07-01",
      "to": "2025-09-30",
      "granularity": "day",
      "metrics": ["gross_volume_usd", "net_revenue_usd", "tx_count"],
      "dimensions": ["day", "country"]
    }
  }'
```

Response:
```json
{
  "downloadUrl": "https://s3.amazonaws.com/...",
  "fileName": "q3_performance_report_1234567890.xlsx",
  "format": "xlsx",
  "rowCount": 92,
  "fileSizeBytes": 45632,
  "expiresAt": "2025-07-16T10:00:00Z"
}
```

### 2. Create Scheduled Report

```bash
curl -X POST http://localhost:8082/api/analytics/reports/schedule \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Financial Summary",
    "format": "xlsx",
    "cronExpr": "0 8 * * *",
    "queryParams": {
      "granularity": "day",
      "metrics": ["gross_volume_usd", "fees_molam_usd", "refunds_usd"],
      "dimensions": ["day", "currency", "merchant_id"]
    },
    "recipients": [
      { "email": "finance@molam.io" }
    ],
    "deliveryMethod": "email"
  }'
```

### 3. Save Custom View

```bash
curl -X POST http://localhost:8082/api/analytics/views \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Top Products This Month",
    "viewConfig": {
      "metrics": ["gross_volume_usd", "tx_count"],
      "dimensions": ["product_id"],
      "sortBy": "gross_volume_usd",
      "sortOrder": "desc",
      "limit": 20
    }
  }'
```

## Configuration

### Environment Variables

```bash
# S3/MinIO Storage
S3_BUCKET=molam-analytics-reports
S3_REGION=us-east-1
S3_ENDPOINT=https://s3.amazonaws.com  # For MinIO: http://minio:9000
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_URL_EXPIRATION=86400  # 24 hours

# Email Service
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
EMAIL_FROM=noreply@molam.io

# Or use SendGrid directly
SENDGRID_API_KEY=your-api-key

# Report Generation
REPORT_TEMP_DIR=/tmp/reports
REPORT_SCHEDULER_INTERVAL=60000  # Check every 60 seconds

# For local development with MailHog
MAILER_PREVIEW=true  # Uses localhost:1025
```

### Running Services

```bash
# Start report scheduler
npm run reports

# Or with Docker Compose (includes all workers)
docker-compose up -d
```

## UI Components

### Export Modal

The React UI includes a beautiful export modal:

```typescript
import ExportModal from '@/components/ExportModal';

<ExportModal
  isOpen={exportModalOpen}
  onClose={() => setExportModalOpen(false)}
  onExport={async (config) => {
    const result = await exportReport(config);
    window.open(result.downloadUrl, '_blank');
  }}
/>
```

### Reports Page

Navigate to `/reports` in the dashboard to:
- View scheduled reports
- Generate ad-hoc exports
- Browse export history
- Manage schedules

## Export Templates

Pre-configured templates for common use cases:

1. **Daily Transaction Summary**
   - Metrics: volume, revenue, fees, tx count, success rate
   - Best for: daily operations

2. **Merchant Performance Report**
   - Top merchants by volume
   - Best for: ops and management

3. **Financial Reconciliation**
   - Detailed breakdown with currency conversion
   - Best for: finance and accounting

4. **Geographic Performance**
   - Volume by region and country
   - Best for: market analysis

Access templates via:
```bash
GET /api/analytics/reports/templates
```

## Security & Compliance

### RBAC Enforcement
- All exports require `analytics:view` permission
- Schedule management requires `analytics:ops`
- Custom views are user-scoped with sharing

### Audit Trail
Every export is logged in `analytics_report_audit`:
```sql
SELECT
  report_name,
  format,
  created_by,
  file_url,
  row_count,
  created_at
FROM analytics_report_audit
WHERE merchant_id = $1
ORDER BY created_at DESC;
```

### Data Protection
- Files stored on S3 with server-side encryption (AES-256)
- Presigned URLs expire after 24 hours
- Download links are one-time use
- No sensitive data in file names

### Volume Limits
- Max 10,000 rows per export (configurable)
- Rate limiting: 10 exports per hour per user
- Scheduled reports: max 50 active schedules per merchant

## Performance

### Optimization Tips

1. **Use CSV for large datasets** (10x faster than Excel)
2. **Limit date ranges** to reduce processing time
3. **Use hourly granularity** sparingly (generates more rows)
4. **Cache frequently accessed exports** (Redis)

### Benchmarks

| Format | 1K rows | 10K rows | 100K rows |
|--------|---------|----------|-----------|
| CSV | ~50ms | ~200ms | ~2s |
| XLSX | ~500ms | ~3s | ~25s |
| PDF | ~800ms | N/A* | N/A* |

*PDF limited to 50 rows for readability

## Troubleshooting

### Report Generation Fails

**Check logs:**
```bash
kubectl logs -f deployment/analytics-api -n molam | grep "report"
```

**Common issues:**
- Database timeout (increase query timeout)
- S3 credentials invalid (check env vars)
- Out of memory (increase Node heap size)

### Email Not Sent

**Check email service:**
```bash
# Test SMTP connection
telnet smtp.sendgrid.net 587
```

**Check audit log:**
```sql
SELECT * FROM analytics_report_audit
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

### Scheduled Report Not Running

**Check schedule status:**
```sql
SELECT id, name, last_run_status, next_run_at, error_count, last_error
FROM analytics_report_schedules
WHERE status = 'active'
AND is_enabled = true;
```

**Manually trigger:**
```bash
# Run scheduler once
npm run reports
```

## Migration Guide

### From Brique 69 to 69bis

1. **Run migrations:**
```bash
npm run migrate
```

2. **Update environment variables** (add S3 and email config)

3. **Start report scheduler:**
```bash
npm run reports
```

4. **Redeploy with new routes** (reports, custom views)

No breaking changes to existing API.

## Roadmap

### Phase 2
- [ ] Real-time report streaming (WebSocket)
- [ ] Custom report builder UI (drag & drop)
- [ ] Advanced chart types in PDF
- [ ] Multi-language support
- [ ] Report versioning
- [ ] Data retention policies

## Support

- **Documentation**: [docs.molam.io/analytics/reporting](https://docs.molam.io/analytics/reporting)
- **Issues**: [github.com/molam/analytics/issues](https://github.com/molam/analytics/issues)
- **Email**: support@molam.io

---

**Brique 69bis** | Advanced Reporting & Export | Version 1.0.0
