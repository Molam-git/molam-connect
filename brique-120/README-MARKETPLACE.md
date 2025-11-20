# Sous-Brique 120bis — Multi-Seller Payout Orchestrator

## Fichiers créés

### Migration SQL
- `migrations/002_marketplace_sellers.sql`
  - Tables: marketplace_sellers, seller_payouts, seller_transactions, seller_holds
  - Views: seller_balances, sellers_ready_for_settlement
  - Functions: calculate_seller_balance(), settle_seller_transactions()

### API Routes
- `src/routes/marketplace.ts`
  - POST /api/marketplace/:marketplaceId/sellers
  - GET /api/marketplace/:marketplaceId/sellers
  - PATCH /api/marketplace/:marketplaceId/sellers/:sellerId/kyc
  - POST /api/marketplace/:marketplaceId/sellers/:sellerId/transactions
  - GET /api/marketplace/:marketplaceId/sellers/:sellerId/balance
  - POST /api/marketplace/:marketplaceId/sellers/:sellerId/payout
  - POST /api/marketplace/:marketplaceId/sellers/:sellerId/hold
  - POST /api/marketplace/:marketplaceId/sellers/:sellerId/hold/:holdId/release
  - GET /api/marketplace/settlement/ready

### Worker
- `src/workers/marketplace-settlement.ts`
  - Automated periodic settlement
  - Respects settlement schedules (daily, weekly, monthly)
  - Handles VIP priority
  - Checks KYC and holds

### Prisma Schema
- `prisma/schema-marketplace.prisma`
  - Models: MarketplaceSeller, SellerPayout, SellerTransaction, SellerHold

## Installation

```powershell
.\setup-all-schemas.ps1
```

## Usage

```typescript
// Create seller
POST /api/marketplace/{id}/sellers
{
  "seller_name": "Vendor A",
  "currency": "EUR",
  "commission_rate": 0.10,
  "settlement_schedule": "weekly"
}

// Record transaction
POST /api/marketplace/{id}/sellers/{sellerId}/transactions
{
  "transaction_type": "sale",
  "amount": 100,
  "currency": "EUR"
}

// Create payout
POST /api/marketplace/{id}/sellers/{sellerId}/payout
{}

// Run settlement worker
npm run settlement
```

## Features

✅ Seller sub-accounts
✅ Commission calculation
✅ Automatic netting
✅ KYC verification
✅ Settlement schedules
✅ VIP priority
✅ Ops holds
✅ Periodic settlement worker
