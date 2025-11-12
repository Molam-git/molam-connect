# Brique 74 - Quick Start Guide

**Get up and running with the Developer Portal in 5 minutes**

Version: 1.0.0

---

## Prerequisites

- PostgreSQL 14+ installed
- Node.js 18+ installed
- Basic familiarity with command line

---

## Step 1: Database Setup (2 minutes)

### Apply Schema

```bash
# Navigate to brique-74 directory
cd brique-74

# Apply schema to your database
psql -d molam -f sql/001_developer_portal_schema.sql

# You should see:
# ✅ Brique 74 - Developer Portal Schema installed successfully
# 📊 Tables created: 10
# 📈 Views created: 2
# ⚡ Triggers created: 5
# 🔧 Functions created: 4
```

### Verify Installation

```bash
# Check tables were created
psql -d molam -c "\dt dev*"

# Expected output (10 tables):
# - developer_api_keys
# - developer_api_logs_2025_11 (and other partitions)
# - dev_playground_sessions
# - dev_playground_requests
# - dev_documentation_pages
# - dev_sdk_versions
# - dev_sdk_downloads_2025_11 (and other partitions)
# - dev_live_log_sessions
# - dev_feedback
# - dev_compliance_guides
```

---

## Step 2: Backend Setup (2 minutes)

### Install Dependencies

```bash
# Install Node.js packages
npm install
```

### Configure Environment

```bash
# Create .env file
cat > .env << EOF
# Database
DATABASE_URL=postgresql://localhost:5432/molam

# Server
PORT=3074
NODE_ENV=development

# API Base URL (for playground)
API_BASE_URL=http://localhost:3073

# Optional features
SIRA_AI_ENABLED=true
EOF
```

### Build and Start

```bash
# Build TypeScript
npm run build

# Start server
npm start

# You should see:
# 🚀 Developer Portal API running on port 3074
# ✅ Database connected
# ✅ Routes loaded: /dev/*
```

### Verify Backend

```bash
# Test health endpoint
curl http://localhost:3074/dev/health

# Expected response:
{
  "success": true,
  "service": "developer-portal",
  "version": "1.0.0",
  "timestamp": "2025-11-11T10:00:00.000Z"
}
```

---

## Step 3: Frontend Setup (1 minute)

### Build UI (Optional - for production)

```bash
cd src/ui

# Install dependencies
npm install

# Build production bundle
npm run build

# Output will be in: dist/
```

### Run Development Server

```bash
# Start React dev server
npm start

# Opens http://localhost:3000
# Developer Portal UI should load
```

---

## Step 4: First API Key (30 seconds)

### Using API (Recommended)

```bash
curl -X POST http://localhost:3074/dev/api-keys \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-123" \
  -H "X-Tenant-Id: tenant-123" \
  -H "X-Tenant-Type: merchant" \
  -d '{
    "name": "My First API Key",
    "environment": "test",
    "scopes": ["read", "write"],
    "rate_limit_per_second": 10
  }'

# Response (save the secret_key!):
{
  "success": true,
  "api_key": {
    "id": "key_abc123",
    "name": "My First API Key",
    "key_prefix": "pk_test_xyz...",
    "secret_key": "pk_test_xyz...FULL_SECRET_HERE",  ⚠️ SAVE THIS!
    "environment": "test",
    "scopes": ["read", "write"],
    "created_at": "2025-11-11T10:00:00Z"
  },
  "warning": "Save the secret_key securely. It will not be shown again."
}
```

### Using UI

1. Open http://localhost:3000
2. Click **"API Keys"** tab
3. Click **"+ Create New Key"** button
4. Fill in form:
   - **Name**: My First API Key
   - **Environment**: Test
   - **Scopes**: Check "read" and "write"
5. Click **"Create Key"**
6. **⚠️ IMPORTANT**: Copy and save the secret key (shown only once!)

---

## Step 5: Test Playground (30 seconds)

### Using UI

1. Click **"Playground"** tab
2. Select **POST** method
3. Enter endpoint: `/v1/payments`
4. Enter request body:
   ```json
   {
     "amount": 10000,
     "currency": "XOF",
     "description": "Test payment"
   }
   ```
5. Click **"Send"**
6. View response (mock data)

### Using API

```bash
# Create playground session
SESSION_ID=$(curl -X POST http://localhost:3074/dev/playground/sessions \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-123" \
  -H "X-Tenant-Id: tenant-123" \
  -H "X-Tenant-Type: merchant" \
  -d '{"name": "Quick Test", "environment": "sandbox"}' \
  | jq -r '.session.id')

# Execute request
curl -X POST http://localhost:3074/dev/playground/sessions/$SESSION_ID/execute \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-123" \
  -H "X-Tenant-Id: tenant-123" \
  -d '{
    "method": "POST",
    "endpoint": "/v1/payments",
    "body": {
      "amount": 10000,
      "currency": "XOF"
    }
  }'

# Response:
{
  "success": true,
  "request": {
    "id": "req_123",
    "status_code": 200,
    "response_body": {
      "id": "pay_mock_abc123",
      "amount": 10000,
      "currency": "XOF",
      "status": "succeeded"
    },
    "response_time_ms": 45
  }
}
```

