# Brique 110ter: AI Plugin Forge

**Industrial-grade automated plugin generation, testing, packaging, signing, and publishing system powered by Sira AI**

## Overview

Brique 110ter is a complete CI/CD pipeline for generating Molam Form plugins across all platforms (WooCommerce, Shopify, PrestaShop, Magento, Node, PHP, Python) with:

- 🤖 **Sira AI Generation** - Automated code generation with full audit trail
- 🏗️ **Multi-Stage Pipeline** - Generate → Build → Test → Sandbox → Package → Sign → Publish
- 🔐 **HSM Signing** - Hardware Security Module or Vault Transit for artifact signing
- ✅ **Contract Testing** - Automated validation of Molam event contracts
- 🐳 **Sandboxed Execution** - Docker-based isolated CMS environments
- 📝 **Multi-Sig Approvals** - Require 2+ approvals before publishing
- 🔍 **Full Observability** - Metrics, logs, and audit trails
- 🔄 **Idempotent & Resumable** - Safe retries and step-level resumption

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FORGE ORCHESTRATOR                          │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────────┤
│ Generate │  Build   │   Test   │ Sandbox  │ Package  │ Sign/Publish │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────────┘
     │          │          │          │          │           │
     ▼          ▼          ▼          ▼          ▼           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          SIRA AI ENGINE                              │
│  - Code Generation    - Template Selection    - Branding Injection  │
└──────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     DOCKER SANDBOX RUNNER                            │
│  - WooCommerce 6.x  - Shopify CLI  - PrestaShop 8.x  - Magento 2.x │
└──────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      VAULT / HSM SIGNING                             │
│  - Transit Encryption  - Key Rotation  - Audit Logging              │
└──────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    MARKETPLACE CONNECTORS                            │
│  - WordPress.org  - Shopify App Store  - Molam Marketplace          │
└──────────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Tables Created (10 tables)

1. **plugin_packages** - Registry of all generated plugins
2. **forge_jobs** - Plugin generation job queue
3. **forge_runs** - Individual pipeline step executions
4. **forge_approvals** - Multi-signature approvals for publishing
5. **plugin_contract_tests** - Contract test results
6. **plugin_compatibilities** - CMS version compatibility matrix
7. **sira_generation_audit** - Audit trail for Sira code generation
8. **forge_secrets** - Encrypted secrets for forge operations
9. **marketplace_connectors** - External marketplace integrations
10. **plugin_publications** - Tracking of published plugins

## Pipeline Steps

### 1. Generate (Sira AI)
**Responsibility**: Generate plugin code skeleton, tests, and manifest

```typescript
// Input
{
  "cms": "woocommerce",
  "merchant_branding": {
    "name": "My Shop",
    "logo_url": "https://...",
    "primary_color": "#0A84FF"
  },
  "features": ["checkout", "refunds", "webhooks"],
  "locale": "fr_FR"
}

// Output
{
  "files": [
    { "path": "molam-form-woocommerce.php", "content": "..." },
    { "path": "class-molam-gateway.php", "content": "..." },
    { "path": "tests/contract.test.php", "content": "..." }
  ],
  "manifest": {
    "name": "molam-form-woocommerce",
    "version": "1.0.0",
    "cms": "woocommerce",
    "supported_versions": ["6.x", "7.x"],
    "events": ["checkout.created", "payment.succeeded", "refund.issued"],
    "permissions": ["read_orders", "write_orders", "webhook_config"]
  }
}
```

**Sira Audit**:
- Prompt hash stored in `sira_generation_audit`
- Response hash stored for verification
- Model version tracked
- Full prompt/response logged (WORM storage)

### 2. Build
**Responsibility**: Compile, bundle, and prepare artifact

**For PHP plugins**:
```bash
composer install --no-dev
composer dump-autoload --optimize
```

**For Node plugins**:
```bash
npm ci
npm run build
npm prune --production
```

**Security scanning**:
```bash
npm audit --audit-level=moderate
composer audit
```

### 3. Test
**Responsibility**: Run unit tests and contract tests

