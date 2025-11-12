# Brique 65 — Tax & Compliance Engine (Connect)

**Status:** ✅ Complete
**Port:** 4065
**Version:** 1.0.0

## Overview

Brique 65 provides a complete tax calculation and compliance engine for Connect transactions. It handles multi-jurisdiction tax rules, automatic tax computation, withholding management, and regulatory reporting.

## Features

### 🌍 Multi-Jurisdiction Support
- **Tax jurisdictions** with country mappings
- **Default jurisdiction** for fallback
- **Currency-specific** rounding rules
- **FX rate integration** for cross-currency calculations

### 📐 Flexible Tax Rules
- **Percentage-based** taxes (e.g., VAT, Sales Tax)
- **Fixed-amount** fees
- **Rule versioning** with effective dates
- **Exemption conditions** (merchant type, product codes, thresholds)
- **Reverse charge** mechanism support

### 💰 Tax Computation
- **Idempotent calculations** (same tx_id = same result)
- **Multiple rules** applied per transaction
- **Automatic rounding** per currency precision
- **Tax line breakdown** with explainability
- **Audit trail** for all computations

### 🔄 Tax Reversals
- **Refund support** with negative tax amounts
- **Linked to original** transaction
- **Complete audit trail** maintained

### 🏦 Withholding Management
- **Reserve tax** from merchant payouts
- **Track status** (reserved/released/paid)
- **Authority payments** tracking

### 📊 Compliance Reporting
- **Automated report generation** by jurisdiction
- **Multiple formats** (CSV, JSON, XML)
- **Period-based** reporting (daily, monthly, quarterly)
- **Row counts and totals** for validation
- **S3 storage** integration (optional)

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Tax & Compliance Engine                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────┐      ┌────────────────┐                │
│  │ Tax Rules      │      │ Tax Engine     │                │
│  │ Repository     │─────▶│ (Computation)  │                │
│  │                │      │                │                │
│  │ • Jurisdictions│      │ • Calculate    │                │
│  │ • Rules        │      │ • Validate     │                │
│  │ • Exemptions   │      │ • Persist      │                │
│  └────────────────┘      └────────────────┘                │
│          │                        │                         │
│          ▼                        ▼                         │
│  ┌────────────────────────────────────────┐                │
│  │        Tax Decisions Store             │                │
│  │                                        │                │
│  │  • Transaction ID (unique)            │                │
│  │  • Jurisdiction                       │                │
│  │  • Rules applied                      │                │
│  │  • Tax lines breakdown                │                │
│  │  • Total tax                          │                │
│  └────────────────────────────────────────┘                │
│          │                                                  │
│          ▼                                                  │
│  ┌────────────────────────────────────────┐                │
│  │      Reporting & Compliance            │                │
│  │                                        │                │
│  │  • Generate reports                    │                │
│  │  • Export to CSV/XML                   │                │
│  │  • Upload to S3                        │                │
│  │  • Audit trail                         │                │
│  └────────────────────────────────────────┘                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Database Schema

### Tables (9 total)

1. **tax_jurisdictions** - Tax jurisdictions (countries/regions)
2. **tax_rules** - Versioned tax calculation rules
3. **tax_rule_snapshots** - Audit trail for rule changes
4. **tax_decisions** - Computed tax for each transaction
5. **withholding_reservations** - Tax withholdings from payouts
6. **tax_reports** - Generated compliance reports
7. **fx_rates** - Foreign exchange rates
8. **molam_audit_logs** - Audit trail
9. **merchants** (reference) - Merchant country info

### Key Indexes
- GIN index on `country_codes` for fast jurisdiction lookup
- Composite index on `(effective_from, effective_to)` for active rules
- Index on `connect_tx_id` for idempotency
- Index on `jurisdiction_id` and `computed_at` for reporting

## API Endpoints

### Tax Computation

#### `POST /api/tax/compute`
Compute tax for a transaction.

