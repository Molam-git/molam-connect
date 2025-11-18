# Changelog

All notable changes to the Molam PHP SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- GraphQL API support
- Bulk operations API
- Advanced retry strategies (circuit breaker)
- Async/promise-based HTTP client option

---

## [1.0.0] - 2025-01-16

### Added
- **Core SDK Client**
  - Complete API coverage: PaymentIntents, Refunds, Payouts, Merchants
  - Automatic retries with exponential backoff and jitter
  - Idempotency support with database storage
  - Configurable timeouts and SSL verification
  - PSR-3 logging support
  - PSR-18 HTTP client interface (pluggable)
  - Default Guzzle HTTP client implementation

- **Security Features**
  - HMAC-SHA256 webhook signature verification
  - API key validation (must start with 'sk_')
  - TLS-only enforcement in production mode
  - Constant-time signature comparison
  - Replay attack prevention (timestamp validation)
  - Secret rotation support via key ID (kid)

- **Error Handling**
  - Comprehensive exception hierarchy
  - ApiException with status code, error code, request ID
  - ValidationException with field-level errors
  - NetworkException for connectivity issues
  - TimeoutException for request timeouts

- **Utilities**
  - Idempotency key manager with PDO storage
  - Webhook signature verifier
  - UUID v4 generator
  - Sanitized logging (masks secrets)

- **Database Schema**
  - SQL migrations for idempotency keys
  - Webhook events storage table
  - Webhook subscriptions table (multi-tenant support)
  - Payment cache table (optional)

- **Testing**
  - PHPUnit test suite with 90%+ coverage
  - Mock HTTP client for unit testing
  - Integration test support with MySQL
  - GitHub Actions CI/CD pipeline
  - Multi-PHP version testing (8.1, 8.2, 8.3)

- **Code Quality**
  - PSR-12 code style (PHP-CS-Fixer)
  - PHPStan static analysis (level 8)
  - Security vulnerability scanning
  - Automated code formatting

- **Examples**
  - Complete checkout server (examples/checkout_server.php)
  - Webhook receiver with signature verification (examples/webhook_receiver.php)
  - Event processing handlers
  - Database integration examples

- **Documentation**
  - Comprehensive README with usage examples
  - API reference with PHPDoc annotations
  - Security best practices guide
  - Installation and configuration guide
  - Error handling guide
  - Webhook integration guide

### API Coverage

#### Payment Intents
- `createPaymentIntent(array $data, ?string $idempotencyKey): array`
- `retrievePaymentIntent(string $paymentIntentId): array`
- `listPaymentIntents(array $params): array`
- `confirmPaymentIntent(string $paymentIntentId, ?string $idempotencyKey): array`
- `cancelPaymentIntent(string $paymentIntentId, ?string $idempotencyKey): array`

#### Refunds
- `createRefund(array $data, ?string $idempotencyKey): array`
- `retrieveRefund(string $refundId): array`
- `listRefunds(array $params): array`

#### Payouts
- `createPayout(array $data, ?string $idempotencyKey): array`
- `retrievePayout(string $payoutId): array`

#### Merchants
- `createMerchant(array $data, ?string $idempotencyKey): array`
- `retrieveMerchant(string $merchantId): array`
- `updateMerchant(string $merchantId, array $data): array`

#### Webhooks
- `verifyWebhookSignature(string $signatureHeader, string $payload): bool`

### Configuration Options
- `api_key` (required) - Molam API key
- `api_base` (optional, default: 'https://api.molam.io') - API base URL
- `webhook_secret` (optional) - Webhook signature secret
- `default_currency` (optional, default: 'USD') - Default currency
- `default_locale` (optional, default: 'en') - Default locale
- `timeout` (optional, default: 10.0) - Request timeout in seconds
- `max_retries` (optional, default: 3) - Max retry attempts
- `verify_ssl` (optional, default: true) - SSL verification
- `debug` (optional, default: false) - Debug mode
- `vault_endpoint` (optional) - Vault/KMS endpoint for secrets

### Requirements
- PHP 8.1 or higher
- Composer
- Extensions: mbstring, json, pdo (for idempotency)
- Guzzle 7.7+ (HTTP client)

### Breaking Changes
- None (initial release)

### Deprecated
- None

### Security
- All secrets are masked in logs via `Config::toArray()`
- HTTPS is enforced in production mode (unless `debug=true`)
- API keys must start with `sk_` prefix
- Webhook signatures use constant-time comparison

---

## Version History Legend

- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Security improvements

---

## Migration Guides

### Migrating to 1.0.0
This is the initial release, no migration needed.

---

## Support

For questions or issues, please:
1. Check the [README](README.md) and documentation
2. Search [GitHub Issues](https://github.com/molam/php-sdk/issues)
3. Contact support at support@molam.io

---

[Unreleased]: https://github.com/molam/php-sdk/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/molam/php-sdk/releases/tag/v1.0.0