**Contract Tests** (enforced):
```typescript
interface MolamPluginContract {
  events: {
    checkout_created: boolean;
    payment_succeeded: boolean;
    payment_failed: boolean;
    refund_issued: boolean;
  };
  webhooks: {
    signature_validation: boolean;
    payload_format: boolean;
    retry_logic: boolean;
  };
  permissions: {
    scoped_access: boolean;
    no_sensitive_data_logging: boolean;
  };
}
```

**Test execution**:
- PHPUnit for PHP plugins
- Jest for Node plugins
- Contract tests run in isolated environment
- All tests must pass before proceeding

### 4. Sandbox
**Responsibility**: Test plugin in isolated CMS environment

**Docker sandbox**:
```dockerfile
FROM wordpress:6.4-php8.1
RUN wp core install --url=sandbox.local --title="Molam Test"
COPY ./plugin /wp-content/plugins/molam-form
RUN wp plugin activate molam-form
```

**E2E test scenarios**:
1. Install and activate plugin
2. Configure API credentials
3. Create test order
4. Process payment
5. Verify webhooks sent
6. Test refund flow

**Sandbox outputs**:
- Screenshots of admin UI
- Webhook request logs
- Error logs
- Performance metrics

### 5. Package
**Responsibility**: Create distributable package

**Package structure**:
```
molam-form-woocommerce-1.0.0.zip
├── molam-form-woocommerce.php
├── class-molam-gateway.php
├── assets/
├── languages/
├── manifest.json
├── README.txt
└── LICENSE
```

**Package metadata**:
```json
{
  "name": "molam-form-woocommerce",
  "version": "1.0.0",
  "checksum": "sha256:abc123...",
  "size_bytes": 245760,
  "created_at": "2025-01-18T10:00:00Z"
}
```

### 6. Sign
**Responsibility**: Sign package with HSM/Vault

**Signing process**:
```typescript
// 1. Calculate package hash
const packageHash = crypto.createHash('sha256')
  .update(packageBuffer)
  .digest();

// 2. Sign with Vault Transit
const signature = await vaultClient.sign({
  path: 'transit/sign/molam-package-signing',
  data: packageHash.toString('base64')
});

// 3. Store signature
await db.query(
  `UPDATE plugin_packages SET signature = $1 WHERE id = $2`,
  [signature, packageId]
);
```

**Signature verification** (by merchants):
```bash
molam verify --package molam-form-woocommerce-1.0.0.zip --signature abc123...
```

### 7. Publish
**Responsibility**: Publish to marketplaces (requires approvals)

**Approval workflow**:
```
1. Package marked as 'signed'
2. Ops creates approval request
3. 2+ approvers with role 'plugin_forge_ops' approve
4. Publish step executes
5. Package pushed to marketplace(s)
6. Status updated to 'published'
```

**Marketplace connectors**:
- WordPress.org Plugin Directory (SVN)
- Shopify App Store (OAuth)
- Molam Internal Marketplace (API)
- PrestaShop Addons (API)

## API Endpoints

### Job Management

#### POST /api/v1/forge/jobs
**Create new forge job**

```http
POST /api/v1/forge/jobs
Content-Type: application/json
Authorization: Bearer {ops_token}

{
  "params": {
    "cms": "woocommerce",
    "merchant_branding": {
      "name": "My Shop",
      "logo_url": "https://example.com/logo.png",
      "primary_color": "#0A84FF"
    },
    "features": ["checkout", "refunds", "webhooks"],
    "locale": "fr_FR"
  },
  "idempotency_key": "job-2025-01-18-001"
}

Response 201:
{
  "id": "uuid",
  "status": "queued",
  "created_at": "2025-01-18T10:00:00Z"
}
```

#### GET /api/v1/forge/jobs
**List forge jobs**

```http
GET /api/v1/forge/jobs?status=running&limit=50

Response 200:
[
  {
    "id": "uuid",
    "plugin_package_id": "uuid",
    "requested_by": "uuid",
    "status": "running",
    "created_at": "2025-01-18T10:00:00Z"
  }
]
```

#### GET /api/v1/forge/jobs/:id
**Get job details**

