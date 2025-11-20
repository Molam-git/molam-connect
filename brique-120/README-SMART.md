# Brique 120ter — Smart Marketplace Flow

## Fichiers créés

### Migration
- `migrations/003_smart_marketplace.sql`
  - Tables: seller_escrows, seller_advances, payout_slices, sira_payout_recommendations, advance_repayments
  - Views: seller_advance_eligibility, active_payout_slices
  - Functions: calculate_seller_available_for_advance(), auto_repay_advances()

### API Routes
- `src/routes/smart-payouts.ts`
  - POST /api/marketplace/:id/sellers/:sellerId/smart-payout
  - POST /api/marketplace/:id/sellers/:sellerId/advance
  - GET /api/marketplace/slices/pending

### SIRA Client
- `src/sira/client.ts`
  - callSiraForPayout() - Routing recommendations
  - callSiraForAdvance() - Advance eligibility

### Workers
- `src/workers/payout-slice-executor.ts`
  - processPendingSlices() - Multi-bank slice execution
  - reconcileAdvanceRepayments() - Auto-repayment

## Fonctionnalités

✅ SIRA-driven routing (priority score, risk score)
✅ Multi-bank split pour gros montants
✅ Escrow automatique (risk-based)
✅ Revenue advances avec auto-repayment
✅ Slice execution avec retry/backoff
✅ Mock bank connector
✅ Explainability (SIRA reasons)

## Usage

```bash
# Migrer
.\setup-all-schemas.ps1

# Créer smart payout
POST /api/marketplace/{id}/sellers/{sellerId}/smart-payout
Headers: Idempotency-Key
Body: { "requested_amount": 50000, "currency": "EUR" }

# Demander advance
POST /api/marketplace/{id}/sellers/{sellerId}/advance
Headers: Idempotency-Key
Body: { "amount": 5000, "currency": "EUR" }

# Exécuter slices
npm run slice-executor
```

## SIRA Logic (Fallback)

- Priority score: base 50 + instant(30) + high_amount(20)
- Risk score: base 10 + high_amount(30)
- Multi-bank: amount > 100k
- Action: risk>60→hold, priority≥85→instant, else→batch
