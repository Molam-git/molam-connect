"""
End-to-End Integration Tests

Tests complete payment flow against Molam sandbox environment.
Requires MOLAM_SANDBOX_KEY environment variable.
"""

import pytest
from molam_sdk.models import PaymentIntentCreate


class TestPaymentFlow:
    """Test complete payment intent creation and confirmation flow"""

    def test_create_payment_intent(self, sandbox_client, unique_idempotency_key):
        """Test creating a payment intent in sandbox"""
        payload = PaymentIntentCreate(
            amount=100.50,
            currency="USD",
            description="E2E Test Payment",
            return_url="https://merchant.test/return",
            cancel_url="https://merchant.test/cancel",
            metadata={"test": "e2e", "env": "sandbox"},
        )

        payment_intent = sandbox_client.create_payment_intent(
            payload, idempotency_key=unique_idempotency_key
        )

        assert payment_intent is not None
        assert payment_intent.id is not None
        assert payment_intent.amount == 100.50
        assert payment_intent.currency == "USD"
        assert payment_intent.status in ["requires_confirmation", "succeeded"]

    def test_create_and_retrieve_payment_intent(
        self, sandbox_client, unique_idempotency_key
    ):
        """Test creating and then retrieving a payment intent"""
        # Create
        payload = PaymentIntentCreate(
            amount=50.00,
            currency="EUR",
            description="E2E Test - Retrieve",
        )

        created = sandbox_client.create_payment_intent(
            payload, idempotency_key=unique_idempotency_key
        )

        assert created.id is not None

        # Retrieve
        retrieved = sandbox_client.retrieve_payment_intent(created.id)

        assert retrieved.id == created.id
        assert retrieved.amount == 50.00
        assert retrieved.currency == "EUR"

    def test_create_and_confirm_payment_intent(
        self, sandbox_client, unique_idempotency_key
    ):
        """Test complete payment flow: create -> confirm"""
        # Create payment intent
        payload = PaymentIntentCreate(
            amount=75.25,
            currency="GBP",
            description="E2E Test - Confirm",
            return_url="https://merchant.test/return",
        )

        payment_intent = sandbox_client.create_payment_intent(
            payload, idempotency_key=unique_idempotency_key
        )

        assert payment_intent.id is not None

        # Confirm payment intent
        confirm_key = f"confirm-{unique_idempotency_key}"
        confirmed = sandbox_client.confirm_payment_intent(
            payment_intent.id, idempotency_key=confirm_key
        )

        assert confirmed.id == payment_intent.id
        assert confirmed.status in ["succeeded", "requires_confirmation", "processing"]

    def test_idempotency_enforcement(self, sandbox_client, unique_idempotency_key):
        """Test that idempotency keys prevent duplicate operations"""
        payload = PaymentIntentCreate(
            amount=25.00,
            currency="USD",
            description="E2E Test - Idempotency",
        )

        # Create first payment
        first = sandbox_client.create_payment_intent(
            payload, idempotency_key=unique_idempotency_key
        )

        # Create again with same idempotency key - should return same payment
        second = sandbox_client.create_payment_intent(
            payload, idempotency_key=unique_idempotency_key
        )

        assert first.id == second.id


class TestSyncClientWithCircuitBreaker:
    """Test sync client with circuit breaker protection"""

    def test_sync_client_create_payment(
        self, sandbox_sync_client, unique_idempotency_key
    ):
        """Test sync client with circuit breaker"""
        payload = PaymentIntentCreate(
            amount=150.00,
            currency="USD",
            description="Sync Client Test",
        )

        payment_intent = sandbox_sync_client.create_payment_intent(
            payload, idempotency_key=unique_idempotency_key
        )

        assert payment_intent is not None
        assert payment_intent.id is not None
        assert payment_intent.amount == 150.00

    def test_sync_client_create_and_confirm(
        self, sandbox_sync_client, unique_idempotency_key
    ):
        """Test complete flow with sync client"""
        # Create
        payload = PaymentIntentCreate(
            amount=200.00, currency="EUR", description="Sync Client Confirm Test"
        )

        created = sandbox_sync_client.create_payment_intent(
            payload, idempotency_key=unique_idempotency_key
        )

        # Confirm
        confirmed = sandbox_sync_client.confirm_payment_intent(
            created.id, idempotency_key=f"confirm-{unique_idempotency_key}"
        )

        assert confirmed.id == created.id