---

## Common Use Cases

### Use Case 1: Create Production API Key

```bash
curl -X POST http://localhost:3074/dev/api-keys \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-123" \
  -H "X-Tenant-Id: tenant-123" \
  -d '{
    "name": "Production Key",
    "environment": "production",
    "scopes": ["read", "write", "webhooks:write"],
    "expires_in_days": 365,
    "rate_limit_per_second": 100,
    "allowed_ips": ["52.1.2.3", "52.1.2.4"]
  }'
```

### Use Case 2: Query API Logs

```bash
# Get logs from last hour with errors
curl -X GET "http://localhost:3074/dev/api-logs?status_code=500&limit=50" \
  -H "X-User-Id: user-123" \
  -H "X-Tenant-Id: tenant-123"

# Response:
{
  "success": true,
  "count": 5,
  "logs": [
    {
      "id": "log_123",
      "method": "POST",
      "path": "/v1/payments",
      "status_code": 500,
      "response_time_ms": 1234,
      "error_code": "internal_error",
      "created_at": "2025-11-11T10:30:00Z"
    }
  ]
}
```

### Use Case 3: Get API Key Statistics

```bash
# Get usage stats for last 7 days
curl -X GET "http://localhost:3074/dev/api-keys/key_abc123/stats?start_date=2025-11-04" \
  -H "X-User-Id: user-123" \
  -H "X-Tenant-Id: tenant-123"

# Response:
{
  "success": true,
  "stats": {
    "total_requests": 15234,
    "successful_requests": 15100,
    "failed_requests": 134,
    "avg_response_time_ms": 245.67,
    "p95_response_time_ms": 890.12,
    "unique_ips": 23,
    "endpoints_used": ["/v1/payments", "/v1/webhooks"]
  }
}
```

### Use Case 4: Search Documentation

```bash
# Search for webhook docs
curl -X GET "http://localhost:3074/dev/docs?q=webhook&category=guides"

# Response:
{
  "success": true,
  "count": 3,
  "docs": [
    {
      "slug": "webhooks-overview",
      "title": "Webhooks Overview",
      "description": "Learn how to receive real-time events...",
      "category": "webhooks"
    }
  ]
}
```

### Use Case 5: Download SDK

```bash
# List available SDKs
curl http://localhost:3074/dev/sdks

# Download Node.js SDK
curl -X POST http://localhost:3074/dev/sdks/sdk_node_123/download

# Response:
{
  "success": true,
  "sdk": {
    "download_url": "https://cdn.molam.com/sdk/node/1.0.0.tar.gz",
    "checksum_sha256": "abc123...",
    "size_bytes": 524288
  }
}

# Download file
wget $(curl -X POST http://localhost:3074/dev/sdks/sdk_node_123/download | jq -r '.sdk.download_url')
```

---

## Integration Example

### Full Integration Flow

```javascript
const axios = require('axios');

const DEV_PORTAL = 'http://localhost:3074';
const USER_ID = 'user-123';
const TENANT_ID = 'tenant-123';

// 1. Create API key
async function createAPIKey() {
  const response = await axios.post(`${DEV_PORTAL}/dev/api-keys`, {
    name: 'Integration Key',
    environment: 'production',
    scopes: ['read', 'write', 'webhooks:write'],
    rate_limit_per_second: 100,
  }, {
    headers: {
      'X-User-Id': USER_ID,
      'X-Tenant-Id': TENANT_ID,
      'X-Tenant-Type': 'merchant',
    },
  });

  const secretKey = response.data.api_key.secret_key;
  console.log('✅ API Key created:', secretKey);
  return secretKey;
}

// 2. Test API key in playground
async function testAPIKey(sessionId) {
  const response = await axios.post(
    `${DEV_PORTAL}/dev/playground/sessions/${sessionId}/execute`,
    {
      method: 'POST',
      endpoint: '/v1/payments',
      body: {
        amount: 10000,
        currency: 'XOF',
      },
    },
    {
      headers: {
        'X-User-Id': USER_ID,
        'X-Tenant-Id': TENANT_ID,
      },
    }
  );

  console.log('✅ Playground test:', response.data.request.status_code);
  return response.data;
}

// 3. Monitor API logs
async function monitorLogs(keyId) {
  const response = await axios.get(`${DEV_PORTAL}/dev/api-logs`, {
    params: {
      api_key_id: keyId,
      limit: 10,
    },
    headers: {
      'X-User-Id': USER_ID,
      'X-Tenant-Id': TENANT_ID,
    },
  });

  console.log('✅ Recent logs:', response.data.count);
  return response.data.logs;
}

// Run integration
async function main() {
  try {
    // Create key
    const apiKey = await createAPIKey();

    // Create playground session
    const sessionResponse = await axios.post(
      `${DEV_PORTAL}/dev/playground/sessions`,
      { name: 'Integration Test' },
      {
        headers: {
          'X-User-Id': USER_ID,
          'X-Tenant-Id': TENANT_ID,
        },
      }
    );
    const sessionId = sessionResponse.data.session.id;

    // Test in playground
    await testAPIKey(sessionId);

    // Monitor logs
    await monitorLogs(apiKey.id);

    console.log('✅ Integration complete!');
  } catch (error) {
    console.error('❌ Integration failed:', error.message);
  }
}

main();
```

