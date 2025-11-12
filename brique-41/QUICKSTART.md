# Quick Start Guide - Molam Connect

## Prerequisites

- Node.js 18+ (with npm)
- PostgreSQL 14+
- Molam ID service running (for JWT authentication)
- Molam Wallet service running (Brique 33)
- Molam Treasury service running (Briques 34-35)

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and configure:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/molam_connect

# Molam ID JWT Public Key (RS256)
MOLAM_ID_JWT_PUBLIC="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# Other services
WALLET_URL=http://localhost:8033
TREASURY_URL=http://localhost:8034
```

### 3. Create Database

```bash
# Create PostgreSQL database
createdb molam_connect

# Or using psql
psql -U postgres -c "CREATE DATABASE molam_connect;"
```

### 4. Run Migrations

```bash
npm run migrate

# Or manually:
psql $DATABASE_URL -f migrations/000_b41_connect_core.sql
```

### 5. Start the Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

The server will start on port **8041** (configurable via `PORT` env var).

### 6. Test the API

```bash
# Health check
curl http://localhost:8041/healthz

# Create a Connect account (requires JWT token)
curl -X POST http://localhost:8041/api/connect/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_id": "uuid-of-wallet",
    "business_type": "company",
    "display_name": "My Company",
    "country": "SN",
    "default_currency": "XOF",
    "email": "contact@mycompany.com"
  }'
```

## Running Workers

### Verification Sync Worker
Syncs verification status with Wallet service:

```bash
npm run worker:verification
```

Schedule with cron (every hour):
```cron
0 * * * * cd /path/to/molam-connect && npm run worker:verification
```

### Events Dispatcher Worker
Dispatches webhook events:

```bash
npm run worker:events
```

Schedule with cron (every 5 minutes):
```cron
*/5 * * * * cd /path/to/molam-connect && npm run worker:events
```

## Testing Webhooks

1. **Create a webhook endpoint**:

```bash
curl -X POST http://localhost:8041/api/connect/accounts/{account_id}/webhooks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/molam",
    "events": ["payment.succeeded", "payout.sent"]
  }'
```

2. **Test the webhook**:

```bash
curl -X POST http://localhost:8041/api/connect/accounts/{account_id}/webhooks/{webhook_id}/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

3. **Verify signature** (in your webhook receiver):

```javascript
const crypto = require('crypto');

function verifyWebhook(secret, body, signature) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

## Directory Structure for Multi-Brique Setup

To organize this as part of the Molam ecosystem:

```bash
# Create parent directory
mkdir -p ../molam-ecosystem

# Move this project
mv ../molam-connect ../molam-ecosystem/brique-41-connect

# Your structure should look like:
molam-ecosystem/
├── brique-33-wallet/
├── brique-34-treasury/
├── brique-35-treasury-ops/
├── brique-41-connect/    # This project
└── ...
```

## Common Operations

### Update Capabilities

```bash
curl -X POST http://localhost:8041/api/connect/accounts/{account_id}/capabilities \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_payments": true,
    "card_payments": true,
    "bank_transfers": false,
    "marketplace": false
  }'
```

### Refresh Verification Status

```bash
curl -X POST http://localhost:8041/api/connect/accounts/{account_id}/refresh_verification \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Approve Account (Compliance)

```bash
curl -X POST http://localhost:8041/api/connect/accounts/{account_id}/approve \
  -H "Authorization: Bearer COMPLIANCE_JWT_TOKEN"
```

## Troubleshooting

### Database Connection Error

Check your `DATABASE_URL` and ensure PostgreSQL is running:
```bash
pg_isready
psql $DATABASE_URL -c "SELECT 1"
```

### JWT Verification Error

Ensure `MOLAM_ID_JWT_PUBLIC` is correctly formatted with `\n` for line breaks:
```env
MOLAM_ID_JWT_PUBLIC="-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----"
```

### Port Already in Use

Change the port in `.env`:
```env
PORT=8042
```

## Next Steps

- Set up monitoring (Sentry, DataDog, etc.)
- Configure rate limiting for production
- Set up SSL/TLS certificates
- Deploy workers with proper scheduling
- Configure backup for PostgreSQL
- Set up CI/CD pipeline

## Support

For issues and questions:
- GitHub: https://github.com/Molam-git/molam-connect/issues
- Documentation: [README.md](README.md)
