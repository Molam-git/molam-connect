# Molam Python SDK (Brique 105)

Production-ready server-side Python SDK for Molam Form/Connect/Ma integration.

[![CI](https://github.com/molam/python-sdk/workflows/CI/badge.svg)](https://github.com/molam/python-sdk/actions)
[![Python Version](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Code Style: Black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

---

## Features

- **🔄 Sync & Async**: Both synchronous and asynchronous clients for flexibility
- **🔒 Secure**: HMAC-SHA256 webhook verification, constant-time comparison, replay protection
- **⚡ Performant**: Automatic retries with exponential backoff, connection pooling
- **🛡️ Resilient**: Idempotency support, comprehensive error handling
- **📝 Type-Safe**: Full type hints for better IDE support and type checking
- **🔌 Pluggable**: Custom HTTP adapters for testing and custom requirements
- **🔭 Observable**: Structured logging, metrics hooks, request/response tracing
- **✅ Tested**: Comprehensive test suite with 90%+ coverage

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage](#usage)
  - [Synchronous Client](#synchronous-client)
  - [Asynchronous Client](#asynchronous-client)
  - [Payment Intents](#payment-intents)
  - [Refunds](#refunds)
  - [Payouts](#payouts)
  - [Webhooks](#webhooks)
- [Idempotency](#idempotency)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## Installation

### Via pip

```bash
pip install molam-sdk-python
```

### From source

```bash
git clone https://github.com/molam/python-sdk.git
cd python-sdk
pip install -e .
```

### Development installation

```bash
pip install -e ".[dev]"
```

### Requirements

- Python 3.10 or higher
- requests >= 2.31.0
- aiohttp >= 3.9.0 (for async client)
- pyjwt >= 2.8.0
- pydantic >= 2.5.0

---

## Quick Start

### 1. Get API Key

Sign up at [https://dashboard.molam.io](https://dashboard.molam.io) and generate an API key.

### 2. Set Environment Variables

```bash
export MOLAM_API_KEY="sk_test_your_api_key"
export MOLAM_API_BASE="https://staging-api.molam.com"  # Use staging for testing
export MOLAM_WEBHOOK_SECRET="whsec_your_webhook_secret"
```

### 3. Create Your First Payment

```python
from molam_sdk import Config, MolamClient

# Initialize SDK
config = Config(api_key="sk_test_...")
client = MolamClient(config)

# Create payment intent
payment = client.create_payment_intent(
    amount=2500,  # $25.00 in cents
    currency="USD",
    description="Order #12345",
)

print(f"Payment ID: {payment['id']}")
print(f"Status: {payment['status']}")
```

---

## Configuration

### Configuration Options

```python
from molam_sdk import Config

config = Config(
    # Required
    api_key="sk_test_...",

    # Optional (with defaults)
    api_base="https://api.molam.com",  # API base URL
    default_currency="USD",             # Default currency
    default_locale="en",                # Default locale
    webhook_secret="whsec_...",         # Webhook signature secret
    timeout=30,                         # Request timeout (seconds)
    max_retries=3,                      # Maximum retry attempts
)
```

### From Environment Variables

```python
# Automatically loads from environment
config = Config()

# Environment variables:
# - MOLAM_API_KEY
# - MOLAM_API_BASE
# - MOLAM_DEFAULT_CURRENCY
# - MOLAM_DEFAULT_LOCALE
# - MOLAM_WEBHOOK_SECRET
```

---

## Usage

### Synchronous Client

For traditional synchronous applications (Flask, Django, etc.):

```python
from molam_sdk import Config, MolamClient

config = Config(api_key="sk_test_...")
client = MolamClient(config)

# Create payment
payment = client.create_payment_intent(
    amount=5000,
    currency="USD",
    customer_id="cust_123",
)

# Retrieve payment
retrieved = client.retrieve_payment_intent(payment['id'])

# List payments
payments = client.list_payment_intents(limit=10, status="succeeded")
```

### Asynchronous Client

For async applications (FastAPI, aiohttp, etc.):

```python
import asyncio
from molam_sdk import Config, MolamAsyncClient

async def main():
    config = Config(api_key="sk_test_...")

    async with MolamAsyncClient(config) as client:
        # Create payment (async)
        payment = await client.create_payment_intent(
            amount=5000,
            currency="USD",
        )

        # Retrieve payment (async)
        retrieved = await client.retrieve_payment_intent(payment['id'])

        # Concurrent operations
        results = await asyncio.gather(
            client.list_payment_intents(limit=5),
            client.retrieve_payment_intent(payment['id']),
        )

asyncio.run(main())
```

### Payment Intents

#### Create Payment Intent

```python
payment = client.create_payment_intent(
    amount=2500,                          # Amount in smallest currency unit
    currency="USD",                       # Currency code
    customer_id="cust_123",              # Optional customer ID
    merchant_id="merch_456",             # Optional merchant ID
    description="Order #12345",          # Payment description
    metadata={                           # Custom metadata
        "order_id": "12345",
        "customer_email": "user@example.com",
    },
    capture=False,                       # Manual capture
    return_url="https://example.com/success",  # Return URL
    cancel_url="https://example.com/cancel",   # Cancel URL
    idempotency_key="order-12345",       # Optional idempotency key
)
```

#### Confirm Payment Intent

```python
confirmed = client.confirm_payment_intent(
    payment_intent_id="pi_abc123",
    payment_method="pm_card_123",  # Optional payment method
)
```

#### Cancel Payment Intent

```python
canceled = client.cancel_payment_intent("pi_abc123")
```

#### List Payment Intents

```python
payments = client.list_payment_intents(
    limit=10,
    offset=0,
    customer_id="cust_123",  # Filter by customer
    status="succeeded",       # Filter by status
)

for payment in payments['data']:
    print(f"{payment['id']}: {payment['amount']} {payment['currency']}")
```

### Refunds

#### Create Full Refund

```python
refund = client.create_refund(
    charge_id="ch_abc123",
    reason="requested_by_customer",
    metadata={"support_ticket": "TKT-456"},
)
```

#### Create Partial Refund

```python
refund = client.create_refund(
    charge_id="ch_abc123",
    amount=1000,  # Partial refund amount
    reason="discount_applied",
)
```

#### Retrieve Refund

```python
refund = client.retrieve_refund("ref_abc123")
```

### Payouts

```python
payout = client.create_payout(
    origin_module="connect",
    origin_entity_id="merch_123",
    amount=500.00,
    currency="USD",
    beneficiary={
        "type": "bank_account",
        "bank_code": "123456",
        "account_number": "9876543210",
        "account_holder": "Jane Doe",
    },
    metadata={"payout_batch": "BATCH-2025-01"},
)
```

### Webhooks

#### Verify Webhook Signature

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/webhook/molam", methods=["POST"])
def molam_webhook():
    # Get signature and body
    signature = request.headers.get("Molam-Signature")
    raw_body = request.get_data()

    # Verify signature
    try:
        client.verify_webhook_signature(signature, raw_body)
    except SignatureError as e:
        return jsonify({"error": "Invalid signature"}), 401

    # Process event
    event = request.get_json()
    if event['type'] == 'payment_intent.succeeded':
        handle_payment_succeeded(event['data'])

    return jsonify({"status": "ok"}), 200
```

#### Manual Verification

```python
from molam_sdk.utils.webhook import verify_signature

def get_secret_by_kid(kid: str) -> str:
    # Fetch from environment, database, or Vault
    return os.getenv("MOLAM_WEBHOOK_SECRET")

try:
    verify_signature(
        signature_header,
        raw_body,
        get_secret_by_kid,
        tolerance_ms=5 * 60 * 1000,  # 5 minutes
    )
    print("✓ Signature verified")
except SignatureError as e:
    print(f"✗ Verification failed: {e}")
```

---

## Idempotency

Idempotency keys prevent duplicate operations in distributed systems.

### Auto-Generated Keys

```python
# SDK auto-generates key and logs warning
payment = client.create_payment_intent(
    amount=1000,
    currency="USD",
)
# Generates key like: molam-1705420800000-abc123def456
```

### Custom Keys

```python
# Recommended: use your own business logic
payment = client.create_payment_intent(
    amount=1000,
    currency="USD",
    idempotency_key=f"order-{order_id}",  # Custom key
)
```

### Database Storage

```sql
-- Run migration
psql -d your_database -f migrations/001_idempotency_and_webhooks.sql
```

```python
from molam_sdk.utils.idempotency import IdempotencyStore

# Store idempotency key
store = IdempotencyStore(db_connection)
store.store_response(
    idempotency_key="order-12345",
    route="/v1/connect/payment_intents",
    response=payment_data,
    status="completed",
)

# Check for cached response
cached = store.get_cached_response("order-12345", "/v1/connect/payment_intents")
if cached:
    return cached['response']
```

---

## Error Handling

### Exception Hierarchy

```python
from molam_sdk.exceptions import (
    MolamError,        # Base exception
    ApiError,          # API errors (4xx, 5xx)
    SignatureError,    # Webhook verification errors
    NetworkError,      # Network connectivity errors
    TimeoutError,      # Request timeout errors
    ValidationError,   # Input validation errors
)
```

### Handling Errors

```python
try:
    payment = client.create_payment_intent(amount=1000, currency="USD")
except ValidationError as e:
    print(f"Validation failed: {e}")
    print(f"Errors: {e.errors}")
except ApiError as e:
    print(f"API error: {e}")
    print(f"Status: {e.status_code}")
    print(f"Request ID: {e.request_id}")
    print(f"Payload: {e.payload}")
except NetworkError as e:
    print(f"Network error: {e}")
except TimeoutError as e:
    print(f"Request timed out: {e}")
except MolamError as e:
    print(f"Molam SDK error: {e}")
```

### Production Error Handling

```python
import logging
import time

logger = logging.getLogger(__name__)

def create_payment_with_retry(amount, currency, max_attempts=3):
    for attempt in range(max_attempts):
        try:
            return client.create_payment_intent(
                amount=amount,
                currency=currency,
                idempotency_key=f"payment-{int(time.time())}",
            )
        except ApiError as e:
            if e.status_code >= 500:
                # Server error - retry
                logger.warning(f"Server error, retrying... (attempt {attempt + 1})")
                time.sleep(2 ** attempt)  # Exponential backoff
                continue
            elif e.status_code == 429:
                # Rate limit - backoff
                logger.warning("Rate limited, backing off...")
                time.sleep(5)
                continue
            else:
                # Client error - don't retry
                raise
        except NetworkError as e:
            # Network error - retry
            logger.warning(f"Network error, retrying... (attempt {attempt + 1})")
            time.sleep(2 ** attempt)
            continue

    raise Exception("Max retry attempts exceeded")
```

---

## Testing

### Run Tests

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run all tests
pytest

# Run with coverage
pytest --cov=molam_sdk --cov-report=html

# Run specific test file
pytest tests/test_client.py -v

# Run with output
pytest -v --tb=short
```

### Mock Testing

```python
from molam_sdk import Config, MolamClient
from molam_sdk.http.adapter import HTTPAdapter

class MockAdapter(HTTPAdapter):
    def send(self, method, url, headers, json=None, timeout=10):
        # Return mock response
        return (200, '{"id":"pi_test","status":"succeeded"}', {})

# Use mock adapter in tests
config = Config(api_key="sk_test_123")
client = MolamClient(config, http_adapter=MockAdapter())

payment = client.create_payment_intent(amount=1000, currency="USD")
assert payment['id'] == "pi_test"
```

---

## Security

### Best Practices

1. **Never commit secrets** - Use environment variables
2. **Always verify webhook signatures** - Prevents unauthorized events
3. **Use HTTPS in production** - TLS enforced by default
4. **Rotate secrets regularly** - Multi-version support via `kid`
5. **Use idempotency keys** - Prevents duplicate operations
6. **Validate inputs** - SDK validates automatically
7. **Keep SDK updated** - `pip install --upgrade molam-sdk-python`

### Webhook Security

```python
# ✅ CORRECT: Always verify signatures
try:
    client.verify_webhook_signature(signature, raw_body)
    event = json.loads(raw_body)
    # Process event
except SignatureError:
    return {"error": "Invalid signature"}, 401

# ❌ WRONG: Never skip verification
event = request.get_json()  # DANGEROUS!
```

### Secret Rotation

When rotating webhook secrets:

1. Generate new secret in Molam dashboard (new `kid`)
2. Update secret provider to support both old and new `kid`
3. Deploy updated configuration
4. Monitor for webhooks using old `kid`
5. Retire old secret after migration period

```python
def get_secret_by_kid(kid: str) -> str:
    secrets = {
        "1": "whsec_old_secret",  # Retiring
        "2": "whsec_new_secret",  # Active
    }
    return secrets.get(kid, "")
```

---

## Examples

See [examples/](examples/) directory for complete examples:

- **[checkout_server.py](examples/checkout_server.py)** - Synchronous payment flow
- **[async_checkout.py](examples/async_checkout.py)** - Asynchronous payment flow
- **[webhook_receiver.py](examples/webhook_receiver.py)** - Webhook verification and processing

### Run Examples

```bash
# Set environment variables
export MOLAM_API_KEY="sk_test_..."
export MOLAM_WEBHOOK_SECRET="whsec_..."

# Run sync example
python examples/checkout_server.py

# Run async example
python examples/async_checkout.py

# Run webhook server
python examples/webhook_receiver.py --server
```

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`pytest`)
4. Run linters (`flake8`, `black`, `mypy`)
5. Commit changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Setup

```bash
git clone https://github.com/molam/python-sdk.git
cd python-sdk
pip install -e ".[dev]"
pytest
```

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Support

- **Documentation**: [https://docs.molam.io](https://docs.molam.io)
- **API Reference**: [https://api.molam.io/docs](https://api.molam.io/docs)
- **GitHub Issues**: [https://github.com/molam/python-sdk/issues](https://github.com/molam/python-sdk/issues)
- **Email**: support@molam.io

---

**Made with ❤️ by the Molam team**
