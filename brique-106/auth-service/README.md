# Molam Auth Service - Adaptive 3DS & OTP UX (SIRA)

**Intelligent authentication decision engine that dynamically selects optimal authentication methods to reduce payment abandonment while maintaining security compliance.**

[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## Features

- **🧠 Intelligent Decision Engine**: SIRA risk-based authentication method selection
- **🔒 Multi-Method Support**: 3DS2, 3DS1, OTP SMS, OTP Voice, Biometric
- **🌍 Global Coverage**: Provider routing for optimal delivery (Twilio, Orange SMS)
- **⚡ Low Latency**: P95 < 30ms decision latency with fallback strategies
- **📊 Analytics & Audit**: Complete decision logging for compliance and optimization
- **🛡️ Device Trust**: "Remember device" functionality to reduce friction
- **🔄 Automatic Fallback**: Seamless fallback from 3DS2 to OTP when ACS unavailable
- **📈 Observable**: Prometheus metrics, structured logging, SLO tracking

---

## Table of Contents

- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Decision Logic](#decision-logic)
- [Database Schema](#database-schema)
- [Providers](#providers)
- [Metrics & SLOs](#metrics--slos)
- [Security](#security)
- [Development](#development)
- [Deployment](#deployment)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Molam Payment Intent                   │
└──────────────────┬──────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────┐
│          Auth Decision Service (This)               │
├─────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ SIRA         │  │ BIN Lookup   │  │ Device   │  │
│  │ Risk Scoring │  │ (3DS Support)│  │ Trust    │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│                         │                            │
│                   Decision Rules                     │
│                         ↓                            │
│  ┌────────────────────────────────────────────┐     │
│  │  recommended: '3ds2' | 'otp_sms' | 'none' │     │
│  │  fallback: ['otp_sms', '3ds1']            │     │
│  │  risk_score: 72                            │     │
│  └────────────────────────────────────────────┘     │
└──────────────────┬──────────────────────────────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
         ↓                   ↓
┌─────────────────┐  ┌──────────────────┐
│  3DS2 Challenge │  │  OTP Delivery    │
│  (ACS Server)   │  │  (SMS/Voice)     │
└─────────────────┘  └──────────────────┘
```

---

## Installation

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 13
- Redis >= 6.0
- Twilio account (for SMS/Voice) or Orange SMS (West Africa)

### Setup

```bash
# Clone repository
git clone https://github.com/molam/auth-service.git
cd auth-service

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

---

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```bash
# Server
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/molam_auth

# Redis
REDIS_URL=redis://localhost:6379

# SIRA Risk Scoring
SIRA_API_URL=https://sira-api.molam.internal
SIRA_API_KEY=sira_key_xxx
SIRA_TIMEOUT_MS=500

# BIN Lookup
BIN_LOOKUP_API_URL=https://binlist.molam.com
BIN_LOOKUP_API_KEY=bin_key_xxx

# OTP Settings
OTP_LENGTH=6
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=3

# Twilio (SMS/Voice)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890

# Orange SMS (West Africa)
ORANGE_SMS_CLIENT_ID=your_client_id
ORANGE_SMS_CLIENT_SECRET=your_client_secret

# Decision Thresholds
RISK_THRESHOLD_3DS2_REQUIRED=80
RISK_THRESHOLD_OTP_REQUIRED=50
RISK_THRESHOLD_LOW_FRICTION=30
```

---

## API Reference

### Auth Decision Endpoints

#### POST `/v1/auth/decide`

Make authentication method decision.

**Request:**

```json
{
  "payment_id": "uuid",
  "user_id": "uuid",
  "amount": 12345,
  "currency": "USD",
  "device": {
    "ip": "192.168.1.1",
    "ua": "Mozilla/5.0...",
    "fingerprint": "fp_abc123"
  },
  "bin": "424242",
  "country": "US",
  "merchant_id": "uuid"
}
```

**Response:**

```json
{
  "decision_id": "uuid",
  "risk_score": 72,
  "recommended": "3ds2",
  "explain": {
    "factors": ["new_device", "high_amount"],
    "sira": { "score": 72, "level": "high" },
    "card_capabilities": {
      "supports_3ds2": true,
      "supports_3ds1": true,
      "scheme": "visa"
    },
    "device_trust": null
  },
  "ttl_seconds": 120,
  "fallback_methods": ["3ds1", "otp_sms", "otp_voice"]
}
```

#### POST `/v1/auth/outcome`

Record authentication outcome for analytics.

**Request:**

```json
{
  "decision_id": "uuid",
  "successful": true,
  "duration_ms": 3456,
  "abandonment": false
}
```

#### POST `/v1/auth/fallback`

Update decision when fallback method is used.

```json
{
  "decision_id": "uuid",
  "final_method": "otp_sms",
  "fallback_reason": "3ds_acs_timeout"
}
```

### OTP Endpoints

#### POST `/v1/otp/create`

Generate and send OTP.

**Request:**

```json
{
  "user_id": "uuid",
  "payment_id": "uuid",
  "phone": "+15551234567",
  "phone_country_code": "US",
  "method": "sms",
  "device_fingerprint": "fp_abc123"
}
```

**Response:**

```json
{
  "otp_id": "uuid",
  "phone": "+155****67",
  "method": "sms",
  "expires_at": "2025-01-16T12:05:00Z",
  "max_attempts": 3
}
```

#### POST `/v1/otp/verify`

Verify OTP code.

**Request:**

```json
{
  "otp_id": "uuid",
  "code": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "message": "OTP verified successfully"
}
```

#### POST `/v1/otp/resend`

Resend OTP to same phone.

```json
{
  "otp_id": "uuid"
}
```

---

## Decision Logic

### Risk Score Thresholds

| Risk Score | Recommended Method | Notes |
|------------|-------------------|-------|
| 80-100 | 3DS2 (required) | High-risk transactions, 3DS2 mandatory if supported |
| 50-79 | 3DS2 or OTP SMS | Prefers 3DS2, falls back to OTP |
| 30-49 | OTP SMS (trusted: none) | OTP for unknown devices, frictionless for trusted |
| 0-29 | None (frictionless) | Low-risk, no additional auth required |

### Fallback Rules

1. **3DS2 → 3DS1 → OTP SMS → OTP Voice**
   - If 3DS2 ACS unavailable, fallback to 3DS1
   - If 3DS1 fails, fallback to OTP SMS
   - If SMS fails, try Voice

2. **OTP SMS → OTP Voice**
   - Delivery failure triggers voice fallback

3. **Country-Specific Routing**
   - West Africa (SN, CI, BJ, TG): Orange SMS preferred
   - Other regions: Twilio

### Device Trust

- **New Device**: Full authentication required
- **Trusted Device** (3+ successful auths): Reduced friction
- **Suspicious Device** (3+ failed auths): Elevated security

---

## Database Schema

### Key Tables

**auth_decisions**
- Logs all authentication decisions
- Tracks risk scores, methods, outcomes
- Supports analytics and auditing

**otp_requests**
- Manages OTP lifecycle
- Tracks delivery status and verification attempts
- Argon2-hashed codes with TTL

**device_trust**
- Stores trusted device fingerprints
- Trust level scoring
- "Remember device" functionality

**threeds_challenges**
- 3DS2 challenge tracking
- ACS integration logging

See [migrations/001_auth_decisions_and_otp.sql](migrations/001_auth_decisions_and_otp.sql) for complete schema.

---

## Providers

### SMS Providers

**Twilio** (Global)
- Reliable delivery worldwide
- Rich status tracking

**Orange SMS** (West Africa)
- Optimized for SN, CI, BJ, TG, ML, BF
- OAuth2 authentication
- Localized messaging

### Voice Providers

**Twilio Voice**
- TwiML-based voice OTP
- Multi-language support (English, French)
- Code spoken twice for clarity

### Provider Selection

Automatic routing based on country code:

```typescript
if (countryCode in ['SN', 'CI', 'BJ', 'TG', 'ML', 'BF']) {
  return orangeSmsProvider;
} else {
  return twilioProvider;
}
```

---

## Metrics & SLOs

### Service Level Objectives

- **Decision Latency**: P95 < 30ms
- **OTP Delivery**: 98% within 30 seconds
- **3DS2 Success Rate**: > 85% when recommended
- **API Availability**: 99.9% uptime

### Prometheus Metrics

Exposed on `:9090/metrics`:

```
# Decision metrics
molam_auth_decisions_total{method,country}
molam_auth_decision_latency_seconds{method}
molam_auth_success_rate{method,country}

# OTP metrics
molam_otp_created_total{method,provider}
molam_otp_delivered_total{method,provider}
molam_otp_verified_total
molam_otp_delivery_latency_seconds{provider}

# Provider metrics
molam_provider_errors_total{provider,error_type}
```

---

## Security

### Best Practices

1. **OTP Storage**: Argon2-hashed, never plaintext
2. **Rate Limiting**: Sliding window (Redis-based)
   - 5 OTP requests per phone/hour
   - 10 OTP requests per IP/hour
3. **Secrets Management**: Use Vault or AWS Secrets Manager in production
4. **TLS Only**: Enforce HTTPS in production
5. **Audit Logging**: All decisions logged for compliance

### PCI DSS & PSD2 Compliance

- 3DS2 preferred for SCA compliance (PSD2)
- Fallback mechanisms ensure zero payment failures
- Complete audit trail for regulatory requirements

---

## Development

### Running Tests

```bash
# Unit tests
npm test

# Coverage
npm run test -- --coverage

# Watch mode
npm run test:watch
```

### Linting & Formatting

```bash
# Lint
npm run lint

# Format
npm run format

# Type check
npm run typecheck
```

### Database Migrations

```bash
# Run migrations
npm run migrate

# Rollback last migration
npm run migrate:rollback
```

---

## Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  auth-service:
    build: .
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/molam_auth
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: molam_auth
      POSTGRES_PASSWORD: password
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  postgres-data:
  redis-data:
```

### Kubernetes (Helm)

See [helm/](helm/) directory for Kubernetes deployment charts.

---

## Support

- **Documentation**: [https://docs.molam.io/auth](https://docs.molam.io/auth)
- **API Reference**: [https://api.molam.io/docs/auth](https://api.molam.io/docs/auth)
- **GitHub Issues**: [https://github.com/molam/auth-service/issues](https://github.com/molam/auth-service/issues)
- **Email**: support@molam.io

---

**Made with ❤️ by the Molam team**