---

## Troubleshooting

### Issue: Database connection error

**Error**: `ECONNREFUSED 127.0.0.1:5432`

**Solution**:
```bash
# 1. Check PostgreSQL is running
sudo systemctl status postgresql

# 2. Verify connection string
psql postgresql://localhost:5432/molam

# 3. Update DATABASE_URL in .env if needed
```

### Issue: Schema not found

**Error**: `relation "developer_api_keys" does not exist`

**Solution**:
```bash
# Re-run schema migration
psql -d molam -f sql/001_developer_portal_schema.sql

# Verify tables exist
psql -d molam -c "SELECT COUNT(*) FROM developer_api_keys;"
```

### Issue: Frontend not connecting to backend

**Error**: `Network Error` in browser console

**Solution**:
```bash
# 1. Verify backend is running
curl http://localhost:3074/dev/health

# 2. Check CORS configuration
# Add to backend (if needed):
app.use(cors({ origin: 'http://localhost:3000' }));

# 3. Update API_BASE_URL in frontend .env
echo "REACT_APP_API_BASE_URL=http://localhost:3074" > .env
```

### Issue: API key authentication failing

**Error**: `401 Unauthorized`

**Solution**:
```bash
# 1. Verify headers are set
curl -X GET http://localhost:3074/dev/api-keys \
  -H "X-User-Id: user-123" \
  -H "X-Tenant-Id: tenant-123" \
  -H "X-Tenant-Type: merchant" \
  -v

# 2. Check API key hasn't expired
psql -d molam -c "SELECT * FROM developer_api_keys WHERE id = 'key_abc123';"

# 3. Ensure key is active (not revoked)
```

---

## Next Steps

### 1. Customize Documentation

```bash
# Add your own doc pages
psql -d molam -c "
INSERT INTO dev_documentation_pages (slug, title, category, content_markdown, status)
VALUES ('custom-guide', 'Custom Integration Guide', 'guides', '# Custom Guide...', 'published');
"
```

### 2. Configure Rate Limits

```bash
# Update rate limits in .env
cat >> .env << EOF
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000
EOF
```

### 3. Set Up Monitoring

```bash
# Add Prometheus metrics endpoint
npm install prom-client

# Configure in server.ts
# See DEVELOPER_PORTAL.md for full example
```

### 4. Deploy to Production

```bash
# Build production bundle
npm run build

# Start with PM2
pm2 start dist/server.js --name "dev-portal"

# Set up nginx reverse proxy
# See DEVELOPER_PORTAL.md deployment section
```

### 5. Integrate with Main API

```javascript
// In your main API routes, log requests
const { logAPIRequest } = require('./services/developerPortal');

app.use(async (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', async () => {
    await logAPIRequest({
      request_id: req.id,
      tenant_type: req.user.tenant_type,
      tenant_id: req.user.tenant_id,
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      response_time_ms: Date.now() - startTime,
      ip_address: req.ip,
    });
  });

  next();
});
```

---

## Resources

### Documentation
- **Full Guide**: [DEVELOPER_PORTAL.md](./DEVELOPER_PORTAL.md)
- **API Reference**: [DEVELOPER_PORTAL.md#api-reference](./DEVELOPER_PORTAL.md#api-reference)
- **Architecture**: [DEVELOPER_PORTAL.md#architecture](./DEVELOPER_PORTAL.md#architecture)

### Code Examples
- **Service Layer**: [src/services/developerPortal.ts](./src/services/developerPortal.ts)
- **API Routes**: [src/routes/developerPortal.ts](./src/routes/developerPortal.ts)
- **UI Components**: [src/ui/components/DevPortal.tsx](./src/ui/components/DevPortal.tsx)

### Database
- **Schema**: [sql/001_developer_portal_schema.sql](./sql/001_developer_portal_schema.sql)

---

## Support

**Questions?** Check:
- [DEVELOPER_PORTAL.md](./DEVELOPER_PORTAL.md) - Complete documentation
- [GitHub Issues](https://github.com/molam/molam-connect/issues) - Bug reports
- [Email](mailto:developers@molam.com) - Direct support

---

**Brique 74 v1.0.0 - Developer Portal Quick Start**
*Get started in 5 minutes*

Updated: 2025-11-11
