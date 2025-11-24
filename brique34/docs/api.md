# Treasury API

## POST /api/treasury/payouts

Crée un nouveau payout.

Headers:
- `Idempotency-Key: string` (obligatoire)

Body:
```json
{
  "origin_module": "pay",
  "origin_entity_id": "uuid",
  "amount": 100.50,
  "currency": "XOF",
  "beneficiary": {
    "iban": "...",
    "name": "..."
  }
}