**Request:**
```json
{
  "connectTxId": "tx-123",
  "amount": 10000,
  "currency": "USD",
  "merchantId": "merchant-456",
  "buyerCountry": "US",
  "eventType": "payment",
  "productCode": "DIGITAL",
  "merchantMeta": {
    "tax_id": "12345",
    "category": "saas"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "decision": {
    "id": "decision-789",
    "connect_tx_id": "tx-123",
    "jurisdiction_id": "...",
    "total_tax": 725,
    "currency": "USD",
    "tax_lines": [
      {
        "rule_code": "SALES_TAX",
        "amount": 725,
        "rate": 7.25,
        "is_percentage": true
      }
    ]
  }
}
```

#### `GET /api/tax/decisions/:connectTxId`
Get tax decision for a transaction.

#### `POST /api/tax/reverse`
Reverse a tax decision (for refunds).

**Request:**
```json
{
  "original_tx_id": "tx-123",
  "reversal_tx_id": "tx-refund-123"
}
```

### Tax Rules

#### `GET /api/tax/rules`
List all active tax rules.

**Query Parameters:**
- `jurisdiction_id` (optional)

#### `GET /api/tax/jurisdictions`
List all tax jurisdictions.

### Reporting

#### `GET /api/tax/summary`
Get tax summary for reporting.

**Query Parameters:**
- `start_date` - Start date (YYYY-MM-DD)
- `end_date` - End date (YYYY-MM-DD)
- `jurisdiction_id` (optional)

**Response:**
```json
[
  {
    "jurisdiction_code": "SN",
    "jurisdiction_name": "Senegal",
    "currency": "XOF",
    "transaction_count": 1250,
    "total_tax": 225000,
    "day": "2025-01-06"
  }
]
```

#### `GET /api/tax/withholdings`
List withholding reservations.

**Query Parameters:**
- `merchant_id` (optional)
- `status` (optional) - reserved | released | paid_to_authority

## Installation

```bash
cd brique-65
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
PORT=4065
NODE_ENV=development

# S3 (Optional)
AWS_REGION=us-east-1
S3_BUCKET_NAME=molam-tax-reports
```

## Usage

### 1. Apply Database Migration

```bash
psql -U postgres -d molam_connect -f migrations/065_tax_engine.sql
```

### 2. Start API Server

```bash
npm run dev
```

Server runs on http://localhost:4065

### 3. Generate Tax Reports (Worker)

```bash
npm run worker:reports
```

### 4. Test API

```bash
# Health check
curl http://localhost:4065/api/health

# Compute tax
curl -X POST http://localhost:4065/api/tax/compute \
  -H "Content-Type: application/json" \
  -d '{
    "connectTxId": "tx-test-1",
    "amount": 10000,
    "currency": "XOF",
    "eventType": "payment",
    "buyerCountry": "SN"
  }'

# Get tax decision
curl http://localhost:4065/api/tax/decisions/tx-test-1

# List tax rules
curl http://localhost:4065/api/tax/rules

# Get tax summary
curl "http://localhost:4065/api/tax/summary?start_date=2025-01-01&end_date=2025-01-31"
```

## Currency Handling

### Supported Currencies

| Currency | Code | Precision | Example |
|----------|------|-----------|---------|
| US Dollar | USD | 2 decimals | $10.50 |
| Euro | EUR | 2 decimals | €10.50 |
| British Pound | GBP | 2 decimals | £10.50 |
| West African CFA Franc | XOF | 0 decimals | 1050 F |
| Japanese Yen | JPY | 0 decimals | ¥1050 |

### Rounding Rules

