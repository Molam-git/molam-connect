# Brique 41 - Molam Connect

**Merchant Accounts & Payment Gateway Orchestration**

Molam Connect is the B2B payment gateway sub-module of Molam Pay, enabling merchants, marketplaces, and platforms to accept payments via multiple rails (Wallet, Cards, Banks, Mobile Money).

## Position in Ecosystem

```
Molam Pay (Module majeur)
├── Molam Wallet (Brique 33) - User accounts & mobile money
└── Molam Connect (Brique 41) - Merchant accounts & gateway
```

## Features

- **Merchant Onboarding**: Simplified KYC reusing Wallet verification (B33)
- **Multi-Rail Payments**: Wallet, Cards, Bank transfers, Mobile Money
- **Capabilities Management**: granular control over payment methods
- **Payouts**: Integration with Treasury (B34-35)
- **Webhooks**: Real-time event notifications
- **Fee Management**: Flexible pricing profiles
- **RBAC**: Role-based access control
- **Compliance**: Audit logs, verification sync

## Architecture

```
molam-connect/
├── migrations/              # SQL migrations
│   └── 000_b41_connect_core.sql
├── src/
│   ├── server.ts           # Main Express app
│   ├── db.ts               # PostgreSQL connection
│   ├── auth.ts             # Molam ID JWT authentication
│   ├── rbac.ts             # Role-based access control
│   ├── routes/             # API routes
│   │   ├── accounts.ts
│   │   ├── externalAccounts.ts
│   │   ├── onboarding.ts
│   │   └── webhooks.ts
│   ├── services/           # Business logic & integrations
│   │   ├── verification.ts
│   │   ├── pricing.ts
│   │   ├── treasuryClient.ts
│   │   ├── walletClient.ts
│   │   └── events.ts
│   └── utils/              # Utilities
│       ├── idempotency.ts
│       ├── validate.ts
│       └── audit.ts
├── workers/                # Background jobs
│   ├── verification-sync.ts
│   └── events-dispatcher.ts
├── package.json
├── tsconfig.json
└── .env.example
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT (RS256) via Molam ID
- **Security**: Helmet, rate limiting, RBAC

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Molam-git/molam-connect.git
   cd molam-connect
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run database migrations**:
   ```bash
   npm run migrate
   ```

5. **Start the server**:
   ```bash
   # Development
   npm run dev

   # Production
   npm run build
   npm start
   ```

## API Endpoints

### Connect Accounts

- `POST /api/connect/accounts` - Create merchant account
- `GET /api/connect/accounts` - List accounts
- `GET /api/connect/accounts/:id` - Get account details
- `PATCH /api/connect/accounts/:id` - Update account
- `POST /api/connect/accounts/:id/capabilities` - Update capabilities (Ops)
- `POST /api/connect/accounts/:id/fee_profile` - Set fee profile (Ops)
- `POST /api/connect/accounts/:id/refresh_verification` - Sync verification
- `POST /api/connect/accounts/:id/approve` - Approve account (Compliance)
- `POST /api/connect/accounts/:id/reject` - Reject account (Compliance)

### External Accounts (Payout Destinations)

- `POST /api/connect/accounts/:id/external_accounts` - Add payout account
- `GET /api/connect/accounts/:id/external_accounts` - List payout accounts
- `GET /api/connect/accounts/:id/external_accounts/:externalId` - Get details
- `PATCH /api/connect/accounts/:id/external_accounts/:externalId` - Update
- `DELETE /api/connect/accounts/:id/external_accounts/:externalId` - Remove

### Onboarding

- `GET /api/connect/accounts/:id/onboarding/tasks` - List tasks
- `POST /api/connect/accounts/:id/onboarding/tasks` - Create task (Ops)
- `GET /api/connect/accounts/:id/onboarding/tasks/:taskId` - Get task
- `PATCH /api/connect/accounts/:id/onboarding/tasks/:taskId` - Update task (Ops)
- `POST /api/connect/accounts/:id/onboarding/tasks/:taskId/resolve` - Resolve task (Ops)
- `GET /api/connect/accounts/:id/onboarding/status` - Get onboarding status

### Webhooks

- `POST /api/connect/accounts/:id/webhooks` - Create webhook
- `GET /api/connect/accounts/:id/webhooks` - List webhooks
- `GET /api/connect/accounts/:id/webhooks/:webhookId` - Get webhook
- `PATCH /api/connect/accounts/:id/webhooks/:webhookId` - Update webhook
- `DELETE /api/connect/accounts/:id/webhooks/:webhookId` - Delete webhook
- `POST /api/connect/accounts/:id/webhooks/:webhookId/rotate_secret` - Rotate secret
- `POST /api/connect/accounts/:id/webhooks/:webhookId/test` - Test webhook

## Roles & Permissions

- `merchant_admin` - Full control over merchant account
- `merchant_finance` - Financial operations (payouts, reports)
- `connect_platform` - Platform/marketplace accounts
- `pay_admin` - Molam Pay administrators
- `compliance_ops` - Compliance & risk operations

## Workers

### Verification Sync
Syncs verification status with Wallet (B33):
```bash
npm run worker:verification
```

### Events Dispatcher
Dispatches webhook events:
```bash
npm run worker:events
```

## Integration with Other Briques

### Wallet (Brique 33)
- Verification status sync
- User account linking
- Internal transfers

### Treasury (Briques 34-35)
- Payout processing
- Balance queries
- Bank transfers

## Security

- **JWT Authentication**: RS256 tokens from Molam ID
- **RBAC**: Role-based access control
- **Audit Logs**: Immutable audit trail
- **Webhook Signatures**: HMAC-SHA256
- **Rate Limiting**: 600 req/min per IP
- **Idempotency**: External keys for safe retries

## Development

```bash
# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Run tests (to be implemented)
npm test
```

## License

ISC

## Contact

Molam Team - [GitHub](https://github.com/Molam-git)
