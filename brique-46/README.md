# Brique 46 - Billing & Invoicing Marchands

**Multi-Currency Fees | PDF Invoices | Tax Management | Wallet/Netting Settlement**

Système de facturation centralisé pour tous les frais Molam avec génération PDF multi-langues, gestion des taxes/TVA, et settlement automatique (wallet balance, netting sur payout, bank transfer).

## Position dans l'écosystème

```
Molam Pay (Module majeur)
├── Connect (Brique 41) - Comptes marchands
├── Connect Payments (Brique 42) - Traitement paiements
├── Checkout (Brique 43) - Orchestration
├── Anti-fraude (Brique 44) - Détection fraude
├── Webhooks (Brique 45) - Event delivery
└── Billing & Invoicing (Brique 46) - Facturation ✅ NOUVEAU
```

## Fonctionnalités

### Agrégation Multi-Sources
- **Tous modules** publient leurs frais: Connect, Wallet, Shop, Eats, Talk, Ads
- **Types de frais**: payment_fee, instant_payout_fee, fx_fee, dispute_fee, subscription
- **Multi-devise** avec consolidation FX automatique
- **Idempotence** garantie (source_module + source_id + event_type)

### Facturation Intelligente
- **Périodicité**: Mensuelle (par défaut), hebdomadaire, off-cycle (seuil >500 USD)
- **Consolidation FX**: Conversion vers devise de facturation marchand
- **Taxes/TVA**: Règles par pays avec taux effectifs (FR: 20%, SN: 18%, etc.)
- **Numérotation légale**: Séquentielle par entité légale (MOLAM-FR-2025-000123)

### PDF Multi-Langues
- **Génération HTML→PDF** avec Puppeteer
- **Langues supportées**: FR, EN, ES (extensible)
- **Stockage WORM**: S3 avec Object Lock (compliance 7 ans)
- **Téléchargement sécurisé**: URLs signées (5 minutes)

### Settlement Automatique
1. **Wallet Balance** (prioritaire) - Débit immédiat si solde suffisant
2. **Netting** - Retenue sur prochain payout
3. **Bank Transfer** - Virement manuel avec référence unique

### Avoirs & Ajustements
- **Credit Notes** pour litiges gagnés
- **Ajustements manuels** avec audit trail (RBAC: billing_ops, finance_ops)
- **Webhooks**: invoice.created, invoice.finalized, invoice.payment_succeeded/failed

## Architecture

```
brique-46/
├── migrations/
│   └── 001_b46_billing.sql           # 8 tables
│
├── src/
│   ├── server.ts                      # Express API (port 8046)
│   │
│   ├── utils/
│   │   ├── db.ts                      # PostgreSQL connection
│   │   ├── pdf.ts                     # Puppeteer HTML→PDF
│   │   ├── s3.ts                      # WORM storage
│   │   └── authz.ts                   # JWT auth + RBAC
│   │
│   ├── billing/
│   │   ├── intake.ts                  # Charge recording API
│   │   ├── aggregate.ts               # Invoice generation (worker)
│   │   ├── finalize.ts                # PDF generation
│   │   └── collect.ts                 # Settlement (wallet/netting/bank)
│   │
│   ├── routes/
│   │   ├── billing.ts                 # Merchant portal API
│   │   └── ops.ts                     # Ops dashboard API
│   │
│   └── workers/
│       └── aggregate-worker.ts        # Monthly/weekly cron
│
└── web/
    └── src/
        ├── BillingPortal.tsx          # Merchant invoice portal
        └── BillingOps.tsx             # Ops dashboard
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (8 tables)
- **PDF**: Puppeteer (Chromium headless)
- **Storage**: AWS S3 (WORM compliance) or local file storage
- **Authentication**: JWT (RS256) via Molam ID
- **Security**: RBAC (merchant_admin, billing_ops, finance_ops, auditor)
- **Observability**: Prometheus metrics

## Installation

### 1. Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Chromium (for PDF generation)

### 2. Install dependencies
```bash
cd brique-46
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with:
# - DATABASE_URL
# - MOLAM_ID_JWT_PUBLIC
# - S3 credentials or USE_LOCAL_STORAGE=true
```

### 4. Create database
```bash
createdb molam_billing
```

### 5. Run migrations
```bash
npm run migrate
```

### 6. Start services
```bash
# API Server
npm run dev  # Port 8046

