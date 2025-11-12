# Brique 70 - Marketing Tools

Marketing campaigns, promo codes, coupons, and subscription management for Molam Connect.

## Features

### 1. Marketing Campaigns
- Create and manage marketing campaigns
- Support for promo codes, coupons, and subscription plans
- Usage limits (total and per-user)
- Product/category targeting
- Campaign scheduling with start/end dates

### 2. Promo Codes
- Percentage, fixed amount, and free shipping discounts
- Usage limits and expiration dates
- Real-time validation
- Fraud detection via SIRA integration
- Audit trail for compliance

### 3. Coupons (Recurring Discounts)
- One-time, repeating, or forever duration
- Apply to specific products or plans
- Automatic application during checkout

### 4. Subscription Plans
- Recurring billing (daily, weekly, monthly, yearly)
- Flexible intervals (e.g., bi-weekly, quarterly)
- Trial periods
- Coupon integration
- Invoice management

### 5. Subscription Management
- Automated renewal processing
- Failed payment retry logic
- Grace periods for past-due subscriptions
- Customer cancellation with period-end support
- Subscription reactivation

### 6. Fraud Detection (SIRA Integration)
- Real-time risk scoring for promo code usage
- Abuse pattern detection
- Customer risk profiling
- Ops dashboard for flagged transactions

## Architecture

```
brique-70/
├── src/
│   ├── config/           # Configuration
│   ├── db/               # Database connection
│   ├── middleware/       # Auth & RBAC
│   ├── routes/           # API endpoints
│   ├── services/         # Business logic
│   ├── types/            # TypeScript types
│   ├── jobs/             # Background workers
│   └── server.ts         # Express app
├── web/                  # React UI
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── pages/        # Page components
│   │   └── utils/        # API client
├── migrations/           # SQL migrations
├── tests/                # Test suite
└── package.json
```

## Installation

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Redis 6+
- SIRA (optional, for fraud detection)

### Setup

1. Install dependencies:
```bash
npm install
cd web && npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run database migrations:
```bash
npm run migrate
```

4. Start the server:
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

5. Start the subscription worker:
```bash
npm run subscriptions
```

6. Start the web UI:
```bash
npm run web:dev
```

## API Documentation

### Base URL
```
http://localhost:8083/api/marketing
```

### Authentication
All endpoints (except promo code validation/application) require JWT authentication:
```
Authorization: Bearer <token>
```

### Endpoints

#### Campaigns
- `POST /campaigns` - Create campaign (merchant/ops)
- `GET /campaigns` - List campaigns
- `GET /campaigns/:id` - Get campaign details
- `PATCH /campaigns/:id` - Update campaign
- `GET /campaigns/:id/stats` - Get campaign stats

#### Promo Codes
- `POST /promo-codes` - Create promo code (merchant/ops)
- `GET /promo-codes` - List promo codes
- `GET /promo-codes/:id` - Get promo code details
- `PATCH /promo-codes/:id` - Update promo code
- `POST /promo-codes/validate` - Validate promo code (public)
- `POST /promo-codes/apply` - Apply promo code (public)
- `POST /promo-codes/refund/:usage_id` - Refund usage (merchant/ops)
- `GET /promo-codes/:id/usage` - Get usage stats

#### Subscription Plans
- `POST /subscription-plans` - Create plan (merchant/ops)
- `GET /subscription-plans` - List plans (public)
- `GET /subscription-plans/:id` - Get plan details (public)
- `PATCH /subscription-plans/:id` - Update plan
- `DELETE /subscription-plans/:id` - Deactivate plan
- `GET /subscription-plans/:id/stats` - Get plan stats

#### Subscriptions
- `POST /subscriptions` - Create subscription (customer)
- `GET /subscriptions` - List subscriptions
- `GET /subscriptions/:id` - Get subscription details
- `POST /subscriptions/:id/cancel` - Cancel subscription
- `POST /subscriptions/:id/reactivate` - Reactivate subscription
- `GET /subscriptions/:id/invoices` - Get invoices
- `PATCH /subscriptions/:id/payment-method` - Update payment method

#### Fraud Detection
- `GET /fraud/customer/:customer_id/risk` - Get customer risk profile (ops)
- `GET /fraud/flagged-usages` - Get flagged usages (ops)
- `POST /fraud/report` - Report fraud (ops)
- `GET /fraud/stats` - Get fraud stats (ops)

## RBAC Permissions

### Roles
- **customer**: Can create subscriptions, view own data
- **merchant**: Can manage own campaigns, promo codes, and plans
- **ops**: Can manage all merchants, view fraud data
- **admin**: Full access

### Permission Examples
```typescript
// Merchant can only access their own data
GET /campaigns?merchant_id=xxx

// Ops can access any merchant
GET /campaigns?merchant_id=yyy

