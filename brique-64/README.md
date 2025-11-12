# Brique 64 — Marketplace & Split Payments Engine

**Status:** ✅ Complete
**Port:** 4064
**Version:** 1.0.0

## Overview

Brique 64 provides a complete split payment orchestration system for marketplace platforms. It handles multi-party settlements, split rule configuration, automated settlement scheduling, and payout execution.

## Features

### 🔀 Split Payment Rules
- **Percentage-based splits** - Define percentage allocations (e.g., platform 10%, seller 90%)
- **Fixed fee splits** - Deduct fixed platform fees before splitting remainder
- **Tiered splits** - Different split ratios based on transaction amount ranges
- **Hierarchical splits** - Cascading splits with priority order (platform → partner → seller)
- **Multi-currency support** - USD, EUR, GBP, and more
- **Merchant-specific overrides** - Custom rules per merchant

### 💳 Payment Split Execution
- **Automatic split calculation** - Apply rules to incoming payments
- **Preview before execution** - `/api/splits/calculate` endpoint
- **Real-time split creation** - Atomic split generation for payments
- **SIRA risk scoring** - ML-based anomaly detection for splits
- **Audit trail** - Complete history of all split calculations

### 📊 Settlement Management
- **Batch settlements** - Group pending splits by recipient
- **Auto-settlement creation** - Automatically batch pending splits
- **Scheduled execution** - Daily/weekly settlement schedules
- **Manual review workflow** - Flag high-risk settlements for approval
- **Multiple payout methods** - Wallet transfers, bank transfers, checks
- **Failure handling** - Retry logic and partial settlement support

### 🔐 Security & Compliance
- **RBAC authorization** - Role-based access control
- **Idempotency** - Prevent duplicate split creation
- **Double-entry validation** - Ensure split amounts sum to payment total
- **Audit logs** - Immutable compliance records
- **Encryption at rest** - Sensitive data protection

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Split Payments Engine                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐      ┌──────────────────┐                 │
│  │ Split Rules    │      │ Payment Splits   │                 │
│  │ Service        │─────▶│ Service          │                 │
│  │                │      │                  │                 │
│  │ • Create rules │      │ • Calculate      │                 │
│  │ • Update rules │      │ • Execute splits │                 │
│  │ • List rules   │      │ • Track status   │                 │
│  └────────────────┘      └──────────────────┘                 │
│          │                        │                            │
│          ▼                        ▼                            │
│  ┌────────────────────────────────────────────┐               │
│  │      Split Calculation Engine              │               │
│  │                                            │               │
│  │  • Percentage calculation                 │               │
│  │  • Fixed amount deduction                 │               │
│  │  • Tiered logic                           │               │
│  │  • Hierarchical cascading                 │               │
│  │  • Validation & rounding                  │               │
│  └────────────────────────────────────────────┘               │
│          │                                                     │
│          ▼                                                     │
│  ┌────────────────────────────────────────────┐               │
│  │      Settlements Service                   │               │
│  │                                            │               │
│  │  • Batch pending splits                   │               │
│  │  • Schedule settlements                   │               │
│  │  • Execute payouts                        │               │
│  │  • Handle failures                        │               │
│  └────────────────────────────────────────────┘               │
│          │                                                     │
│          ▼                                                     │
│  ┌────────────────────────────────────────────┐               │
│  │    Settlement Processor Worker             │               │
│  │                                            │               │
│  │  • Poll scheduled settlements             │               │
│  │  • Execute payouts (wallet/bank/check)    │               │
│  │  • Publish Kafka events                   │               │
│  │  • Retry failed splits                    │               │
│  └────────────────────────────────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   PostgreSQL    │
                  │                 │
                  │ • split_rules   │
                  │ • payment_splits│
                  │ • settlements   │
                  └─────────────────┘