# Aggregation Worker (in separate terminal)
npm run worker:aggregate
```

## API Endpoints

### Merchant Portal

- `GET /api/billing/invoices` - List merchant invoices
- `GET /api/billing/invoices/:id/pdf` - Download PDF (signed URL)

### Ops Dashboard

- `GET /api/ops/invoices?status=draft` - List invoices by status
- `POST /api/billing/invoices/:id/finalize` - Finalize invoice (generate PDF)
- `POST /api/billing/invoices/:id/mark-paid` - Mark as paid (bank transfer)

### Charge Intake (Internal API)

- `POST /api/internal/charges` - Record fee from module

## Workflow

### 1. Charge Recording (Module → Billing)

```typescript
import { recordCharge } from "./billing/intake";

// From Brique 42 (Connect Payments)
await recordCharge({
  source_module: "connect",
  merchant_id: "merchant-uuid",
  event_type: "payment_fee",
  source_id: "pay_123",
  amount: 2.25,
  source_currency: "USD",
  occurred_at: new Date(),
  metadata: { payment_method: "card" }
});
```

### 2. Monthly Aggregation (Worker)

```bash
# Runs 1st of month at midnight
npm run worker:aggregate
```

**Process**:
1. Find all `unbilled` charges for period
2. Convert to merchant billing currency (FX)
3. Apply tax rules by country
4. Generate invoice (status: `draft`)
5. Mark charges as `billed`

### 3. Finalization (Ops)

```bash
POST /api/billing/invoices/{id}/finalize
```

**Process**:
1. Generate PDF (HTML→Puppeteer)
2. Store in S3 (WORM)
3. Set `due_date` (Net 14 days)
4. Update status: `draft` → `finalized`
5. Emit webhook: `invoice.finalized`

### 4. Settlement (Automatic)

```typescript
// Triggered on finalization
await collectInvoice(invoiceId);
```

**Priority**:
1. **Wallet** - Check balance, debit if sufficient
2. **Netting** - Schedule deduction on next payout
3. **Bank Transfer** - Await manual payment

## Database Schema

### billing_charges
- Stores fee events from all modules
- Multi-currency support
- Idempotent by (source_module, source_id, event_type)

### fx_rates
- Daily FX rates for multi-currency consolidation
- Base/quote pairs (USD/XOF, EUR/USD, etc.)

### tax_rules
- Country-specific VAT/GST rules
- Effective date ranges
- Event type applicability

### invoices
- Monthly/weekly invoices
- Sequential numbering by legal entity
- Status: draft→finalized→paying→paid

### invoice_lines
- Detailed line items
- Links to original charges
- Tax breakdown per line

### credit_notes
- Refunds, dispute credits, adjustments
- Linked to original invoice

### invoice_payments
- Payment journal
- Methods: wallet_balance, netting, bank_transfer

### invoice_sequences
- Sequential counters per legal entity
- Ensures legal compliance

## Security & Compliance

### RBAC Roles
- **merchant_admin**: View invoices, download PDFs
- **billing_ops**: Finalize invoices, mark paid
- **finance_ops**: Manage tax rules, credit notes
- **auditor**: Read-only access to all data

### Compliance
- **WORM storage**: S3 Object Lock (7 years retention)
- **Audit trail**: Immutable logs for all mutations
- **Sequential numbering**: Legal invoice numbers per entity
- **Tax compliance**: Country-specific VAT/GST rules

## Metrics

Available at `/metrics`:

```
b46_charges_recorded_total{source_module,event_type}
b46_invoices_generated_total{legal_entity,status}
b46_invoices_amount_total{currency,status}
b46_pdf_generation_duration_seconds
b46_settlement_method_total{method}
```

## License

ISC

## Contact

Molam Team - [GitHub](https://github.com/Molam-git)
