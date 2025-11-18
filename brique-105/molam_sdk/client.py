"""
Synchronous Molam API client.
"""

from typing import Optional, Dict, Any
import json
import logging

from .config import Config
from .http.adapter import HTTPAdapter
from .http.requests_adapter import RequestsAdapter
from .exceptions import ApiError
from .utils.idempotency import make_idempotency_key

logger = logging.getLogger("molam.sdk")


class MolamClient:
    """
    Synchronous Molam API client.

    Provides methods for interacting with Molam Connect, Ma, and Treasury APIs.

    Features:
    - Automatic idempotency key generation
    - Comprehensive error handling
    - Request/response logging
    - Pluggable HTTP adapter

    Examples:
        >>> config = Config(api_key="sk_test_...")
        >>> client = MolamClient(config)
        >>> payment = client.create_payment_intent(
        ...     amount=2500,
        ...     currency="USD",
        ...     customer_id="cust_123"
        ... )
    """

    def __init__(
        self,
        config: Config,
        http_adapter: Optional[HTTPAdapter] = None,
    ):
        """
        Initialize Molam client.

        Args:
            config: SDK configuration
            http_adapter: Optional custom HTTP adapter
        """
        self.config = config
        self.http = http_adapter or RequestsAdapter(max_retries=config.max_retries)

    def _headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """
        Build request headers.

        Args:
            extra: Optional extra headers

        Returns:
            Dictionary of headers
        """
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Molam-Python-SDK/0.1.0",
        }
        if extra:
            headers.update(extra)
        return headers

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Any] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Make HTTP request to Molam API.

        Args:
            method: HTTP method
            path: API path
            body: Optional request body
            idempotency_key: Optional idempotency key

        Returns:
            Response data

        Raises:
            ApiError: On API errors
        """
        url = self.config.api_base + "/" + path.lstrip("/")
        headers = self._headers()

        if idempotency_key:
            headers["Idempotency-Key"] = make_idempotency_key(idempotency_key)

        logger.debug("Request %s %s", method, url)

        status, text, resp_headers = self.http.send(
            method=method,
            url=url,
            headers=headers,
            json=body,
            timeout=self.config.timeout,
        )

        logger.debug("Response %d %s", status, text[:1000] if text else "")

        # Handle errors
        if not (200 <= status < 300):
            try:
                payload = json.loads(text) if text else {}
            except Exception:
                payload = {"body": text}

            request_id = resp_headers.get("X-Request-Id")
            raise ApiError(
                f"API returned {status}",
                status_code=status,
                payload=payload,
                request_id=request_id,
            )

        # Parse response
        try:
            return json.loads(text) if text else {}
        except Exception:
            return {}

    # ========================================================================
    # Payment Intents
    # ========================================================================

    def create_payment_intent(
        self,
        amount: int,
        currency: Optional[str] = None,
        customer_id: Optional[str] = None,
        merchant_id: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict] = None,
        capture: bool = False,
        return_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a payment intent.

        Args:
            amount: Amount in smallest currency unit (e.g., cents)
            currency: Currency code (default: from config)
            customer_id: Customer ID
            merchant_id: Merchant ID
            description: Payment description
            metadata: Additional metadata
            capture: Auto-capture flag
            return_url: Return URL after payment
            cancel_url: Cancel URL
            idempotency_key: Optional idempotency key

        Returns:
            Payment intent object

        Examples:
            >>> payment = client.create_payment_intent(
            ...     amount=2500,
            ...     currency="USD",
            ...     description="Order #12345"
            ... )
        """
        payload = {
            "amount": amount,
            "currency": currency or self.config.default_currency,
            "locale": self.config.default_locale,
            "capture": capture,
        }

        if customer_id:
            payload["customer_id"] = customer_id
        if merchant_id:
            payload["merchant_id"] = merchant_id
        if description:
            payload["description"] = description
        if metadata:
            payload["metadata"] = metadata
        if return_url:
            payload["return_url"] = return_url
        if cancel_url:
            payload["cancel_url"] = cancel_url

        return self._request("POST", "/v1/connect/payment_intents", payload, idempotency_key)

    def retrieve_payment_intent(self, payment_intent_id: str) -> Dict[str, Any]:
        """
        Retrieve a payment intent.

        Args:
            payment_intent_id: Payment intent ID

        Returns:
            Payment intent object
        """
        return self._request("GET", f"/v1/connect/payment_intents/{payment_intent_id}")

    def confirm_payment_intent(
        self,
        payment_intent_id: str,
        payment_method: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Confirm a payment intent.

        Args:
            payment_intent_id: Payment intent ID
            payment_method: Optional payment method ID
            idempotency_key: Optional idempotency key

        Returns:
            Confirmed payment intent object
        """
        payload = {}
        if payment_method:
            payload["payment_method"] = payment_method

        return self._request(
            "POST",
            f"/v1/connect/payment_intents/{payment_intent_id}/confirm",
            payload,
            idempotency_key,
        )

    def cancel_payment_intent(
        self,
        payment_intent_id: str,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Cancel a payment intent.

        Args:
            payment_intent_id: Payment intent ID
            idempotency_key: Optional idempotency key

        Returns:
            Canceled payment intent object
        """
        return self._request(
            "POST",
            f"/v1/connect/payment_intents/{payment_intent_id}/cancel",
            None,
            idempotency_key,
        )

    def list_payment_intents(
        self,
        limit: int = 10,
        offset: int = 0,
        customer_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List payment intents.

        Args:
            limit: Maximum number of results
            offset: Number of results to skip
            customer_id: Filter by customer ID
            status: Filter by status

        Returns:
            List of payment intents
        """
        params = {"limit": limit, "offset": offset}
        if customer_id:
            params["customer_id"] = customer_id
        if status:
            params["status"] = status

        query = "&".join(f"{k}={v}" for k, v in params.items())
        return self._request("GET", f"/v1/connect/payment_intents?{query}")

    # ========================================================================
    # Refunds
    # ========================================================================

    def create_refund(
        self,
        charge_id: str,
        amount: Optional[int] = None,
        reason: Optional[str] = None,
        metadata: Optional[Dict] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a refund.

        Args:
            charge_id: Charge ID to refund
            amount: Refund amount (default: full refund)
            reason: Refund reason
            metadata: Additional metadata
            idempotency_key: Optional idempotency key

        Returns:
            Refund object
        """
        payload = {}
        if amount is not None:
            payload["amount"] = amount
        if reason:
            payload["reason"] = reason
        if metadata:
            payload["metadata"] = metadata

        return self._request(
            "POST",
            f"/v1/connect/charges/{charge_id}/refund",
            payload,
            idempotency_key,
        )

    def retrieve_refund(self, refund_id: str) -> Dict[str, Any]:
        """
        Retrieve a refund.

        Args:
            refund_id: Refund ID

        Returns:
            Refund object
        """
        return self._request("GET", f"/v1/connect/refunds/{refund_id}")

    # ========================================================================
    # Payouts (Treasury)
    # ========================================================================

    def create_payout(
        self,
        origin_module: str,
        origin_entity_id: str,
        amount: float,
        currency: str,
        beneficiary: Dict,
        metadata: Optional[Dict] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a payout (Treasury API).

        Args:
            origin_module: Origin module (e.g., "connect", "ma")
            origin_entity_id: Origin entity ID
            amount: Payout amount
            currency: Currency code
            beneficiary: Beneficiary information
            metadata: Additional metadata
            idempotency_key: Optional idempotency key

        Returns:
            Payout object
        """
        payload = {
            "origin_module": origin_module,
            "origin_entity_id": origin_entity_id,
            "amount": amount,
            "currency": currency,
            "beneficiary": beneficiary,
        }
        if metadata:
            payload["metadata"] = metadata

        return self._request("POST", "/v1/treasury/payouts", payload, idempotency_key)

    def retrieve_payout(self, payout_id: str) -> Dict[str, Any]:
        """
        Retrieve a payout.

        Args:
            payout_id: Payout ID

        Returns:
            Payout object
        """
        return self._request("GET", f"/v1/treasury/payouts/{payout_id}")

    # ========================================================================
    # Webhooks
    # ========================================================================

    def verify_webhook_signature(
        self,
        signature_header: str,
        raw_body: bytes,
    ) -> bool:
        """
        Verify webhook signature.

        Args:
            signature_header: Molam-Signature header value
            raw_body: Raw request body

        Returns:
            True if signature is valid

        Raises:
            SignatureError: If verification fails

        Examples:
            >>> header = request.headers.get("Molam-Signature")
            >>> body = request.get_data()
            >>> if client.verify_webhook_signature(header, body):
            ...     # Process webhook
            ...     pass
        """
        from .utils.webhook import verify_signature

        def get_secret(kid: str) -> Optional[str]:
            # In production, fetch from Vault/database
            return self.config.webhook_secret

        return verify_signature(signature_header, raw_body, get_secret)
