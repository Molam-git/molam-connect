"""
Synchronous Client Wrapper with Circuit Breaker

Wraps MolamClient with circuit breaker protection and metrics.
Use this in production to protect against cascading failures.
"""

import time
import logging
from typing import Optional, Dict, Any

from .client import MolamClient
from .models import (
    ClientConfig,
    PaymentIntentCreate,
    PaymentIntent,
    RefundCreate,
    Refund,
    PayoutCreate,
    Payout,
)
from .cb import create_circuit_breaker
from .metrics import metrics_request

logger = logging.getLogger("molam_sdk.sync_client")


class MolamSyncClient:
    """
    Production-ready synchronous client with circuit breaker protection.

    Features:
    - Circuit breaker to prevent cascading failures
    - Automatic metrics recording
    - Structured logging
    - All features from base MolamClient

    Example:
        >>> from molam_sdk import MolamSyncClient, ClientConfig, PaymentIntentCreate
        >>> config = ClientConfig(api_key="sk_test_123")
        >>> client = MolamSyncClient(config)
        >>> payment = client.create_payment_intent(
        ...     PaymentIntentCreate(amount=100, currency="USD"),
        ...     idempotency_key="payment_123"
        ... )
    """

    def __init__(
        self,
        config: ClientConfig,
        cb_name: str = "molam_api_cb",
        cb_fail_max: int = 5,
        cb_reset_timeout: int = 60,
    ):
        """
        Initialize sync client with circuit breaker.

        Args:
            config: Client configuration
            cb_name: Circuit breaker name for logging
            cb_fail_max: Max consecutive failures before opening circuit
            cb_reset_timeout: Seconds before attempting half-open state
        """
        self.client = MolamClient(config)
        self.cb = create_circuit_breaker(
            name=cb_name, fail_max=cb_fail_max, reset_timeout=cb_reset_timeout
        )

    def create_payment_intent(
        self,
        payload: PaymentIntentCreate,
        idempotency_key: Optional[str] = None,
    ) -> PaymentIntent:
        """
        Create a payment intent with circuit breaker protection.

        Args:
            payload: Payment intent creation data
            idempotency_key: Optional idempotency key

        Returns:
            PaymentIntent: Created payment intent

        Raises:
            CircuitBreakerError: If circuit is open
            APIError: If API returns error
        """
        start = time.time()
        endpoint = "create_payment_intent"

        try:
            result = self.cb.call(
                self.client.create_payment_intent, payload, idempotency_key
            )
            latency = time.time() - start
            metrics_request(endpoint, 200, latency)
            logger.info(
                "Payment intent created successfully",
                extra={"endpoint": endpoint, "latency": latency},
            )
            return result
        except Exception as e:
            latency = time.time() - start
            status_code = getattr(e, "status_code", 500)
            metrics_request(endpoint, status_code, latency)
            logger.exception("create_payment_intent failed", extra={"endpoint": endpoint})
            raise

    def retrieve_payment_intent(self, payment_intent_id: str) -> PaymentIntent:
        """
        Retrieve a payment intent by ID.

        Args:
            payment_intent_id: Payment intent ID

        Returns:
            PaymentIntent: Retrieved payment intent
        """
        start = time.time()
        endpoint = "retrieve_payment_intent"

        try:
            result = self.cb.call(
                self.client.retrieve_payment_intent, payment_intent_id
            )
            metrics_request(endpoint, 200, time.time() - start)
            return result
        except Exception as e:
            metrics_request(endpoint, getattr(e, "status_code", 500), time.time() - start)
            logger.exception("retrieve_payment_intent failed")
            raise

    def confirm_payment_intent(
        self,
        payment_intent_id: str,
        idempotency_key: Optional[str] = None,
    ) -> PaymentIntent:
        """
        Confirm a payment intent.

        Args:
            payment_intent_id: Payment intent ID
            idempotency_key: Optional idempotency key

        Returns:
            PaymentIntent: Confirmed payment intent
        """
        start = time.time()
        endpoint = "confirm_payment_intent"

        try:
            result = self.cb.call(
                self.client.confirm_payment_intent,
                payment_intent_id,
                idempotency_key,
            )
            metrics_request(endpoint, 200, time.time() - start)
            return result
        except Exception as e:
            metrics_request(endpoint, getattr(e, "status_code", 500), time.time() - start)
            logger.exception("confirm_payment_intent failed")
            raise

    def create_refund(
        self,
        payload: RefundCreate,
        idempotency_key: Optional[str] = None,
    ) -> Refund:
        """
        Create a refund with circuit breaker protection.

        Args:
            payload: Refund creation data
            idempotency_key: Optional idempotency key

        Returns:
            Refund: Created refund
        """
        start = time.time()
        endpoint = "create_refund"

        try:
            result = self.cb.call(self.client.create_refund, payload, idempotency_key)
            metrics_request(endpoint, 200, time.time() - start)
            return result
        except Exception as e:
            metrics_request(endpoint, getattr(e, "status_code", 500), time.time() - start)
            logger.exception("create_refund failed")
            raise

    def create_payout(
        self,
        payload: PayoutCreate,
        idempotency_key: Optional[str] = None,
    ) -> Payout:
        """
        Create a payout with circuit breaker protection.

        Args:
            payload: Payout creation data
            idempotency_key: Optional idempotency key

        Returns:
            Payout: Created payout
        """
        start = time.time()
        endpoint = "create_payout"

        try:
            result = self.cb.call(self.client.create_payout, payload, idempotency_key)
            metrics_request(endpoint, 200, time.time() - start)
            return result
        except Exception as e:
            metrics_request(endpoint, getattr(e, "status_code", 500), time.time() - start)
            logger.exception("create_payout failed")
            raise
