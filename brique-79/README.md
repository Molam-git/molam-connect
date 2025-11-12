# Brique 79 - Developer Console & API Keys Management

**Version**: 1.0.0
**Date**: 2025-11-12
**Status**: ✅ **Production Ready**

---

## 📋 Overview

**Brique 79 - Developer Console & API Keys Management** is an industrial-grade API key management system for Molam Connect. It provides secure, flexible, and scalable API authentication with:

- Test and live API keys
- Scope-based permissions
- IP restrictions and allowlists
- Rate limiting and quota management
- KMS/Vault encryption for secrets
- Copy-once secret display
- Key rotation with grace periods
- Complete audit trail
- Usage analytics and monitoring

### Key Features

✅ **Dual Mode Keys**: Test (sandbox) and Live (production) keys with separate workflows
✅ **KMS Encryption**: Secrets encrypted using AWS KMS, GCP KMS, HashiCorp Vault, or local encryption
✅ **Copy-Once Security**: Secrets displayed only once at creation/rotation
✅ **Scope-Based Permissions**: Fine-grained access control (payments:create, refunds:read, etc.)
✅ **IP Restrictions**: IP allowlists for enhanced security
✅ **Rate Limiting**: Token bucket algorithm with Redis backing
✅ **Quota Management**: Daily and monthly quotas per key
✅ **Key Rotation**: Seamless rotation with configurable grace periods
✅ **Ops Approval**: Live key creation requires approval for high-risk merchants
✅ **Complete Audit Trail**: Immutable log of all key events
✅ **Usage Analytics**: Real-time usage tracking with success/error rates

---

## 🎯 Use Cases

### 1. Merchant API Integration

**Scenario**: Merchant wants to integrate Molam Pay API into their e-commerce platform.

```bash
# 1. Create test key via Developer Console
POST /api/keys
{
  "tenant_type": "merchant",
  "tenant_id": "merchant-123",
  "mode": "test",
  "name": "E-commerce Integration",
  "scopes": ["payments:create", "payments:read", "refunds:create"]
}

# Response: Copy-once secret
{
  "key_id": "TK_test_AbC123XyZ456",
  "secret": "sk_test_N3w8R4nD0mS3cR3tK3y...",
  "message": "COPY-ONCE: Store securely"
}

# 2. Test integration in sandbox
curl -X POST https://api.molam.com/v1/payments \
  -H "Authorization: Bearer TK_test_AbC123XyZ456.sk_test_..." \
  -d '{"amount": 10000, "currency": "XOF"}'

# 3. Request live key after KYC
POST /api/keys
{
  "tenant_type": "merchant",
  "tenant_id": "merchant-123",
  "mode": "live",
  "name": "Production Key"
}

# Response: Live key (after ops approval if needed)
{
  "key_id": "MK_live_XyZ789AbC012",
  "secret": "sk_live_S3cUR3Pr0dK3y...",
  "message": "COPY-ONCE: Store securely"
}
```

### 2. Key Rotation

**Scenario**: Quarterly security rotation of API keys.

```bash
# Rotate key with 10-minute grace period
POST /api/keys/MK_live_XyZ789AbC012/rotate
{
  "grace_period_seconds": 600
}

# Response
{
  "key_id": "MK_live_XyZ789AbC012",
  "new_version": 2,
  "secret": "sk_live_N3wR0T4t3dK3y...",
  "message": "Old secret valid for 10 minutes"
}

# Old secret still works for 10 minutes
# Update application with new secret
# After grace period, old secret is revoked
```

### 3. Compromised Key Revocation

**Scenario**: Security breach detected, need to revoke key immediately.

```bash
# Revoke key instantly
POST /api/keys/MK_live_XyZ789AbC012/revoke
{
  "reason": "Security breach detected"
}

# All requests with this key now fail
# Create new key for merchant
```

---

