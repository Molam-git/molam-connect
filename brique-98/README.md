# Brique 98 — Offline Fallback (QR / USSD)

**Version**: 1.0.0
**Status**: ✅ **PRODUCTION READY**
**Dependencies**: PostgreSQL, Redis (optional), AWS KMS, Brique 97 (Tokenization), Brique 94 (SIRA)
**Compliance**: Works in offline/low-connectivity environments

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [SDK Usage](#sdk-usage)
- [Security](#security)
- [Deployment](#deployment)
- [Testing](#testing)
- [Monitoring](#monitoring)

---

## 🎯 Overview

Brique 98 enables **offline payment processing** for Molam when network connectivity is unavailable. Transactions are stored locally on devices, encrypted, signed, and synced to the server when connectivity returns.

### Key Features

✅ **Offline Transaction Storage** - Local encrypted storage on POS/mobile devices
✅ **Device Signing** - ECDSA/RSA signatures for authenticity
✅ **Bundle Encryption** - AES-256-GCM with KMS key wrapping
✅ **Automatic Sync** - Push to server when connectivity returns
✅ **Anti-Replay Protection** - Nonce-based duplicate detection
✅ **Clock Skew Validation** - Detect device time tampering
✅ **Reconciliation Worker** - Async processing of offline bundles
✅ **SIRA Integration** - AI fraud detection on sync
✅ **Policy Management** - Per-country offline limits
✅ **QR Code Support** - Offline QR payments
✅ **Audit Trail** - Immutable offline payment logs

### Use Cases

1. **Rural Merchants** - Accept payments where network is unstable
2. **Mobile Agents** - Door-to-door cash-in/cash-out
3. **Event Venues** - High-volume transactions during network congestion
4. **Emergency Payments** - Critical transfers during network outages

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    POS / Mobile Device                      │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Offline SDK                                       │     │
│  │  - Create transactions locally                     │     │
│  │  - Sign with device private key                    │     │
│  │  - Encrypt with AES-256-GCM                        │     │
│  │  - Store in local storage                          │     │
│  └────────────────┬───────────────────────────────────┘     │
└────────────────────│────────────────────────────────────────┘
                     │ (When online)
                     ▼
      ┌───────────────────────────────────────┐
      │   Offline API Server                  │
      │   POST /offline/push                  │
      │   - Verify device signature           │
      │   - Decrypt bundle                    │
      │   - Validate (nonce, clock, policy)   │
      │   - SIRA fraud check                  │
      │   - Store in offline_tx_bundles       │
      └───────────────┬───────────────────────┘
                      │
                      ▼
      ┌───────────────────────────────────────┐
      │   Reconciliation Worker               │
      │   - Poll offline_sync_queue           │
      │   - Create ledger entries             │
      │   - Additional SIRA checks            │
      │   - Update bundle status              │
      └───────────────┬───────────────────────┘
                      │
                      ▼
      ┌───────────────────────────────────────┐
      │   PostgreSQL Database                 │
      │   - offline_devices                   │
      │   - offline_tx_bundles                │
      │   - offline_transactions              │
      │   - offline_policies                  │
      │   - offline_audit_logs (immutable)    │
      └───────────────────────────────────────┘
```

---

## ✨ Features

### 1. Device Registration

Devices must be registered with their public keys before accepting offline payments.

**API**: `POST /offline/devices` (requires `pay_admin` role)

### 2. Offline Transaction Bundle

Devices create encrypted, signed bundles containing multiple transactions.

**Bundle Structure**:
- Device signature (ECDSA/RSA)
- Encrypted payload (AES-256-GCM)
- Anti-replay nonce
- Device clock timestamp
- Transactions array

### 3. Automatic Sync

SDK automatically detects online status and syncs pending transactions.

**Sync Flow**:
1. Device comes online
2. SDK encrypts pending transactions
3. Signs bundle with device key
4. Pushes to `/offline/push`
5. Server validates and stores
6. Reconciliation worker processes

### 4. Fraud Detection

SIRA (Brique 94) scores bundles and transactions:
- Score < 15%: Auto-accept
- Score 15-35%: Manual review
- Score > 35%: Auto-quarantine

### 5. Policy Management

Ops can configure per-country limits:
- Max offline amount per transaction
- Max transactions per device per day
- Approval thresholds
- Bundle age limits

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 16+
- PostgreSQL 13+
- Redis 6+ (optional)
- AWS KMS or HSM

### 2. Installation

```bash
# Clone repository
git clone https://github.com/molam/molam-connect.git
cd molam-connect/brique-98

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
```

### 3. Database Setup

```bash
# Run migrations
npm run db:migrate

# Verify tables created
psql -U molam -d molam_offline -c "\dt"
```

### 4. Start Services

```bash
# Start API server
npm run dev

# Start reconciliation worker (separate terminal)
npm run worker:reconciliation:continuous
```

### 5. Test Integration

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

---

## 📡 API Reference

### 1. Push Offline Bundle

```http
POST /offline/push
Content-Type: application/json

{
  "device_id": "POS-001",
  "bundle_id": "bundle_12345",
  "encrypted_payload": "base64_encrypted_bundle",
  "signature": "base64_device_signature",
  "device_clock": "2025-01-15T12:00:00Z"
}
```

**Response**:
```json
{
  "success": true,
  "bundle_id": "bundle_12345",
  "status": "accepted",
  "sira_score": 0.05,
  "transactions_count": 5
}
```

### 2. Register Device

```http
POST /offline/devices
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "device_id": "POS-001",
  "tenant_type": "merchant",
  "tenant_id": "merchant_123",
  "pubkey_pem": "-----BEGIN PUBLIC KEY-----\n...",
  "country": "SN",
  "currency_default": "XOF"
}
```

### 3. Configure Policy

```http
POST /offline/policies
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "country": "SN",
  "max_offline_amount": 100000,
  "max_offline_per_device_per_day": 50,
  "max_bundle_age_hours": 72,
  "enabled": true
}
```

### 4. Get Bundle Status

```http
GET /offline/bundles/{bundle_id}
Authorization: Bearer {token}
```

**Response**:
```json
{
  "success": true,
  "bundle": {
    "bundle_id": "bundle_12345",
    "status": "reconciled",
    "tx_count": 5,
    "total_amount": 25000,
    "transactions": [...]
  }
}
```

---

## 📱 SDK Usage

### Initialize SDK

```typescript
import { OfflineSDK } from '@molam/brique-98/sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';

const sdk = new OfflineSDK({
  apiUrl: 'https://api.molam.com',
  deviceId: 'POS-001',
  storage: AsyncStorage,
  tenantType: 'merchant',
  tenantId: 'merchant_123',
  autoSync: true,
});

await sdk.initialize();
```

### Register Device

```typescript
// Get public key for registration
const publicKey = sdk.getPublicKey();

// Register with admin token
const result = await sdk.registerDevice(adminApiToken);
if (result.success) {
  console.log('Device registered successfully');
}
```

### Create Offline Transaction

```typescript
const result = await sdk.createOfflineTransaction({
  type: 'merchant',
  amount: 5000,
  currency: 'XOF',
  sender: 'user_123',
  receiver: 'merchant_456',
  merchant_id: 'merchant_456',
});

if (result.success) {
  console.log(`Transaction created: ${result.localId}`);
}
```

### Manual Sync

```typescript
const syncResult = await sdk.syncNow();

if (syncResult.success) {
  console.log(`Synced ${syncResult.bundlesPushed} bundles`);
} else {
  console.error(`Sync failed: ${syncResult.errors.join(', ')}`);
}
```

### Generate QR Code

```typescript
const qrResult = await sdk.generateOfflineQR();

if (qrResult.success) {
  // Use qrResult.qrData with QR library
  <QRCode value={qrResult.qrData} />
}
```

---

## 🔒 Security

### Device Signing

Each device has an ECDSA/RSA key pair:
- **Private key**: Stored securely on device (never transmitted)
- **Public key**: Registered with server for signature verification

### Bundle Encryption

Bundles encrypted with AES-256-GCM:
1. Generate random AES-256 key
2. Encrypt bundle payload
3. Wrap AES key with KMS
4. Store wrapped key with ciphertext

### Anti-Replay Protection

Nonce-based duplicate detection:
- Each bundle includes unique nonce
- Server tracks used nonces (24h TTL)
- Replay attempts rejected

### Clock Skew Validation

Prevents time-based attacks:
- Max 30 minutes skew allowed
- Rejects bundles with suspicious timestamps

### Bundle Age Validation

Prevents stale bundle acceptance:
- Max 72 hours age (configurable)
- Based on oldest transaction timestamp

---

## 🚢 Deployment

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

EXPOSE 8098

CMD ["npm", "start"]
```

### Kubernetes Deployment

See [docs/DEPLOYMENT_GUIDE.md](./docs/DEPLOYMENT_GUIDE.md) for complete Kubernetes configuration.

### Environment Variables

See [.env.example](./.env.example) for all configuration options.

---

## 🧪 Testing

### Run Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Integration tests only
npm run test:integration

# Coverage report
npm run test:coverage
```

### Test Coverage

**Target**: 80%+ coverage

---

## 📊 Monitoring

### Metrics

- `offline_bundles_pushed_total` - Total bundles pushed
- `offline_bundles_accepted_total` - Bundles accepted
- `offline_bundles_rejected_total` - Bundles rejected
- `offline_reconciliation_duration_seconds` - Reconciliation time
- `offline_sira_score_distribution` - SIRA score histogram

### Health Check

```http
GET /health
```

**Response**:
```json
{
  "status": "healthy",
  "database": "connected",
  "version": "1.0.0"
}
```

---

## 📚 Documentation

- [API Documentation](./docs/API.md)
- [SDK Documentation](./docs/SDK.md)
- [Deployment Guide](./docs/DEPLOYMENT_GUIDE.md)
- [Security Architecture](./docs/SECURITY.md)
- [Runbooks](./docs/runbooks/)

---

## 📞 Support

**Team**: Platform Team

**Slack**: `#platform-offline`

**Email**: platform@molam.co

---

## 📝 License

**Proprietary** - Molam
Copyright © 2025 Molam. All rights reserved.

---

**Version**: 1.0.0
**Last Updated**: 2025-01-15
**Authors**: Platform Team
