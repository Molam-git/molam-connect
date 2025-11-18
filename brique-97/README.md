# Brique 97 — PCI Tokenization Mode + Hosted Fallback

**Version**: 1.0.0
**Status**: ✅ **PRODUCTION READY**
**Dependencies**: AWS KMS (or HSM), PostgreSQL, Redis
**Compliance**: PCI DSS SAQ A / SAQ A-EP

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Security & Compliance](#security--compliance)
- [Deployment](#deployment)
- [Testing](#testing)
- [Runbooks](#runbooks)

---

## 🎯 Overview

Brique 97 provides **PCI-compliant tokenization** for payment methods (cards, bank accounts) to reduce merchant PCI scope and secure sensitive payment data.

### Key Features

✅ **PCI DSS Compliant** - Hosted iframe and vault architecture (SAQ A/A-EP)
✅ **Client Token System** - Short-lived, single-use tokens for iframe authentication
✅ **KMS/HSM Encryption** - All sensitive data encrypted at rest
✅ **Audit Logging** - Immutable append-only audit trail
✅ **RBAC & Tenant Isolation** - Role-based access control
✅ **SIRA Integration** - AI-powered fraud detection
✅ **Token Lifecycle Management** - Automated expiration and rotation
✅ **Idempotency** - Duplicate payment prevention
✅ **Rate Limiting** - Abuse protection
✅ **Webhook Events** - Real-time notifications

### Use Cases

1. **Molam Checkout** - Secure card collection for @molam/ui (Brique 96)
2. **Recurring Payments** - Store tokens for subscriptions
3. **Merchant Tokenization** - Reduce merchant PCI scope
4. **Multi-tenant Vault** - Shared tokenization infrastructure

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Merchant Website                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Hosted Iframe (https://hosted.molam.com)           │   │
│  │  ┌────────┐  ┌────────┐  ┌────────┐                │   │
│  │  │  PAN   │  │ Expiry │  │  CVC   │                │   │
│  │  └────────┘  └────────┘  └────────┘                │   │
│  │              [Submit] ──────┐                        │   │
│  └──────────────────────────────│───────────────────────┘   │
└─────────────────────────────────│────────────────────────────┘
                                  │
                                  ▼
          ┌───────────────────────────────────────┐
          │   Hosted Tokenization Server          │
          │   (PCI-compliant environment)         │
          │   /tokenize endpoint                  │
          └───────────────┬───────────────────────┘
                          │
                          ▼
          ┌───────────────────────────────────────┐
          │   Vault Provider (Stripe/Adyen/HSM)   │
          │   Tokenizes PAN → provider_ref        │
          └───────────────┬───────────────────────┘
                          │
                          ▼
          ┌───────────────────────────────────────┐
          │   Tokenization API                    │
          │   /api/tokenization/hosted-callback   │
          │   Encrypts provider_ref with KMS      │
          │   Stores in payment_methods table     │
          └───────────────┬───────────────────────┘
                          │
                          ▼
          ┌───────────────────────────────────────┐
          │   PostgreSQL Database                 │
          │   payment_methods (encrypted tokens)  │
          │   client_tokens                       │
          │   payment_method_audit (immutable)    │
          └───────────────────────────────────────┘
```

### Data Flow

1. **Client Token Generation**: Merchant requests client_token from API
2. **Iframe Mount**: Merchant embeds hosted iframe with client_token
3. **Card Entry**: User enters card details in PCI-compliant iframe
4. **Tokenization**: Iframe submits to /tokenize → vault provider
5. **Callback**: Vault returns provider_ref → API encrypts with KMS
6. **Storage**: Encrypted token stored in database
7. **Usage**: Token can be used for charges without exposing PAN

---

## ✨ Features

### 1. Client Token System

**Purpose**: Short-lived, single-use tokens to authenticate hosted iframe sessions

**Properties**:
- TTL: Max 300 seconds (default 120s)
- Single-use (replay protection)
- Origin-scoped (CORS validation)
- IP-bound (optional)
- SIRA risk-checked

**API**: `POST /api/tokenization/client-token`

### 2. Hosted Iframe

**Purpose**: PCI-compliant card collection UI

**Location**: `https://hosted.molam.com/hosted-card?token={client_token}`

**Security**:
- Strict CSP headers
- Sandboxed iframe
- Same-origin /tokenize endpoint
- No PAN logging
- Luhn validation

### 3. Payment Method Vault

**Storage**:
- Encrypted provider_ref (KMS/HSM)
- Masked metadata (last4, brand, expiry)
- Fingerprint for duplicate detection
- Usage policy (one_time, max_amount, allowed_countries)

**Lifecycle**:
- Automatic expiration after retention period
- Revocation on demand
- Expired card detection

### 4. Charge with Token

**Flow**:
1. Decrypt provider_ref from KMS
2. Validate usage policy
3. SIRA risk check
4. Call vault provider to charge
5. Record in ledger
6. Audit log
7. Revoke if one-time token

**Idempotency**: Duplicate charges prevented via idempotency_key

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 16+
- PostgreSQL 13+
- Redis 6+
- AWS KMS (or HSM)

### 2. Installation

```bash
# Clone repository
git clone https://github.com/molam/molam-connect.git
cd molam-connect/brique-97

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
```

### 3. Database Setup

```bash
# Run migrations
psql -U molam -d molam_tokenization -f migrations/001_create_tokenization_schema.sql

# Verify tables created
psql -U molam -d molam_tokenization -c "\dt"
```

### 4. Start Services

```bash
# Start main API
npm run dev

# Start hosted server (separate process)
npm run hosted

# Start token lifecycle worker
npm run worker
```

### 5. Test Integration

```bash
# Run tests
npm test

# Run with coverage
npm test:coverage
```

---

## 📡 API Reference

### 1. Generate Client Token

```http
POST /api/tokenization/client-token
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "merchant_id": "123e4567-e89b-12d3-a456-426614174000",
  "origin": "https://merchant.example.com",
  "ttl_seconds": 120
}
```

**Response**:
```json
{
  "client_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2025-01-15T12:35:00Z"
}
```

### 2. Hosted Callback (Internal)

```http
POST /api/tokenization/hosted-callback
Content-Type: application/json

{
  "client_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "provider_ref": "tok_1234567890abcdef",
  "last4": "4242",
  "brand": "visa",
  "exp_month": 12,
  "exp_year": 2026,
  "tenant_type": "user",
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response**:
```json
{
  "payment_method_id": "pm_9876543210fedcba"
}
```

### 3. List Payment Methods

```http
GET /api/payment-methods?tenant_type=user&tenant_id={uuid}
Authorization: Bearer {jwt}
```

**Response**:
```json
{
  "payment_methods": [
    {
      "id": "pm_9876543210fedcba",
      "type": "card",
      "last4": "4242",
      "brand": "visa",
      "exp_month": 12,
      "exp_year": 2026,
      "is_default": true,
      "created_at": "2025-01-15T12:00:00Z"
    }
  ]
}
```

### 4. Revoke Payment Method

```http
POST /api/tokenization/payment-methods/{id}/revoke
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "reason": "User requested deletion"
}
```

**Response**:
```json
{
  "success": true
}
```

### 5. Charge with Token (Internal)

```http
POST /api/tokenization/charge
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "payment_method_id": "pm_9876543210fedcba",
  "amount": 5000,
  "currency": "XOF",
  "merchant_id": "123e4567-e89b-12d3-a456-426614174000",
  "idempotency_key": "idem_unique_key_123"
}
```

**Response**:
```json
{
  "success": true,
  "charge_id": "charge_abc123",
  "provider_charge_id": "ch_1234567890"
}
```

---

## 🔒 Security & Compliance

### PCI DSS Compliance

**SAQ A-EP**: Merchant uses hosted iframe (no PAN touches merchant servers)

**Controls**:
- ✅ Encrypted data at rest (KMS/HSM)
- ✅ Encrypted data in transit (TLS 1.2+)
- ✅ No PAN logging
- ✅ Tokenization (no raw card data storage)
- ✅ Access controls (RBAC)
- ✅ Audit logging (immutable)
- ✅ Network segmentation (PCI-hosted server isolated)
- ✅ Vulnerability scanning
- ✅ Penetration testing

### Security Features

**Authentication**:
- JWT with role-based access control
- mTLS for internal services (optional)
- Origin validation (CORS)

**Encryption**:
- AWS KMS (or HSM) for token encryption
- AES-256-GCM (envelope encryption)
- Automatic key rotation support

**Rate Limiting**:
- Sliding window rate limiting (Redis)
- 100 req/min per IP (global)
- 10 req/min per user (strict endpoints)

**Audit Logging**:
- Append-only logs (no updates/deletes)
- All actions tracked (created, used, revoked)
- Actor identification
- Request correlation

---

## 🚢 Deployment

### Environment Setup

**Development**:
```bash
NODE_ENV=development
USE_REAL_KMS=false
VAULT_PROVIDER=mock
```

**Production**:
```bash
NODE_ENV=production
USE_REAL_KMS=true
VAULT_PROVIDER=stripe  # or adyen, hsm
ENFORCE_HTTPS=true
```

### Infrastructure Requirements

**PCI-Hosted Server**:
- Dedicated VPC/network
- No internet access (except vault provider)
- HSM for key storage (recommended)
- Audit logging to SIEM
- IDS/IPS monitoring

**Database**:
- PostgreSQL 13+ with encryption at rest
- Point-in-time recovery enabled
- Regular backups (encrypted)
- Read replicas for scaling

**Redis**:
- Persistent storage for rate limiting
- High availability (Sentinel or Cluster)

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: molam-tokenization-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: molam-tokenization-api
  template:
    metadata:
      labels:
        app: molam-tokenization-api
    spec:
      containers:
        - name: api
          image: molam/tokenization:1.0.0
          env:
            - name: NODE_ENV
              value: "production"
            - name: USE_REAL_KMS
              value: "true"
          ports:
            - containerPort: 8080
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
```

### Cron Jobs

**Token Lifecycle Worker**:
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: token-lifecycle-worker
spec:
  schedule: "0 * * * *"  # Hourly
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: worker
              image: molam/tokenization:1.0.0
              command: ["npm", "run", "worker"]
          restartPolicy: OnFailure
```

---

## 🧪 Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
npm run test:integration
```

### Security Tests

```bash
# PCI compliance validation
npm run test:pci

# Penetration testing
npm run test:pentest
```

### Test Coverage

**Target**: 80%+ coverage

**Coverage Report**:
```bash
npm run test:coverage
```

---

## 📚 Runbooks

See [docs/runbooks/](./docs/runbooks/) for detailed operational procedures:

- [Tokenization Failure](./docs/runbooks/tokenization-failure.md)
- [KMS Key Rotation](./docs/runbooks/kms-key-rotation.md)
- [Payment Method Revocation](./docs/runbooks/payment-method-revocation.md)
- [Emergency Token Cleanup](./docs/runbooks/emergency-cleanup.md)

---

## 📞 Support

**Team**: Platform Team / Security Team

**Slack**: `#platform-security`

**On-call**: See PagerDuty schedule

**Email**: security@molam.co

---

## 📝 License

**Proprietary** - Molam
Copyright © 2025 Molam. All rights reserved.

---

**Version**: 1.0.0
**Last Updated**: 2025-01-15
**Authors**: Platform Team + Security Team