```http
GET /api/v1/forge/jobs/{job_id}

Response 200:
{
  "id": "uuid",
  "plugin_package_id": "uuid",
  "requested_by": "uuid",
  "params": { ... },
  "status": "running",
  "created_at": "2025-01-18T10:00:00Z",
  "runs": [
    {
      "id": "uuid",
      "step": "generate",
      "status": "success",
      "duration_ms": 2345,
      "logs": [ ... ]
    },
    {
      "id": "uuid",
      "step": "build",
      "status": "running",
      "logs": [ ... ]
    }
  ]
}
```

#### GET /api/v1/forge/jobs/:id/logs
**Get job logs**

```http
GET /api/v1/forge/jobs/{job_id}/logs

Response 200:
{
  "job_id": "uuid",
  "runs": [
    {
      "step": "generate",
      "logs": [
        { "timestamp": "2025-01-18T10:00:01Z", "message": "Starting generate step" },
        { "timestamp": "2025-01-18T10:00:02Z", "message": "Calling Sira AI..." }
      ]
    }
  ]
}
```

#### POST /api/v1/forge/jobs/:id/cancel
**Cancel running job**

```http
POST /api/v1/forge/jobs/{job_id}/cancel

Response 200:
{
  "status": "ok",
  "message": "Job cancelled"
}
```

#### POST /api/v1/forge/jobs/:id/retry
**Retry failed job**

```http
POST /api/v1/forge/jobs/{job_id}/retry

Response 201:
{
  "new_job_id": "uuid",
  "status": "queued"
}
```

### Package Management

#### GET /api/v1/forge/packages
**List plugin packages**

```http
GET /api/v1/forge/packages?cms=woocommerce&status=published

Response 200:
[
  {
    "id": "uuid",
    "name": "molam-form-woocommerce",
    "slug": "molam-form-woocommerce",
    "version": "1.0.0",
    "cms": "woocommerce",
    "status": "published",
    "package_s3_key": "plugins/molam-form-woocommerce-1.0.0.zip",
    "published_at": "2025-01-18T10:00:00Z"
  }
]
```

#### GET /api/v1/forge/packages/:id
**Get package details**

```http
GET /api/v1/forge/packages/{package_id}

Response 200:
{
  "id": "uuid",
  "name": "molam-form-woocommerce",
  "manifest": {
    "name": "molam-form-woocommerce",
    "version": "1.0.0",
    "cms": "woocommerce",
    "supported_versions": ["6.x", "7.x"],
    "events": ["checkout.created", "payment.succeeded"]
  },
  "status": "published",
  "approvals": [
    {
      "approver_id": "uuid",
      "approver_role": "plugin_forge_ops",
      "approved": true,
      "created_at": "2025-01-18T09:50:00Z"
    }
  ]
}
```

#### POST /api/v1/forge/packages/:id/revoke
**Revoke published package**

```http
POST /api/v1/forge/packages/{package_id}/revoke
Content-Type: application/json

{
  "reason": "Critical security vulnerability discovered"
}

Response 200:
{
  "status": "ok",
  "message": "Package revoked and retracted from marketplaces"
}
```

### Approvals

#### POST /api/v1/forge/approvals
**Create approval request**

```http
POST /api/v1/forge/approvals
Content-Type: application/json

{
  "plugin_package_id": "uuid"
}

Response 201:
{
  "id": "uuid",
  "plugin_package_id": "uuid",
  "required_approvals": 2,
  "current_approvals": 0
}
```

#### POST /api/v1/forge/approvals/:package_id/approve
**Approve package for publishing**

```http
POST /api/v1/forge/approvals/{package_id}/approve
Content-Type: application/json
Authorization: Bearer {ops_token}

{
  "comment": "Reviewed code and tests - looks good",
  "signature": "mfa-signature-proof"
}

Response 200:
{
  "status": "ok",
  "approvals_count": 1,
  "required_approvals": 2,
  "can_publish": false
}
```

### Statistics

#### GET /api/v1/forge/stats
**Get forge statistics**

```http
GET /api/v1/forge/stats?days=30

Response 200:
{
  "total_jobs": 145,
  "queued": 3,
  "running": 2,
  "success": 128,
  "failed": 12,
  "success_rate": 91.4,
  "avg_duration_seconds": 342.5,
  "packages_by_cms": {
    "woocommerce": 85,
    "shopify": 42,
    "prestashop": 18
  }
}
```