## 🏗️ Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│              API Keys Management System                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │ API Routes   │   │   Service    │   │  PostgreSQL  │    │
│  │              │──▶│              │──▶│              │    │
│  │  - Create    │   │  - Validate  │   │  - Keys      │    │
│  │  - Rotate    │   │  - Encrypt   │   │  - Secrets   │    │
│  │  - Revoke    │   │  - Track     │   │  - Usage     │    │
│  └──────────────┘   └──────────────┘   └──────────────┘    │
│         │                    │                                │
│         │                    ├──────────▶ KMS/Vault          │
│         │                    ├──────────▶ Redis              │
│         │                    └──────────▶ Ops Approval (B78) │
│         │                                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Middleware (API Key Auth)                │   │
│  │  - Validate signature                                 │   │
│  │  - Check scopes                                       │   │
│  │  - Enforce IP restrictions                            │   │
│  │  - Rate limiting (Redis)                              │   │
│  │  - Quota enforcement                                  │   │
│  │  - Usage tracking                                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Create Key
   ├─ Generate key_id (MK_live_XXX or TK_test_XXX)
   ├─ Generate random secret (256-bit)
   ├─ Hash secret (SHA256)
   ├─ Encrypt secret with KMS
   ├─ Store ciphertext in database
   ├─ Return plaintext secret (COPY-ONCE)
   └─ Audit: "created"

2. API Request Authentication
   ├─ Extract Authorization header
   ├─ Parse key_id and secret
   ├─ Lookup key in database
   ├─ Validate secret (constant-time comparison)
   ├─ Check restrictions (IP, scope, etc.)
   ├─ Check quota (Redis + DB)
   ├─ Check rate limit (Redis token bucket)
   ├─ Attach key context to request
   ├─ Record usage (async)
   └─ Allow/deny request

3. Key Rotation
   ├─ Generate new secret
   ├─ Encrypt with KMS
   ├─ Store as new version
   ├─ Mark old version as "retiring"
   ├─ Set grace period expiration
   ├─ Return new secret (COPY-ONCE)
   ├─ Audit: "rotated"
   └─ After grace period: mark old as "revoked"
```

---

## 📦 Installation

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- Redis >= 6
- KMS/Vault (optional, local encryption for dev)

### Setup

1. **Run SQL Schema**

```bash
psql -U postgres -d molam_connect -f sql/008_api_keys_schema.sql
```

2. **Install Dependencies**

```bash
npm install express pg express-validator redis
npm install --save-dev @types/express @types/pg
```

3. **Environment Variables**

```bash
# Database
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=molam_connect
export DB_USER=postgres
export DB_PASSWORD=your_password

# Redis
export REDIS_URL=redis://localhost:6379

# KMS (choose one)
export KMS_PROVIDER=local  # or aws, gcp, vault
export KMS_LOCAL_KEY=dev-encryption-key-32bytes

# AWS KMS
export AWS_REGION=us-east-1
export KMS_KEY_ID=arn:aws:kms:...

# GCP KMS
export KMS_KEY_ID=projects/.../locations/.../keyRings/.../cryptoKeys/...

# Vault
export VAULT_ENDPOINT=https://vault.example.com
export VAULT_TOKEN=...
```

4. **Start Service**

```typescript
import express from 'express';
import apiKeysRoutes from './routes/apiKeysRoutes';
import { apiKeyAuth, requireScope } from './middleware/apiKeyAuth';

const app = express();
app.use(express.json());

// Key management endpoints
app.use('/api/keys', apiKeysRoutes);

// Protected API endpoints
app.use('/api/v1', apiKeyAuth());
app.post('/api/v1/payments', requireScope('payments:create'), paymentsHandler);
app.get('/api/v1/payments', requireScope('payments:read'), listPaymentsHandler);

app.listen(3000, () => {
  console.log('API Keys service running on port 3000');
});
```

---

## 📚 API Reference

See [API_GUIDE.md](./API_GUIDE.md) for complete API documentation.

### Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/keys` | POST | Create API key |
| `/api/keys` | GET | List API keys |
| `/api/keys/:keyId` | GET | Get key details |
| `/api/keys/:keyId/rotate` | POST | Rotate key |
| `/api/keys/:keyId/revoke` | POST | Revoke key |
| `/api/keys/:keyId/usage` | GET | Get usage stats |
| `/api/keys/:keyId/quota` | GET | Get quota status |
| `/api/keys/validate` | POST | Validate key (testing) |

---

## 🔧 Configuration

### Scopes

Available scopes for API keys:

