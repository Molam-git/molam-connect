# Molam Rewards API Documentation

## Endpoints

### 1. Get Active Rewards
**GET** `/api/pay/rewards/active`

Query Parameters:
- `user_id` (optional): Filter rewards for specific user
- `category` (optional): Filter by transaction category
- `currency` (optional): Filter by currency (default: USD)

### 2. Apply Reward to Transaction
**POST** `/api/pay/rewards/apply`

Request Body:
```json
{
  "transaction_id": "UUID",
  "user_id": "UUID",
  "amount": 100.00,
  "currency": "USD",
  "category": "bill_payment"
}