## Ops UI Components

### Forge Dashboard

**File**: `src/components/ForgeDashboard.tsx`

**Features**:
- List all forge jobs with status filtering
- Create new job with form
- View job logs in real-time
- Cancel/retry jobs
- Stats cards (total, success, failed, avg duration)

**URL**: `http://localhost:3000/ops/forge`

### Approvals Panel

**File**: `src/components/ApprovalsPanel.tsx`

**Features**:
- List packages pending approval
- Review package details and manifest
- Approve/reject with MFA signature
- View approval history
- Multi-signature progress indicator

**URL**: `http://localhost:3000/ops/forge/approvals`

## Security

### Authentication & Authorization
- All endpoints require `plugin_forge_ops` or `pay_admin` role
- Approval requires MFA signature
- Job creation requires valid API token

### Secrets Management
- API keys stored in Vault
- Short-lived tokens for sandbox access
- No secrets in generated code (env vars only)
- Key rotation on schedule

### Artifact Signing
- HSM or Vault Transit for signing
- Private keys never leave HSM
- Signature verification by merchants
- Full audit trail of signatures

### Sandbox Security
- Network egress limited
- No internet access from sandbox
- Resource limits (CPU, memory, disk)
- Ephemeral containers destroyed after run
- Static analysis for malicious patterns

## Observability

### Metrics (Prometheus)

```
forge_jobs_total{status="success|failed|cancelled"}
forge_jobs_duration_seconds{step="generate|build|test|sandbox|package|sign|publish"}
forge_jobs_queued
forge_jobs_running
forge_packages_total{cms="woocommerce|shopify|..."}
forge_approvals_pending
```

### Logs (Structured JSON)

```json
{
  "timestamp": "2025-01-18T10:00:00Z",
  "level": "info",
  "service": "forge-orchestrator",
  "job_id": "uuid",
  "step": "generate",
  "message": "Sira generation completed",
  "metadata": {
    "model_version": "sira-v2.0",
    "generation_time_ms": 2345
  }
}
```

### SLOs

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Job success rate | ≥ 95% | < 90% for 1h |
| Avg job duration | ≤ 15 min | > 20 min for 6 jobs |
| Approval time (P95) | ≤ 2 hours | > 4 hours |
| Package signing success | 100% | Any failure |

## Testing

### Unit Tests

```typescript
// src/__tests__/orchestrator.test.ts
describe('Forge Orchestrator', () => {
  it('should run job to completion', async () => {
    const jobId = await createTestJob();
    await runJob(jobId);

    const job = await getJob(jobId);
    expect(job.status).toBe('success');
  });

  it('should handle step failures', async () => {
    const jobId = await createTestJob({ fail_at: 'build' });

    await expect(runJob(jobId)).rejects.toThrow();

    const job = await getJob(jobId);
    expect(job.status).toBe('failed');
  });
});
```

### Integration Tests

```typescript
// src/__tests__/integration/full-pipeline.test.ts
describe('Full Pipeline Integration', () => {
  it('should generate, build, test, and package plugin', async () => {
    const jobId = await createJob({
      cms: 'woocommerce',
      features: ['checkout']
    });

    await runJob(jobId);

    const pkg = await getPackageByJob(jobId);
    expect(pkg.status).toBe('signed');
    expect(pkg.signature).toBeDefined();
  });
});
```

### Contract Tests

```typescript
// src/__tests__/contract/molam-events.test.ts
describe('Plugin Contract Tests', () => {
  it('should emit checkout.created event', async () => {
    const plugin = await loadPlugin('woocommerce');
    const events = await triggerCheckout(plugin);

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'checkout.created',
        payload: expect.objectContaining({
          order_id: expect.any(String),
          amount: expect.any(Number)
        })
      })
    );
  });
});
```

## File Structure