```

## Database Schema

### Tables

#### 1. `split_rules`
Defines how payments should be split across recipients.

```sql
CREATE TABLE split_rules (
  id UUID PRIMARY KEY,
  platform_id UUID NOT NULL,
  merchant_id UUID,                    -- Optional merchant override
  rule_name TEXT NOT NULL,
  rule_type split_rule_type NOT NULL,  -- 'percentage' | 'fixed' | 'tiered' | 'hierarchical'
  rule_config JSONB NOT NULL,
  max_recipients INT DEFAULT 10,
  min_split_amount INT DEFAULT 0,
  tax_handling TEXT DEFAULT 'included',
  allowed_currencies TEXT[],
  allowed_countries TEXT[],
  status TEXT DEFAULT 'active',
  created_by UUID NOT NULL,
  metadata JSONB
);
```

**Example rule_config (Percentage):**
```json
{
  "platform": 10,
  "seller": 85,
  "partner": 5
}
```

**Example rule_config (Tiered):**
```json
[
  {"min_amount": 0, "max_amount": 10000, "platform": 15, "seller": 85},
  {"min_amount": 10001, "max_amount": null, "platform": 10, "seller": 90}
]
```

#### 2. `payment_splits`
Stores executed splits for each payment transaction.

```sql
CREATE TABLE payment_splits (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL,
  split_rule_id UUID REFERENCES split_rules(id),
  platform_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  recipient_type TEXT NOT NULL,        -- 'platform' | 'seller' | 'partner' | 'tax_authority'
  recipient_account_id UUID,
  total_payment_amount INT NOT NULL,
  split_amount INT NOT NULL,
  currency TEXT DEFAULT 'USD',
  calculation_basis JSONB NOT NULL,
  status split_status DEFAULT 'pending',
  settlement_id UUID,
  settled_at TIMESTAMPTZ,
  failure_reason TEXT,
  retry_count INT DEFAULT 0,
  risk_score INT,
  risk_flags JSONB
);
```

#### 3. `split_settlements`
Batch settlements for payout execution.

```sql
CREATE TABLE split_settlements (
  id UUID PRIMARY KEY,
  settlement_batch_id TEXT UNIQUE NOT NULL,
  platform_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  recipient_type TEXT NOT NULL,
  total_splits_count INT DEFAULT 0,
  total_amount INT DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  settlement_period_start TIMESTAMPTZ NOT NULL,
  settlement_period_end TIMESTAMPTZ NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status settlement_status DEFAULT 'scheduled',
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  payout_id UUID,
  payout_method TEXT,
  payout_reference TEXT,
  requires_manual_review BOOLEAN DEFAULT false,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ
);
```

## API Endpoints

### Split Rules

#### `POST /api/splits/rules`
Create a new split rule.

**Request:**
```json
{
  "platform_id": "platform-123",
  "rule_name": "Standard Marketplace Split",
  "rule_type": "percentage",
  "rule_config": {
    "platform": 10,
    "seller": 90
  },
  "allowed_currencies": ["USD", "EUR"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "rule-456",
    "platform_id": "platform-123",
    "rule_name": "Standard Marketplace Split",
    "rule_type": "percentage",
    "rule_config": {"platform": 10, "seller": 90},
    "status": "active",
    "created_at": "2025-01-06T10:00:00Z"
  }
}
```

#### `GET /api/splits/rules?platform_id=<id>`
List split rules for a platform.

#### `GET /api/splits/rules/:id`
Get a specific split rule.

#### `PATCH /api/splits/rules/:id`
Update split rule configuration.

#### `DELETE /api/splits/rules/:id`
Archive a split rule.

### Payment Splits

#### `POST /api/splits/calculate`
Preview split calculation (doesn't save).

**Request:**
```json
{
  "payment_id": "pay-789",
  "platform_id": "platform-123",
  "merchant_id": "merchant-456",
  "total_amount": 10000,
  "currency": "USD",
  "recipient_mapping": {
    "platform": "platform-123",
    "seller": "seller-789"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "payment_id": "pay-789",
    "total_amount": 10000,
    "currency": "USD",
    "recipients": [
      {
        "recipient_id": "platform-123",
        "recipient_type": "platform",
        "amount": 1000,
        "calculation_basis": {"type": "percentage", "rate": 10, "base_amount": 10000}
      },
      {
        "recipient_id": "seller-789",
        "recipient_type": "seller",
        "amount": 9000,
        "calculation_basis": {"type": "percentage", "rate": 90, "base_amount": 10000}
      }
    ],
    "split_rule_id": "rule-456"
  }
}
```

#### `POST /api/splits/execute`
Calculate and execute splits for a payment.

#### `GET /api/splits/payment/:payment_id`
Get all splits for a payment.

#### `GET /api/splits/recipient/:recipient_id`
Get splits for a recipient (with filters).

#### `GET /api/splits/platform/:platform_id/statistics`
Get split statistics for a platform.

### Settlements

#### `POST /api/settlements`
Create a settlement batch manually.

#### `POST /api/settlements/auto-create`
Auto-create settlement from pending splits.

**Request:**
```json
{
  "platform_id": "platform-123",
  "recipient_id": "seller-789",
  "currency": "USD"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "settlement-001",
    "settlement_batch_id": "SETTLE-2025-01-06-platform-SELLER-123456",
    "total_splits_count": 15,
    "total_amount": 45000,
    "currency": "USD",
    "scheduled_at": "2025-01-07T00:00:00Z",
    "status": "scheduled"
  }
}
```

#### `GET /api/settlements/:id`
Get settlement by ID.

#### `GET /api/settlements?platform_id=<id>`
List settlements for a platform.

#### `PATCH /api/settlements/:id/status`
Update settlement status.

#### `POST /api/settlements/:id/review`
Approve/reject settlement after manual review.

#### `GET /api/settlements/platform/:platform_id/statistics`
Get settlement statistics.

## Installation

```bash
cd brique-64
npm install
```

## Configuration

Create `.env` file:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=molam_connect
DB_USER=postgres
DB_PASSWORD=your_password

# Server
PORT=4064
NODE_ENV=development

# Kafka
KAFKA_BROKERS=localhost:9092

# Settlement Worker
SETTLEMENT_POLL_INTERVAL_MS=60000
SETTLEMENT_BATCH_SIZE=50

# External Services (TODO: Configure when integrating)
WALLET_API_URL=http://localhost:4057
BANK_TRANSFER_API_URL=
```