// Customer can only create subscriptions
POST /subscriptions
```

## Promo Code Application Flow

```typescript
// 1. Validate promo code
POST /promo-codes/validate
{
  "code": "SUMMER2025",
  "customer_id": "customer-123"
}

// 2. Apply to order
POST /promo-codes/apply
{
  "code": "SUMMER2025",
  "amount": 100.00,
  "currency": "USD",
  "customer_id": "customer-123",
  "order_id": "order-456",
  "product_ids": ["prod-1", "prod-2"],
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0..."
}

// 3. Response with SIRA fraud check
{
  "success": true,
  "original_amount": 100.00,
  "discount_amount": 20.00,
  "final_amount": 80.00,
  "currency": "USD",
  "usage_log_id": "usage-789",
  "fraud_check": {
    "risk_score": 15,
    "risk_level": "low",
    "should_block": false
  }
}
```

## Subscription Lifecycle

```
1. Customer creates subscription → status: trialing (if trial) or active
2. Trial ends → Create first invoice → Charge payment method
3. Period ends → Create invoice → Charge → Renew (extend period)
4. Payment fails → Retry up to 3 times → status: past_due → unpaid
5. Customer cancels → cancel_at_period_end: true → Remains active until period end
6. Period ends with cancellation → status: canceled
```

## Subscription Worker

The subscription worker runs every hour and:
1. Processes subscriptions due for renewal
2. Retries failed payments
3. Cancels subscriptions marked for cancellation

Run the worker:
```bash
npm run subscriptions
```

## SIRA Integration

Brique 70 integrates with SIRA (Brique 68) for fraud detection:

### Features
- Real-time risk scoring for promo code usage
- Customer risk profiling
- Abuse pattern detection
- Fail-open design (allows transactions if SIRA is down)

### Configuration
```env
SIRA_ENABLED=true
SIRA_API_URL=http://localhost:8084
```

### Fraud Check Flow
1. Customer applies promo code
2. SIRA checks transaction risk
3. If `should_block: true`, transaction is rejected
4. If `risk_level: high/medium`, transaction is flagged for ops review
5. All checks are logged for audit

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- applyPromo.test.ts
```

### Test Coverage
- Promo code application logic
- Subscription lifecycle
- Fraud detection integration
- API endpoints
- RBAC enforcement

## Database Schema

### Key Tables
- `marketing_campaigns` - Parent table for all campaigns
- `promo_codes` - Promotional codes with usage limits
- `promo_code_usage` - Audit log of all promo code usage
- `coupons` - Recurring discounts for subscriptions
- `subscription_plans` - Recurring billing plans
- `subscriptions` - Customer subscription instances
- `subscription_invoices` - Billing invoices

### Indexes
All tables have appropriate indexes for:
- Fast lookups (code, customer_id, merchant_id)
- Date range queries (created_at, valid_from, valid_to)
- Status filtering (is_active, status)

## Performance Considerations

### Promo Code Validation
- PostgreSQL function `is_promo_code_valid()` for atomic validation
- Handles campaign status, dates, and usage limits in single query

### Subscription Processing
- Batch processing in worker (100 subscriptions per run)
- Transactional updates to prevent race conditions
- Graceful error handling (continue on individual failures)

### Fraud Detection
- 5-second timeout for SIRA calls
- Fail-open design to prevent blocking legitimate transactions
- Async reporting (fire-and-forget)

## Deployment

### Docker
```bash
docker build -t molam-marketing .
docker run -p 8083:8083 molam-marketing
```

### Environment Variables
See [.env.example](./.env.example) for all configuration options.

### Health Check
```bash
curl http://localhost:8083/health
```

## Monitoring

### Metrics to Track
- Promo code application rate
- Fraud detection hit rate
- Subscription renewal success rate
- Failed payment retry success rate
- Average discount value

### Logs
- All promo code usage logged to `promo_code_usage`
- Fraud events reported to SIRA
- Worker execution logs to stdout

## Security

### Data Protection
- No plain-text storage of sensitive data
- IP addresses and user agents logged for fraud detection
- RBAC enforced on all merchant-specific endpoints

### Audit Trail
- All promo code usage logged with IP/user agent
- Refunds tracked in usage log
- Fraud reports stored in SIRA

## Troubleshooting

### Promo code not applying
1. Check `is_promo_code_valid()` function result
2. Verify campaign status is 'active'
3. Check usage limits (total and per-user)
4. Verify currency matches (for fixed discounts)

### Subscription not renewing
1. Check subscription worker logs
2. Verify payment method is valid
3. Check invoice status
4. Review retry attempts

### SIRA integration failing
1. Verify SIRA_API_URL is correct
2. Check network connectivity
3. Review SIRA logs
4. System fails open, so transactions are allowed

## Contributing

### Code Style
- TypeScript strict mode
- ESLint + Prettier
- Jest for testing

### Pull Request Process
1. Create feature branch
2. Write tests
3. Update documentation
4. Submit PR with description

## License

MIT © Molam Team
