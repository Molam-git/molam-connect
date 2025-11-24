# Guide d'Intégration - Brique 3 Recharge Wallet

## Overview
API permettant la recharge de wallet via multiples canaux de paiement.

## Endpoints

### Créer une recharge
```http
POST /api/pay/topups
Authorization: Bearer <jwt-token>
Idempotency-Key: <unique-key>
Content-Type: application/json

{
  "wallet_id": "uuid",
  "channel": "mobile_money|card|agent|crypto",
  "country_code": "SN",
  "currency": "XOF",
  "amount": 10000.00,
  "provider_hint": "wave",
  "metadata": {
    "msisdn": "+221771234567",
    "device_fingerprint": "abc123"
  }
}