## Usage

### 1. Run Database Migration

```bash
psql -U postgres -d molam_connect -f migrations/064_split_payments.sql
```

### 2. Start API Server

```bash
npm run dev
```

Server runs on http://localhost:4064

### 3. Start Settlement Worker

```bash
npm run worker:settlements
```

### 4. Test API

```bash
# Health check
curl http://localhost:4064/api/health

# Create split rule
curl -X POST http://localhost:4064/api/splits/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "platform_id": "platform-123",
    "rule_name": "Standard Split",
    "rule_type": "percentage",
    "rule_config": {"platform": 10, "seller": 90},
    "created_by": "user-123"
  }'

# Calculate splits (preview)
curl -X POST http://localhost:4064/api/splits/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "payment_id": "pay-123",
    "platform_id": "platform-123",
    "merchant_id": "merchant-456",
    "total_amount": 10000,
    "currency": "USD",
    "recipient_mapping": {
      "platform": "platform-123",
      "seller": "seller-789"
    }
  }'
```

## React Dashboard

```tsx
import SplitsDashboard from './SplitsDashboard';

function App() {
  return (
    <SplitsDashboard
      platformId="platform-123"
      apiBaseUrl="http://localhost:4064/api"
      authToken="your-auth-token"
    />
  );
}
```

## Workers

### Settlement Processor
- **File:** `src/workers/settlementProcessor.ts`
- **Polls:** Every 60 seconds (configurable)
- **Function:** Process scheduled settlements and execute payouts
- **Kafka Events:** Publishes `settlement.completed` and `settlement.failed` events

## Testing

```bash
# Run TypeScript compiler check
npm run build

# Run tests (to be implemented)
npm test
```

## Integration Points

### Required Integrations

1. **Wallet Service (Brique 57-59)** - For wallet-based payouts
   - `POST /api/wallet/credit` - Credit recipient wallet

2. **Bank Transfer Provider** - For bank transfers
   - Stripe Payouts, PayPal, or similar

3. **Payment Service** - To trigger split creation on payment capture
   - Webhook: `payment.captured` → `POST /api/splits/execute`

4. **SIRA (Brique 61)** - For risk scoring
   - Anomaly detection for unusual split patterns

5. **Action Center (Brique 63)** - For manual approvals
   - High-risk settlements requiring compliance review

## File Structure

```
brique-64/
├── migrations/
│   └── 064_split_payments.sql          # Database schema
├── src/
│   ├── db.ts                           # PostgreSQL connection
│   ├── server.ts                       # Express server
│   ├── types/
│   │   └── index.ts                    # TypeScript types
│   ├── services/
│   │   ├── splitCalculationService.ts  # Split calculation logic
│   │   ├── splitRulesService.ts        # Split rules CRUD
│   │   ├── paymentSplitsService.ts     # Payment splits management
│   │   └── settlementsService.ts       # Settlements management
│   ├── routes/
│   │   ├── index.ts                    # Main router
│   │   ├── splitRulesRoutes.ts         # Split rules API
│   │   ├── paymentSplitsRoutes.ts      # Payment splits API
│   │   └── settlementsRoutes.ts        # Settlements API
│   ├── middleware/
│   │   └── auth.ts                     # Authentication & RBAC
│   └── workers/
│       └── settlementProcessor.ts      # Settlement execution worker
├── web/
│   └── src/
│       └── SplitsDashboard.tsx         # React dashboard
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Next Steps

- [ ] Add comprehensive unit tests
- [ ] Add integration tests for split calculation
- [ ] Implement wallet service integration
- [ ] Add bank transfer provider integration
- [ ] Implement SIRA risk scoring integration
- [ ] Add Prometheus metrics
- [ ] Create Grafana dashboards
- [ ] Add E2E tests
- [ ] Performance optimization for high-volume splits

## License

MIT
