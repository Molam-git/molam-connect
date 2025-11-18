"""
Unit tests for MolamClient
"""

import pytest
from pydantic import ValidationError
from requests_mock import Mocker
from molam_sdk import MolamClient, ClientConfig, PaymentIntentCreate, RefundCreate
from molam_sdk.exceptions import APIError, ConfigurationError


@pytest.fixture
def client():
    """Create test client"""
    config = ClientConfig(
        api_key="sk_test_123",
        base_url="https://sandbox.api.molam.io",
        max_retries=0,  # Disable retries for tests
    )
    return MolamClient(config)


def test_client_initialization():
    """Test client initialization"""
    config = ClientConfig(api_key="sk_test_123")
    client = MolamClient(config)

    assert client.config.api_key == "sk_test_123"
    assert client.base_url == "https://api.molam.io"
    assert "Authorization" in client.headers


def test_client_initialization_without_api_key():
    """Test client initialization without API key"""
    config = ClientConfig(base_url="https://api.molam.io")
    client = MolamClient(config)

    # Should initialize but warn
    assert client.config.api_key is None


def test_client_initialization_invalid_config():
    """Test client initialization with invalid configuration"""
    with pytest.raises(ConfigurationError):
        config = ClientConfig(
            api_key="sk_test_123",
            base_url="",  # Empty base URL
        )
        MolamClient(config)


def test_create_payment_intent_success(client):
    """Test successful payment intent creation"""
    with Mocker() as m:
        m.post(
            "https://sandbox.api.molam.io/v1/connect/payment_intents",
            json={
                "id": "pi_123",
                "status": "requires_confirmation",
                "amount": 100.50,
                "currency": "USD",
                "capture": False,
                "created_at": "2025-01-15T00:00:00Z",
            },
            status_code=200,
        )

        payment_intent = client.create_payment_intent(
            PaymentIntentCreate(amount=100.50, currency="USD"), idempotency_key="test-123"
        )

        assert payment_intent.id == "pi_123"
        assert payment_intent.amount == 100.50
        assert payment_intent.currency == "USD"
        assert payment_intent.status == "requires_confirmation"


def test_create_payment_intent_validation_error(client):
    """Test payment intent creation with validation error (Pydantic)"""
    # Pydantic should catch negative amount before API call
    with pytest.raises(ValidationError) as exc_info:
        PaymentIntentCreate(amount=-10, currency="USD")

    assert "Amount must be positive" in str(exc_info.value)


def test_create_payment_intent_api_error(client):
    """Test payment intent creation with API error"""
    with Mocker() as m:
        m.post(
            "https://sandbox.api.molam.io/v1/connect/payment_intents",
            json={
                "error": {
                    "code": "insufficient_funds",
                    "message": "Merchant account has insufficient funds",
                }
            },
            status_code=400,
        )

        with pytest.raises(APIError) as exc_info:
            client.create_payment_intent(PaymentIntentCreate(amount=100.50, currency="USD"))

        assert exc_info.value.status_code == 400
        assert exc_info.value.body["error"]["code"] == "insufficient_funds"


def test_retrieve_payment_intent_success(client):
    """Test successful payment intent retrieval"""
    with Mocker() as m:
        m.get(
            "https://sandbox.api.molam.io/v1/connect/payment_intents/pi_123",
            json={
                "id": "pi_123",
                "status": "succeeded",
                "amount": 100.50,
                "currency": "USD",
                "created_at": "2025-01-15T00:00:00Z",
            },
            status_code=200,
        )

        payment_intent = client.retrieve_payment_intent("pi_123")

        assert payment_intent.id == "pi_123"
        assert payment_intent.status == "succeeded"


def test_confirm_payment_intent_success(client):
    """Test successful payment intent confirmation"""
    with Mocker() as m:
        m.post(
            "https://sandbox.api.molam.io/v1/connect/payment_intents/pi_123/confirm",
            json={
                "id": "pi_123",
                "status": "succeeded",
                "amount": 100.50,
                "currency": "USD",
                "created_at": "2025-01-15T00:00:00Z",
            },
            status_code=200,
        )

        confirmed = client.confirm_payment_intent("pi_123")

        assert confirmed.id == "pi_123"
        assert confirmed.status == "succeeded"


def test_create_refund_success(client):
    """Test successful refund creation"""
    with Mocker() as m:
        m.post(
            "https://sandbox.api.molam.io/v1/connect/refunds",
            json={
                "id": "re_123",
                "payment_id": "pi_123",
                "amount": 100.50,
                "currency": "USD",
                "status": "pending",
                "created_at": "2025-01-15T00:00:00Z",
            },
            status_code=200,
        )

        refund = client.create_refund(
            RefundCreate(payment_id="pi_123"), idempotency_key="refund-123"
        )

        assert refund.id == "re_123"
        assert refund.payment_id == "pi_123"
        assert refund.status == "pending"


def test_idempotency_key_in_request(client):
    """Test that idempotency key is included in request"""
    with Mocker() as m:
        m.post(
            "https://sandbox.api.molam.io/v1/connect/payment_intents",
            json={
                "id": "pi_123",
                "status": "requires_confirmation",
                "amount": 100.50,
                "currency": "USD",
                "created_at": "2025-01-15T00:00:00Z",
            },
            status_code=200,
        )

        client.create_payment_intent(
            PaymentIntentCreate(amount=100.50, currency="USD"), idempotency_key="my-custom-key"
        )

        # Check that idempotency key was sent
        last_request = m.last_request
        assert last_request.headers["Idempotency-Key"] == "my-custom-key"


def test_api_key_update(client):
    """Test API key update"""
    assert client.headers["Authorization"] == "Bearer sk_test_123"

    client.set_api_key("sk_test_456")

    assert client.config.api_key == "sk_test_456"
    assert client.headers["Authorization"] == "Bearer sk_test_456"


def test_region_update(client):
    """Test region update"""
    assert client.base_url == "https://sandbox.api.molam.io"

    client.set_region("eu-west")

    assert client.base_url == "https://api-eu-west.molam.io"
