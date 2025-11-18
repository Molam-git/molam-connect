# Molam Python SDK - Quickstart Guide

Get started with Molam payments in 5 minutes.

---

## Installation

### Install from Internal PyPI

```bash
pip install --index-url https://pypi.internal.molam.io molam-python-sdk
```

### Install from Public PyPI (when available)

```bash
pip install molam-python-sdk
```

### Development Installation

```bash
git clone https://github.com/molam/python-sdk.git
cd python-sdk
pip install -e .
```

---

## Quick Start

### 1. Get API Key

1. Sign up at [https://dashboard.molam.io](https://dashboard.molam.io)
2. Navigate to **API Keys** section
3. Generate a new API key (starts with `sk_test_` for sandbox or `sk_live_` for production)

### 2. Set Environment Variable

```bash
export MOLAM_API_KEY="sk_test_your_api_key_here"
```

### 3. Create Your First Payment

```python
import os
import uuid
from molam_sdk import MolamSyncClient, ClientConfig, PaymentIntentCreate

# Initialize client
config = ClientConfig(
    api_key=os.getenv("MOLAM_API_KEY"),
    base_url="https://sandbox.api.molam.io"  # Use sandbox for testing
)
client = MolamSyncClient(config)

# Create payment intent
payment = client.create_payment_intent(
    PaymentIntentCreate(
        amount=100.00,
        currency="USD",
        description="Test payment",
        return_url="https://yoursite.com/success"
    ),
    idempotency_key=f"payment-{uuid.uuid4()}"
)

print(f"Payment ID: {payment.id}")
print(f"Status: {payment.status}")
print(f"Redirect URL: {payment.redirect_url}")
```

---

## Client Types

### Sync Client (Recommended for most use cases)

Best for Django, Flask, or traditional web apps.

```python
from molam_sdk import MolamSyncClient, ClientConfig

client = MolamSyncClient(ClientConfig(api_key="sk_test_..."))
payment = client.create_payment_intent(...)  # Blocks until complete
```

**Features**:
- Circuit breaker protection
- Automatic metrics
- Retry logic
- Idempotency handling

### Async Client (For async frameworks)

Best for FastAPI, aiohttp, or async applications.

```python
from molam_sdk import MolamAsyncClient, ClientConfig
import asyncio

async def create_payment():
    config = ClientConfig(api_key="sk_test_...")
    async with MolamAsyncClient(config) as client:
        payment = await client.create_payment_intent(...)
        return payment

asyncio.run(create_payment())
```

### Base Client (Low-level)

Direct API client without circuit breaker (use for custom implementations).

```python
from molam_sdk import MolamClient, ClientConfig

client = MolamClient(ClientConfig(api_key="sk_test_..."))
payment = client.create_payment_intent(...)
```

---

## Common Operations

### Create Payment Intent

```python
from molam_sdk.models import PaymentIntentCreate

payment = client.create_payment_intent(
    PaymentIntentCreate(
        amount=75.50,
        currency="EUR",
        description="Order #12345",
        customer_id="cus_abc123",
        merchant_id="merch_xyz789",
        return_url="https://yoursite.com/success",
        cancel_url="https://yoursite.com/cancel",
        metadata={"order_id": "12345", "customer_email": "user@example.com"}
    ),
    idempotency_key="payment-order-12345"
)
```

### Retrieve Payment Intent

```python
payment = client.retrieve_payment_intent("pi_abc123")

print(f"Status: {payment.status}")
print(f"Amount: {payment.amount} {payment.currency}")
```

### Confirm Payment Intent

```python
confirmed = client.confirm_payment_intent(
    "pi_abc123",
    idempotency_key="confirm-pi-abc123"
)

print(f"Confirmed: {confirmed.status}")
```

### Create Refund

```python
from molam_sdk.models import RefundCreate

# Full refund
refund = client.create_refund(
    RefundCreate(
        payment_id="pi_abc123",
        reason="requested_by_customer"
    ),
    idempotency_key="refund-pi-abc123"
)

# Partial refund
refund = client.create_refund(
    RefundCreate(
        payment_id="pi_abc123",
        amount=25.00,  # Partial amount
        reason="discount_applied"
    ),
    idempotency_key="partial-refund-pi-abc123"
)
```

---

## Configuration

### Full Configuration Options

```python
from molam_sdk import ClientConfig

config = ClientConfig(
    # Required
    api_key="sk_test_...",

    # Optional (with defaults)
    base_url="https://api.molam.io",
    timeout_connect=5.0,  # Connection timeout (seconds)
    timeout_read=15.0,    # Read timeout (seconds)
    verify_ssl=True,      # SSL certificate verification
    max_retries=3,        # Automatic retry attempts
    retry_backoff_factor=0.3,  # Exponential backoff factor
    default_currency="USD",
    default_locale="en",
    debug=False,  # Enable debug logging

    # mTLS (for sensitive endpoints)
    mtls_cert="/path/to/client.crt",
    mtls_key="/path/to/client.key",
)
```

### Environment-Based Configuration

```python
import os

config = ClientConfig(
    api_key=os.getenv("MOLAM_API_KEY"),
    base_url=os.getenv("MOLAM_BASE_URL", "https://api.molam.io"),
    debug=os.getenv("MOLAM_DEBUG", "false").lower() == "true"
)
```

---

## Error Handling

### Handle All Errors

```python
from molam_sdk.exceptions import (
    APIError,
    NetworkError,
    TimeoutError,
    IdempotencyError,
    ConfigurationError
)

try:
    payment = client.create_payment_intent(...)
except APIError as e:
    print(f"API Error: {e.message}")
    print(f"Status Code: {e.status_code}")
    print(f"Request ID: {e.request_id}")
except NetworkError as e:
    print(f"Network Error: {e}")
except TimeoutError as e:
    print(f"Timeout: {e}")
except IdempotencyError as e:
    print(f"Idempotency Error: {e}")
```

### Production Error Handling

```python
import logging

logger = logging.getLogger(__name__)

try:
    payment = client.create_payment_intent(...)
except APIError as e:
    if e.status_code >= 500:
        # Server error - retry
        logger.error(f"Server error: {e.message}")
        # Implement retry logic or alert ops
    elif e.status_code == 429:
        # Rate limit - backoff
        logger.warning("Rate limited, backing off...")
    elif e.status_code >= 400:
        # Client error - log and handle
        logger.warning(f"Client error: {e.message}")
except Exception as e:
    logger.exception("Unexpected error")
    # Alert monitoring system
```

---

## Webhooks

### Verify Webhook Signature

```python
from molam_sdk import MolamClient

# In your webhook handler (Flask example)
@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('Molam-Signature')
    payload = request.get_data()

    # Verify signature
    is_valid = MolamClient.verify_webhook_signature(
        signature_header=signature,
        payload=payload,
        secret_provider=lambda kid: os.getenv('MOLAM_WEBHOOK_SECRET')
    )

    if not is_valid:
        return 'Invalid signature', 401

    # Process webhook
    event = request.get_json()
    if event['type'] == 'payment_intent.succeeded':
        # Handle successful payment
        print(f"Payment succeeded: {event['data']['id']}")

    return 'OK', 200
```

See [webhook_handler.py](../examples/webhook_handler.py) for complete example.

---

## Examples

### Django Integration

See [examples/django_app/views.py](../examples/django_app/views.py)

```python
from molam_sdk import MolamSyncClient, ClientConfig

client = MolamSyncClient(ClientConfig(api_key=os.getenv("MOLAM_API_KEY")))

@csrf_exempt
def create_payment(request):
    data = json.loads(request.body)
    payment = client.create_payment_intent(...)
    return JsonResponse({"payment_id": payment.id})
```

### FastAPI Integration

See [examples/fastapi_app/main.py](../examples/fastapi_app/main.py)

```python
from fastapi import FastAPI
from molam_sdk import MolamSyncClient, ClientConfig

app = FastAPI()
client = MolamSyncClient(ClientConfig(api_key=os.getenv("MOLAM_API_KEY")))

@app.post("/payments")
def create_payment(request: PaymentRequest):
    payment = client.create_payment_intent(...)
    return {"payment_id": payment.id}
```

### CLI Demo

See [examples/cli_demo.py](../examples/cli_demo.py)

```bash
export MOLAM_API_KEY="sk_test_..."
python examples/cli_demo.py create-payment --amount 49.99 --currency USD
python examples/cli_demo.py get-payment pi_abc123
python examples/cli_demo.py demo  # Run complete flow
```

---

## Monitoring & Observability

### Enable Structured Logging

```python
from molam_sdk.logging_setup import setup_structured_logger
import logging

setup_structured_logger(logging.INFO)
# All SDK logs now output JSON
```

### Expose Prometheus Metrics

```python
from prometheus_client import generate_latest
from flask import Flask, Response

app = Flask(__name__)

@app.route('/metrics')
def metrics():
    return Response(generate_latest(), mimetype='text/plain')
```

**Available Metrics**:
- `molam_sdk_requests_total{endpoint, code}` - Request counter
- `molam_sdk_request_latency_seconds{endpoint}` - Latency histogram

---

## Testing

### Unit Tests

```bash
pytest tests/unit/ -v
```

### Integration Tests (Sandbox)

```bash
export MOLAM_SANDBOX_KEY="sk_test_..."
pytest tests/integration/ -v
```

### Mock API with Prism

```bash
docker run --rm -p 4010:4010 stoplight/prism:4 mock -h 0.0.0.0 /molam-openapi.yaml
```

---

## Production Checklist

Before going live:

- [ ] Switch to production API key (`sk_live_...`)
- [ ] Change `base_url` to `https://api.molam.io`
- [ ] Enable SSL verification (`verify_ssl=True`)
- [ ] Configure proper timeouts
- [ ] Set up webhook endpoint with signature verification
- [ ] Enable structured logging
- [ ] Expose Prometheus metrics
- [ ] Configure circuit breaker thresholds
- [ ] Test error handling
- [ ] Set up monitoring/alerts
- [ ] Review security checklist in [SECURITY.md](../SECURITY.md)

---

## Support

- **Documentation**: https://docs.molam.io
- **API Reference**: https://api.molam.io/docs
- **GitHub**: https://github.com/molam/python-sdk
- **Email**: support@molam.io
- **Slack**: #molam-sdk

---

## Next Steps

1. **Read Full Documentation**: [README.md](../README.md)
2. **Review Security Guidelines**: [SECURITY.md](../SECURITY.md)
3. **Deployment Guide**: [RUNBOOK.md](../RUNBOOK.md)
4. **Try Examples**: [examples/](../examples/)

---

**Last Updated**: 2025-01-16
**SDK Version**: 0.1.0