| Scope | Description |
|-------|-------------|
| `payments:create` | Create payments |
| `payments:read` | Read payment data |
| `payments:update` | Update payments |
| `payments:delete` | Delete/cancel payments |
| `refunds:create` | Create refunds |
| `refunds:read` | Read refund data |
| `webhooks:manage` | Manage webhooks |
| `reports:read` | Access reports |
| `merchants:manage` | Manage merchant settings |

### Restrictions

Configure restrictions per key:

```json
{
  "restrictions": {
    "ip_allowlist": ["192.168.1.1", "10.0.0.0/8"],
    "allowed_currencies": ["XOF", "USD", "EUR"],
    "allowed_origins": ["https://example.com"],
    "allowed_countries": ["CI", "SN", "BF"],
    "quotas": {
      "daily": 10000,
      "monthly": 300000
    },
    "rate_limit": {
      "requests_per_second": 100,
      "burst": 200
    }
  }
}
```

---

## 🔒 Security

### Encryption

- Secrets encrypted using KMS/Vault (AWS KMS, GCP KMS, HashiCorp Vault)
- Ciphertext stored in database
- Plaintext never logged
- Constant-time comparison to prevent timing attacks

### Copy-Once

- Secret displayed only once at creation/rotation
- Cannot be retrieved after initial display
- Rotation required to get new secret

### Audit Trail

All events logged:
- Key created
- Key rotated
- Key revoked
- Authentication attempts (success/failure)
- IP restrictions enforced
- Quota exceeded
- Rate limited

### Best Practices

1. **Test in Sandbox**: Always test with test keys before using live keys
2. **Rotate Regularly**: Rotate keys quarterly or after personnel changes
3. **Restrict IP**: Use IP allowlists for production keys
4. **Minimal Scopes**: Grant only required scopes
5. **Monitor Usage**: Set up alerts for unusual usage patterns
6. **Revoke Immediately**: Revoke compromised keys instantly

---

## 📊 Monitoring

### Key Metrics

- **API Key Requests**: Total requests per key
- **Success Rate**: % of successful requests
- **Auth Failures**: Failed authentication attempts
- **Quota Usage**: Daily/monthly quota consumption
- **Rate Limit Hits**: Rate limit violations

### Prometheus Metrics

```prometheus
api_key_requests_total{key_id,scope,status}
api_key_auth_failures_total{key_id,reason}
api_key_quota_exceeded_total{key_id}
api_key_rate_limit_hits_total{key_id}
```

---

## 🧪 Testing

### Unit Tests

```typescript
import { createAPIKey, rotateAPIKey, validateAPIKey } from './services/apiKeysService';

describe('API Keys Service', () => {
  it('should create key with copy-once secret', async () => {
    const result = await createAPIKey({
      tenant_type: 'merchant',
      tenant_id: 'merchant-123',
      mode: 'test',
      name: 'Test Key',
    });

    expect(result.key.key_id).toMatch(/^TK_test_/);
    expect(result.secret).toHaveLength(44); // Base64 encoded 32 bytes
  });

  it('should validate key with correct secret', async () => {
    const { key, secret } = await createAPIKey({...});
    const validation = await validateAPIKey(key.key_id, secret);

    expect(validation.valid).toBe(true);
  });

  it('should fail validation with incorrect secret', async () => {
    const { key } = await createAPIKey({...});
    const validation = await validateAPIKey(key.key_id, 'wrong-secret');

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('invalid_secret');
  });
});
```

---

## 🚀 Roadmap

### Phase 2 (Q1 2026)

- [ ] React Developer Console UI
- [ ] API Playground (test API calls in browser)
- [ ] Webhook tester
- [ ] SDK code generators (Node, Python, PHP)
- [ ] Key usage analytics dashboard
- [ ] SIRA integration for anomaly detection
- [ ] Multi-factor authentication for key operations

---

## 📝 License

Proprietary - Molam Pay © 2025

---

**Brique 79 v1.0 - API Keys Management**

Status: ✅ **Production Ready**
Lines of Code: **2,500+**
Key Features: **KMS encryption, Copy-once, Rate limiting, Quotas, Audit**

Built with ❤️ by Molam Team
2025-11-12
