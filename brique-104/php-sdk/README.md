# Molam PHP SDK

Production-ready PHP SDK for Molam Form/Connect/Ma integration.

[![CI](https://github.com/molam/php-sdk/workflows/CI/badge.svg)](https://github.com/molam/php-sdk/actions)
[![Latest Version](https://img.shields.io/packagist/v/molam/sdk-php.svg)](https://packagist.org/packages/molam/sdk-php)
[![PHP Version](https://img.shields.io/packagist/php-v/molam/sdk-php.svg)](https://packagist.org/packages/molam/sdk-php)
[![License](https://img.shields.io/packagist/l/molam/sdk-php.svg)](LICENSE)

---

## Features

- **🔒 Secure**: HMAC-SHA256 webhook verification, TLS-only, API key validation
- **⚡ Performant**: Automatic retries with exponential backoff, pluggable PSR-18 HTTP client
- **🛡️ Resilient**: Idempotency support, comprehensive error handling, validation
- **📝 Type-Safe**: PHP 8.1+ with strict types, full PHPDoc annotations
- **✅ Tested**: PHPUnit tests with 90%+ coverage, CI/CD pipeline
- **📦 Standards-Compliant**: PSR-4 autoloading, PSR-3 logging, PSR-18 HTTP client
- **🔧 Developer-Friendly**: Fluent API, detailed exceptions, extensive examples

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
  - [Payment Intents](#payment-intents)
  - [Refunds](#refunds)
  - [Payouts](#payouts)
  - [Merchants](#merchants)
  - [Webhooks](#webhooks)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Examples](#examples)
- [Security](#security)
- [Support](#support)
- [License](#license)

---

## Installation

### Via Composer (Recommended)

```bash
composer require molam/sdk-php
```

### Manual Installation

1. Download the latest release from [GitHub](https://github.com/molam/php-sdk/releases)
2. Extract and include in your project:

```php
require_once 'path/to/molam-sdk/vendor/autoload.php';
```

### Requirements

- PHP 8.1 or higher
- Composer
- Extensions: `mbstring`, `json`, `pdo` (for idempotency)

---

## Quick Start

### 1. Get API Key

Sign up at [https://dashboard.molam.io](https://dashboard.molam.io) and generate an API key.

### 2. Initialize Client

```php
<?php

require_once 'vendor/autoload.php';

use Molam\SDK\Client;
use Molam\SDK\Config;

// Configure SDK
$config = new Config([
    'api_key' => 'sk_test_your_api_key_here',
    'api_base' => 'https://sandbox.api.molam.io',  // Use sandbox for testing
    'webhook_secret' => 'whsec_your_webhook_secret',
]);

// Create client
$molam = new Client($config);
```

### 3. Create Payment Intent

```php
// Create payment intent
$payment = $molam->createPaymentIntent([
    'amount' => 100.00,
    'currency' => 'USD',
    'description' => 'Order #12345',
    'return_url' => 'https://yoursite.com/success',
    'cancel_url' => 'https://yoursite.com/cancel',
    'metadata' => [
        'order_id' => '12345',
        'customer_email' => 'customer@example.com',
    ],
]);

echo "Payment ID: " . $payment['id'] . "\n";
echo "Status: " . $payment['status'] . "\n";
echo "Redirect URL: " . $payment['redirect_url'] . "\n";
```

---

## Configuration

### Configuration Options

```php
$config = new Config([
    // Required
    'api_key' => 'sk_test_...',

    // Optional (with defaults)
    'api_base' => 'https://api.molam.io',
    'webhook_secret' => '',
    'default_currency' => 'USD',
    'default_locale' => 'en',
    'timeout' => 10.0,           // Request timeout in seconds
    'max_retries' => 3,          // Max retry attempts
    'verify_ssl' => true,        // SSL certificate verification
    'debug' => false,            // Enable debug mode
    'vault_endpoint' => null,    // Optional Vault/KMS endpoint
]);
```

### Environment Variables

```bash
export MOLAM_API_KEY="sk_test_..."
export MOLAM_API_BASE="https://sandbox.api.molam.io"
export MOLAM_WEBHOOK_SECRET="whsec_..."
```

Then load from environment:

```php
$config = new Config([
    'api_key' => getenv('MOLAM_API_KEY'),
    'api_base' => getenv('MOLAM_API_BASE'),
    'webhook_secret' => getenv('MOLAM_WEBHOOK_SECRET'),
]);
```

---

## Usage Examples

### Payment Intents

#### Create Payment Intent

```php
$payment = $molam->createPaymentIntent([
    'amount' => 75.50,
    'currency' => 'EUR',
    'description' => 'Premium subscription',
    'customer_id' => 'cus_abc123',
    'merchant_id' => 'merch_xyz789',
    'return_url' => 'https://yoursite.com/success',
    'cancel_url' => 'https://yoursite.com/cancel',
    'metadata' => [
        'plan' => 'premium',
        'billing_cycle' => 'monthly',
    ],
], 'idempotency-key-12345');  // Optional idempotency key
```

#### Retrieve Payment Intent

```php
$payment = $molam->retrievePaymentIntent('pi_abc123');

echo "Status: " . $payment['status'] . "\n";
echo "Amount: " . $payment['amount'] . " " . $payment['currency'] . "\n";
```

#### List Payment Intents

```php
$payments = $molam->listPaymentIntents([
    'limit' => 10,
    'offset' => 0,
    'status' => 'succeeded',
    'customer_id' => 'cus_abc123',
]);

foreach ($payments['data'] as $payment) {
    echo $payment['id'] . ": " . $payment['status'] . "\n";
}
```

#### Confirm Payment Intent

```php
$confirmed = $molam->confirmPaymentIntent('pi_abc123');
```

#### Cancel Payment Intent

```php
$canceled = $molam->cancelPaymentIntent('pi_abc123');
```

### Refunds

#### Create Full Refund

```php
$refund = $molam->createRefund([
    'payment_id' => 'pi_abc123',
    'reason' => 'requested_by_customer',
    'metadata' => [
        'support_ticket' => 'TKT-12345',
    ],
]);
```

#### Create Partial Refund

```php
$refund = $molam->createRefund([
    'payment_id' => 'pi_abc123',
    'amount' => 25.00,  // Partial amount
    'reason' => 'discount_applied',
]);
```

#### Retrieve Refund

```php
$refund = $molam->retrieveRefund('ref_abc123');
```

#### List Refunds

```php
$refunds = $molam->listRefunds([
    'limit' => 10,
    'payment_id' => 'pi_abc123',
]);
```

### Payouts

#### Create Payout

```php
$payout = $molam->createPayout([
    'amount' => 500.00,
    'currency' => 'USD',
    'merchant_id' => 'merch_xyz789',
    'bank_account_id' => 'ba_abc123',
    'metadata' => [
        'period' => '2025-01',
    ],
]);
```

#### Retrieve Payout

```php
$payout = $molam->retrievePayout('po_abc123');
```

### Merchants

#### Create Merchant Account

```php
$merchant = $molam->createMerchant([
    'email' => 'merchant@example.com',
    'business_name' => 'Example Corp',
    'country' => 'US',
    'industry' => 'retail',
    'website' => 'https://example.com',
]);
```

#### Retrieve Merchant

```php
$merchant = $molam->retrieveMerchant('merch_xyz789');
```

#### Update Merchant

```php
$updated = $molam->updateMerchant('merch_xyz789', [
    'business_name' => 'Example Corporation',
    'phone' => '+1234567890',
]);
```

### Webhooks

#### Verify Webhook Signature

```php
// In your webhook endpoint (e.g., webhook.php)
$signature = $_SERVER['HTTP_MOLAM_SIGNATURE'] ?? '';
$payload = file_get_contents('php://input');

try {
    $isValid = $molam->verifyWebhookSignature($signature, $payload);

    if ($isValid) {
        $event = json_decode($payload, true);

        // Process event
        switch ($event['type']) {
            case 'payment_intent.succeeded':
                handlePaymentSucceeded($event['data']);
                break;

            case 'payment_intent.failed':
                handlePaymentFailed($event['data']);
                break;

            case 'refund.created':
                handleRefundCreated($event['data']);
                break;
        }

        http_response_code(200);
        echo json_encode(['status' => 'ok']);
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid signature']);
    }
} catch (InvalidArgumentException $e) {
    http_response_code(401);
    echo json_encode(['error' => $e->getMessage()]);
}
```

See [examples/webhook_receiver.php](examples/webhook_receiver.php) for complete webhook handler.

---

## Error Handling

### Exception Hierarchy

```php
use Molam\SDK\Exceptions\ApiException;
use Molam\SDK\Exceptions\ValidationException;
use Molam\SDK\Exceptions\NetworkException;
use Molam\SDK\Exceptions\TimeoutException;

try {
    $payment = $molam->createPaymentIntent([...]);
} catch (ValidationException $e) {
    // Input validation failed (400)
    echo "Validation errors: " . json_encode($e->getErrors());
} catch (ApiException $e) {
    // API returned an error (4xx, 5xx)
    echo "API Error: " . $e->getMessage() . "\n";
    echo "Status Code: " . $e->getStatusCode() . "\n";
    echo "Error Code: " . $e->getErrorCode() . "\n";
    echo "Request ID: " . $e->getRequestId() . "\n";
} catch (TimeoutException $e) {
    // Request timed out
    echo "Timeout: " . $e->getMessage();
} catch (NetworkException $e) {
    // Network connectivity issue
    echo "Network Error: " . $e->getMessage();
}
```

### Production Error Handling

```php
try {
    $payment = $molam->createPaymentIntent([...]);
} catch (ApiException $e) {
    $statusCode = $e->getStatusCode();

    if ($statusCode >= 500) {
        // Server error - retry or alert ops
        error_log("Molam server error: " . $e->getMessage());
        // Implement retry logic or notify ops team
    } elseif ($statusCode === 429) {
        // Rate limit - backoff
        sleep(5);
        // Retry request
    } elseif ($statusCode >= 400) {
        // Client error - log and handle
        error_log("Molam client error: " . $e->getMessage());
    }

    throw $e;  // Re-throw or handle gracefully
} catch (Exception $e) {
    error_log("Unexpected error: " . $e->getMessage());
    // Alert monitoring system
}
```

---

## Testing

### Run Unit Tests

```bash
# Run all tests
composer test

# Run tests with coverage
composer test -- --coverage-html coverage/

# Run specific test
vendor/bin/phpunit tests/ClientTest.php
```

### Run Code Style Check

```bash
# Check code style
composer cs -- --dry-run

# Fix code style automatically
composer cs
```

### Run Static Analysis

```bash
composer stan
```

---

## Examples

Complete examples available in [examples/](examples/) directory:

- **[checkout_server.php](examples/checkout_server.php)** - Full checkout server with payment flow
- **[webhook_receiver.php](examples/webhook_receiver.php)** - Secure webhook handler with signature verification

### Run Checkout Server

```bash
php -S localhost:8080 examples/checkout_server.php
```

Then test:

```bash
# Create payment
curl -X POST http://localhost:8080/create-payment \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "currency": "USD"}'

# Retrieve payment
curl http://localhost:8080/payment/pi_abc123
```

---

## Security

### Best Practices

1. **Never commit API keys** - Use environment variables
2. **Always verify webhook signatures** - Prevents unauthorized events
3. **Use HTTPS in production** - TLS enforced by default
4. **Validate inputs** - SDK validates automatically, add custom validation as needed
5. **Use idempotency keys** - Prevents duplicate operations
6. **Sanitize logs** - Config.toArray() masks secrets automatically
7. **Keep SDK updated** - Run `composer update molam/sdk-php` regularly

### Webhook Security

```php
// ✅ CORRECT: Always verify signatures
$isValid = $molam->verifyWebhookSignature($signature, $payload);
if (!$isValid) {
    http_response_code(401);
    exit;
}

// ❌ WRONG: Never skip signature verification
$event = json_decode($payload);  // Dangerous!
```

### Secret Rotation

When rotating webhook secrets:

1. Generate new secret in Molam dashboard
2. Update `MOLAM_WEBHOOK_SECRET` environment variable
3. Deploy updated configuration
4. Old webhooks will fail verification after rotation

---

## Support

- **Documentation**: [https://docs.molam.io](https://docs.molam.io)
- **API Reference**: [https://api.molam.io/docs](https://api.molam.io/docs)
- **GitHub Issues**: [https://github.com/molam/php-sdk/issues](https://github.com/molam/php-sdk/issues)
- **Email**: support@molam.io
- **Slack**: #molam-sdk

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Ensure:
- Tests pass (`composer test`)
- Code style passes (`composer cs`)
- Static analysis passes (`composer stan`)

---

**Made with ❤️ by the Molam team**
