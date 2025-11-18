# Brique 88 - Quick Start Guide

Get up and running with Brique 88 in 5 minutes.

## Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL 14+
- Database `molam_connect` created

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your database credentials
nano .env
```

**Minimum required configuration:**
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=molam_connect
DB_USER=postgres
DB_PASSWORD=your_password
```

## Step 3: Run Database Migrations

```bash
npm run migrate

# Or manually:
psql -d molam_connect -f migrations/001_b88_ledger_adjustments.sql
```

## Step 4: Build TypeScript

```bash
npm run build
```

## Step 5: Start Services

### Option A: Use Startup Script (Recommended)

```bash
chmod +x start.sh
./start.sh
```

This starts:
- API server on port 3088
- Adjustments processor worker
- Compensations worker

### Option B: Manual Start

**Terminal 1 - API Server:**
```bash
npm start
```

**Terminal 2 - Adjustments Processor:**
```bash
npm run worker:adjustments
```

**Terminal 3 - Compensations Worker:**
```bash
npm run worker:compensations
```

## Step 6: Verify Installation

```bash
# Health check
curl http://localhost:3088/health

# Expected response:
# {
#   "status": "healthy",
#   "database": "connected",
#   "stats": {
#     "pending_adjustments": 0,
#     "awaiting_approval": 0,
#     "queued_compensations": 0
#   }
# }
```

## Step 7: Create Your First Adjustment

```bash
curl -X POST http://localhost:3088/api/adjustments \
  -H "Content-Type: application/json" \
  -d '{
    "source_type": "manual",
    "external_ref": "manual:test:001",
    "reason": "Test bank fee adjustment",
    "currency": "USD",
    "amount": 15.00,
    "adjustment_type": "bank_fee",
    "actions": [
      {
        "type": "wallet_credit",
        "params": {
          "user_id": "550e8400-e29b-41d4-a716-446655440000",
          "amount": 15.00,
          "currency": "USD",
          "memo": "Bank fee refund"
        }
      }
    ]
  }'
```

**Expected response:**
```json
{
  "adjustment": {
    "id": "uuid",
    "external_ref": "manual:test:001",
    "status": "pending",
    "amount": "15.00",
    ...
  },
  "message": "Adjustment created successfully"
}
```

## Step 8: Monitor Processing

The adjustment will be automatically processed by the adjustments worker:

1. **Check adjustment status:**
```bash
curl http://localhost:3088/api/adjustments/{adjustment_id}
```

2. **View compensation queue:**
```bash
curl http://localhost:3088/api/compensations
```

3. **Watch logs:**
```bash
tail -f logs/adjustments-worker.log
tail -f logs/compensations-worker.log
```

## Common API Operations

### List Adjustments
```bash
curl "http://localhost:3088/api/adjustments?status=pending&limit=20"
```

### Get Adjustment Details
```bash
curl http://localhost:3088/api/adjustments/{id}
```

### Approve Adjustment
```bash
curl -X POST http://localhost:3088/api/adjustments/{id}/approve \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "comment": "Approved"
  }'
```

### Request Reversal
```bash
curl -X POST http://localhost:3088/api/adjustments/{id}/reverse \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "reason": "Duplicate adjustment"
  }'
```

## Running Tests

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode (for development)
npm run test:watch
```

## Stopping Services

### Option A: Use Stop Script
```bash
./stop.sh
```

### Option B: Manual Stop
```bash
# If using start.sh, PIDs are saved in .pids
cat .pids | xargs kill

# Or find and kill manually
ps aux | grep node
kill {pid1} {pid2} {pid3}
```

## Troubleshooting

### Database Connection Failed
- Verify PostgreSQL is running: `pg_isready`
- Check credentials in `.env`
- Test connection: `psql -U postgres -d molam_connect -c "SELECT 1"`

### Port Already in Use
- Check if port 3088 is available: `lsof -i :3088`
- Change port in `.env`: `PORT=3089`

### Worker Not Processing
- Check worker logs: `tail -f logs/adjustments-worker.log`
- Verify database has pending adjustments: `SELECT * FROM ledger_adjustments WHERE status = 'pending'`

### Tests Failing
- Ensure test database is clean
- Run migrations: `npm run migrate`
- Check PostgreSQL version: `psql --version` (14+ required)

## Next Steps

1. **Read the full documentation**: [README.md](./README.md)
2. **Review architecture**: [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
3. **Explore API examples**: See README.md "API Reference" section
4. **Configure approval thresholds**: Update `adjustment_config` table
5. **Set up monitoring**: Configure Prometheus metrics (optional)

## Configuration Reference

### Approval Thresholds
```sql
-- Set auto-approval thresholds by currency
INSERT INTO adjustment_config (key, value)
VALUES ('ops_auto_threshold', '{
  "USD": 1000,
  "EUR": 900,
  "GBP": 800,
  "XOF": 500000
}');

-- Set approval quorum
INSERT INTO adjustment_config (key, value)
VALUES ('approval_quorum', '2');
```

### GL Code Mapping
```sql
-- Customize GL codes for adjustment types
INSERT INTO adjustment_config (key, value)
VALUES ('gl_mapping', '{
  "bank_fee": {
    "debit": "EXP:BANK_FEES",
    "credit": "LIA:ADJUSTMENTS_PAYABLE"
  },
  "fx_variance": {
    "debit": "EXP:FX_VARIANCE",
    "credit": "LIA:ADJUSTMENTS_PAYABLE"
  }
}');
```

## Support

- **Documentation**: `/docs/adjustments`
- **Slack**: #brique-88-ledger
- **Issues**: File in project repository

---

**You're all set!** 🚀

Brique 88 is now running and ready to process ledger adjustments and compensation flows.