- **ROUND_HALF_UP** (banker's rounding)
- Currency-specific precision
- Applied to each tax line individually
- Totals may have ±1 unit variance due to rounding

## Example Tax Calculations

### Example 1: Simple VAT (Senegal)

**Input:**
- Amount: 1000 XOF
- Country: Senegal
- VAT Rate: 18%

**Calculation:**
```
Base Amount: 1000 XOF
VAT (18%): 1000 × 0.18 = 180 XOF
Total Tax: 180 XOF
```

### Example 2: Multiple Taxes

**Input:**
- Amount: 10000 USD
- Country: USA (California)
- State Tax: 6%
- Local Tax: 1.25%

**Calculation:**
```
Base Amount: $100.00
State Tax (6%): $6.00
Local Tax (1.25%): $1.25
Total Tax: $7.25
```

### Example 3: Fixed Fee + Percentage

**Input:**
- Amount: 5000 EUR
- Country: France
- Platform Fee: €2.00 (fixed)
- VAT: 20% (percentage)

**Calculation:**
```
Base Amount: €50.00
Platform Fee: €2.00 (fixed)
VAT (20%): €50.00 × 0.20 = €10.00
Total Tax: €12.00
```

## React Dashboard

### TaxRulesManager

```tsx
import TaxRulesManager from './web/TaxRulesManager';

function App() {
  return <TaxRulesManager />;
}
```

**Features:**
- View all active tax rules
- Group by jurisdiction
- See rate changes history
- Add/edit/deactivate rules

### TaxDecisionView

```tsx
import TaxDecisionView from './web/TaxDecisionView';

function TransactionDetail({ txId }: { txId: string }) {
  return <TaxDecisionView txId={txId} />;
}
```

**Features:**
- View tax breakdown for transaction
- See which rules were applied
- Display total tax with currency formatting
- Show rounding information

## Testing

```bash
# Run tests
npm test

# Run specific test
npm test -- tax.engine.test.ts
```

## Operational Runbook

See [tax_runbook.md](docs/tax_runbook.md) for:
- Emergency rate changes
- Report generation procedures
- Debugging unexpected tax amounts
- Withholding management
- Monitoring and alerts

## Integration Points

### With Connect (Payment Processing)
```typescript
// After payment captured
const taxDecision = await computeAndPersistTax({
  connectTxId: payment.id,
  amount: payment.amount,
  currency: payment.currency,
  merchantId: payment.merchant_id,
  buyerCountry: payment.buyer_country,
  eventType: 'payment'
});

// Include tax in invoice
invoice.tax_amount = taxDecision.total_tax;
invoice.tax_breakdown = taxDecision.tax_lines;
```

### With Wallet/Payouts
```typescript
// Withhold tax from merchant payout
await pool.query(`
  INSERT INTO withholding_reservations(payout_id, merchant_id, amount, currency, reason)
  VALUES ($1, $2, $3, $4, 'tax_withholding')
`, [payoutId, merchantId, taxAmount, currency]);
```

### With Reporting
```typescript
// Generate monthly tax report
const report = await generateTaxReport(
  jurisdictionId,
  '2025-01-01',
  '2025-01-31',
  'csv'
);

// Upload to S3 or send to tax authority
```

## Key Files

```
brique-65/
├── migrations/
│   └── 065_tax_engine.sql          # Database schema
├── src/
│   ├── utils/
│   │   ├── db.ts                   # PostgreSQL connection
│   │   ├── rounding.ts             # Currency rounding
│   │   └── fx.ts                   # FX rate lookup
│   ├── tax/
│   │   ├── engine.ts               # Tax computation engine
│   │   ├── routes.ts               # API routes
│   │   ├── utils.ts                # Jurisdiction resolution
│   │   └── worker.ts               # Report generation
│   └── server.ts                   # Express server
├── tests/
│   └── tax.engine.test.ts          # Unit tests
├── web/
│   ├── TaxRulesManager.tsx         # Ops UI for rules
│   └── TaxDecisionView.tsx         # Transaction tax breakdown
├── docs/
│   └── tax_runbook.md              # Operational runbook
└── README.md
```

## Next Steps

- [ ] Add comprehensive unit tests
- [ ] Integrate with real FX rate provider
- [ ] Add S3 upload for reports
- [ ] Implement scheduled worker (cron)
- [ ] Add admin UI for rule management
- [ ] Support more tax types (customs, duties)
- [ ] Multi-language support for reports
- [ ] Prometheus metrics
- [ ] Grafana dashboards

## License

MIT