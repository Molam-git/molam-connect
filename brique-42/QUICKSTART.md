# Quick Start - Brique 42 (Connect Payments)

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- **Brique 41** (Connect Accounts) running
- Molam ID service running

## Installation

### 1. Install Dependencies

```bash
cd brique-42
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Server
NODE_ENV=development
PORT=8042

# Database (separate from Brique 41)
DATABASE_URL=postgresql://user:password@localhost:5432/molam_connect_payments

# Molam ID JWT Public Key
MOLAM_ID_JWT_PUBLIC="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# Other briques
BRIQUE_41_URL=http://localhost:8041  # Connect Accounts
WALLET_URL=http://localhost:8033     # Wallet
TREASURY_URL=http://localhost:8034   # Treasury
```

### 3. Create Database

```bash
createdb molam_connect_payments

# Or using psql
psql -U postgres -c "CREATE DATABASE molam_connect_payments;"
```

### 4. Run Migrations

```bash
npm run migrate

# Or manually
psql $DATABASE_URL -f migrations/001_b42_connect_payments.sql
```

### 5. Start Server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

Server starts on **http://localhost:8042**

### 6. Test the API

```bash
# Health check
curl http://localhost:8042/healthz

# Create a payment intent
curl -X POST http://localhost:8042/api/connect/intents \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connect_account_id": "uuid-of-merchant-account",
    "amount": 1000.00,
    "currency": "XOF",
    "capture_method": "automatic",
    "description": "Test payment"
  }'
```

## Common Workflows

### 1. Simple Payment (Auto-Capture)

```bash
# Step 1: Create intent
INTENT=$(curl -s -X POST http://localhost:8042/api/connect/intents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connect_account_id": "'$ACCOUNT_ID'",
    "amount": 1000.00,
    "currency": "XOF",
    "capture_method": "automatic"
  }' | jq -r '.id')

# Step 2: Confirm (auto-captures)
curl -X POST http://localhost:8042/api/connect/intents/$INTENT/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method": {
      "type": "wallet",
      "details": {"wallet_id": "'$WALLET_ID'"}
    }
  }'
```

### 2. Manual Capture

```bash
# Step 1: Create intent (manual)
INTENT=$(curl -s -X POST http://localhost:8042/api/connect/intents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connect_account_id": "'$ACCOUNT_ID'",
    "amount": 1000.00,
    "currency": "XOF",
    "capture_method": "manual"
  }' | jq -r '.id')

# Step 2: Confirm (authorize only)
curl -X POST http://localhost:8042/api/connect/intents/$INTENT/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method": {
      "type": "card",
      "details": {"card_token": "tok_xxx"}
    }
  }'

# Step 3: Capture later
curl -X POST http://localhost:8042/api/connect/intents/$INTENT/capture \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Refund

```bash
# Create refund
curl -X POST http://localhost:8042/api/connect/refunds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "charge_id": "'$CHARGE_ID'",
    "amount": 500.00,
    "reason": "Customer request"
  }'
```

## Running Workers

### Webhook Delivery (every minute)

```bash
npm run worker:webhook-delivery
```

Schedule with cron:
```cron
* * * * * cd /path/to/brique-42 && npm run worker:webhook-delivery
```

### Payout Eligibility (every hour)

```bash
npm run worker:payout-eligibility
```

Schedule with cron:
```cron
0 * * * * cd /path/to/brique-42 && npm run worker:payout-eligibility
```

## Troubleshooting

### Database Connection Error

Check your `DATABASE_URL`:
```bash
psql $DATABASE_URL -c "SELECT 1"
```

### Port Already in Use

Change port in `.env`:
```env
PORT=8043
```

### JWT Verification Error

Ensure `MOLAM_ID_JWT_PUBLIC` is correctly formatted with `\n` line breaks.

## Next Steps

- Set up webhooks in Brique 41
- Configure settlement rules for merchants
- Integrate with Wallet (B33) for wallet payments
- Integrate with Treasury (B34-35) for payouts
- Set up monitoring and alerts

## Support

- Documentation: [README.md](README.md)
- Issues: https://github.com/Molam-git/molam-connect/issues