```
brique-110ter/
├── migrations/
│   └── 001_plugin_forge.sql
├── src/
│   ├── forge/
│   │   ├── orchestrator.ts
│   │   └── steps/
│   │       ├── generate.ts
│   │       ├── build.ts
│   │       ├── test.ts
│   │       ├── sandbox.ts
│   │       ├── package.ts
│   │       ├── sign.ts
│   │       └── publish.ts
│   ├── sira/
│   │   └── index.ts
│   ├── vault.ts
│   ├── db.ts
│   ├── metrics.ts
│   └── routes/
│       └── forge.ts
├── docker/
│   ├── Dockerfile.sandbox
│   └── run_sandbox.sh
├── web/
│   └── ops/
│       ├── ForgeDashboard.tsx
│       └── ApprovalsPanel.tsx
├── tests/
│   ├── orchestrator.test.ts
│   ├── integration/
│   └── contract/
├── .github/
│   └── workflows/
│       └── forge-ci.yml
├── package.json
└── README.md
```

## Deployment

### Prerequisites
- PostgreSQL 12+
- Node.js 18+
- Docker (for sandbox)
- Vault (for secrets & signing)
- S3-compatible storage (for artifacts)

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost/molam_connect

# Vault
VAULT_URL=https://vault.molam.com
VAULT_TOKEN=s.xxx

# S3
S3_BUCKET=molam-forge-artifacts
S3_ENDPOINT=https://s3.amazonaws.com
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx

# Sira
SIRA_API_URL=https://sira.molam.com
SIRA_API_KEY=xxx

# Forge
FORGE_WORKER_CONCURRENCY=3
FORGE_MIN_APPROVALS=2
```

### Installation

```bash
# 1. Deploy database schema
psql -U postgres -d molam_connect -f migrations/001_plugin_forge.sql

# 2. Install dependencies
cd services/forge
npm install

# 3. Build TypeScript
npm run build

# 4. Start worker
npm start
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: forge-orchestrator
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: orchestrator
        image: molam/forge-orchestrator:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: forge-secrets
              key: database-url
```

## Runbook

### Create Job
```bash
curl -X POST http://localhost:3000/api/v1/forge/jobs \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "params": {
      "cms": "woocommerce",
      "merchant_branding": {"name": "My Shop"},
      "features": ["checkout"]
    }
  }'
```

### Monitor Job
```bash
# Watch logs in real-time
curl http://localhost:3000/api/v1/forge/jobs/{job_id}/logs

# Check status
curl http://localhost:3000/api/v1/forge/jobs/{job_id}
```

### Approve Package
```bash
curl -X POST http://localhost:3000/api/v1/forge/approvals/{package_id}/approve \
  -H "Authorization: Bearer {ops_token}" \
  -d '{"comment": "Approved", "signature": "mfa-proof"}'
```

### Emergency Revoke
```bash
curl -X POST http://localhost:3000/api/v1/forge/packages/{package_id}/revoke \
  -H "Authorization: Bearer {ops_token}" \
  -d '{"reason": "Critical security issue"}'
```

## Known Limitations

1. **Sira API dependency** - Requires Sira service availability
2. **Sandbox time limits** - E2E tests limited to 10 minutes
3. **Storage costs** - Artifacts stored indefinitely (WORM)
4. **Manual CMS updates** - New CMS versions require manual connector updates

## Roadmap

### Phase 1 (Complete)
- [x] Database schema
- [x] Orchestrator with all pipeline steps
- [x] Vault integration
- [x] Basic Ops UI

### Phase 2 (Next)
- [ ] Sira AI integration (real implementation)
- [ ] Full sandbox environments for all CMS
- [ ] Automated marketplace publishing
- [ ] Real-time log streaming (WebSocket)

### Phase 3 (Future)
- [ ] Self-learning from failed jobs
- [ ] Automated A/B testing of generated plugins
- [ ] Cross-platform plugin templates
- [ ] Merchant self-service portal

---

**Status**: ✅ **ARCHITECTURE COMPLETE - IMPLEMENTATION IN PROGRESS**

**Last Updated**: 2025-11-18
**Version**: 1.0.0
**Dependencies**: Brique 110, Brique 110bis, PostgreSQL 12+, Node.js 18+, Docker, Vault
**Related Briques**: 110 (Plugin Telemetry), 110bis (Auto-Healing & Interop), 68 (RBAC)
