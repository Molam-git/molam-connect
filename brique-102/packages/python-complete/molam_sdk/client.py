"""
Molam SDK Main Client
"""

import os
import json
import uuid
import logging
from typing import Optional, Dict, Any
import requests
from requests.exceptions import RequestException, Timeout

from molam_sdk.models import (
    ClientConfig,
    PaymentIntentCreate,
    PaymentIntent,
    RefundCreate,
    Refund,
    PayoutCreate,
    Payout,
    MerchantOnboardingCreate,
    MerchantOnboarding,
)
from molam_sdk.utils import requests_session_with_retries, setup_logging, sanitize_for_logging
from molam_sdk.exceptions import (
    APIError,
    IdempotencyError,
    ConfigurationError,
    NetworkError,
    TimeoutError as MolamTimeoutError,
)
from molam_sdk.__version__ import __version__

logger = logging.getLogger("molam_sdk.client")


class MolamClient:
    """
    Main Molam SDK Client

    Provides industrial-grade integration with Molam Form / Connect / Ma APIs.

    Features:
    - Automatic retries with exponential backoff
    - mTLS support for sensitive endpoints
    - Idempotency key handling
    - Multi-region support
    - Structured logging
    - Comprehensive error handling

    Example:
        >>> from molam_sdk import MolamClient, ClientConfig, PaymentIntentCreate
        >>> config = ClientConfig(api_key=os.getenv("MOLAM_API_KEY"))
        >>> client = MolamClient(config)
        >>> intent = client.create_payment_intent(
        ...     PaymentIntentCreate(amount=100.50, currency="USD"),
        ...     idempotency_key="order-12345"
        ... )
    """

    def __init__(self, config: ClientConfig):
        """
        Initialize Molam client

        Args:
            config: Client configuration

        Raises:
            ConfigurationError: If configuration is invalid
        """
        self.config = config

        # Setup logging
        if config.debug:
            setup_logging(debug=True)

        # Validate configuration
        self._validate_config()

        # Create HTTP session with retries
        self.session = requests_session_with_retries(
            total=config.max_retries, backoff_factor=config.retry_backoff_factor
        )

        # Configure mTLS if provided
        if config.mtls_cert and config.mtls_key:
            if not os.path.exists(config.mtls_cert):
                raise ConfigurationError(f"mTLS cert file not found: {config.mtls_cert}")
            if not os.path.exists(config.mtls_key):
                raise ConfigurationError(f"mTLS key file not found: {config.mtls_key}")

            self.session.cert = (config.mtls_cert, config.mtls_key)
            logger.info("mTLS configured with client certificate")

        # Set SSL verification
        self.session.verify = config.verify_ssl

        # Build base URL
        self.base_url = config.base_url.rstrip("/")

        # Setup default headers
        self.headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": f"molam-python-sdk/{__version__}",
        }

        # Add authorization if API key provided
        if config.api_key:
            self.headers["Authorization"] = f"Bearer {config.api_key}"

        logger.info(f"Molam SDK initialized (version {__version__})")
        logger.debug(f"Base URL: {self.base_url}")

    def _validate_config(self) -> None:
        """Validate client configuration"""
        if not self.config.api_key:
            logger.warning("No API key provided - client will not be able to authenticate")

        if not self.config.base_url:
            raise ConfigurationError("base_url is required")

        if self.config.timeout_connect <= 0:
            raise ConfigurationError("timeout_connect must be positive")

        if self.config.timeout_read <= 0:
            raise ConfigurationError("timeout_read must be positive")

    def _url(self, path: str) -> str:
        """Build full URL from path"""
        return f"{self.base_url}{path}"

    def _handle_response(self, response: requests.Response) -> Dict[str, Any]:
        """
        Handle API response

        Args:
            response: HTTP response

        Returns:
            Parsed response body

        Raises:
            APIError: If API returns error
        """
        request_id = response.headers.get("X-Molam-Request-Id")

        # Try to parse JSON body
        try:
            body = response.json()
        except ValueError:
            body = {"raw": response.text}

        # Log response
        if logger.isEnabledFor(logging.DEBUG):
            safe_body = sanitize_for_logging(body)
            logger.debug(f"Response ({response.status_code}): {safe_body}")

        # Handle errors
        if response.status_code >= 400:
            error_message = (
                body.get("error", {}).get("message") or body.get("message") or "Unknown error"
            )
            raise APIError(
                status_code=response.status_code,
                message=error_message,
                body=body,
                request_id=request_id,
            )

        return body

    def get(
        self, path: str, params: Optional[Dict[str, Any]] = None, timeout: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Make GET request

        Args:
            path: API endpoint path
            params: Query parameters
            timeout: Request timeout override

        Returns:
            Response body

        Raises:
            APIError: If API returns error
            NetworkError: If network error occurs
            TimeoutError: If request times out
        """
        url = self._url(path)
        timeout_tuple = (self.config.timeout_connect, timeout or self.config.timeout_read)

        logger.debug(f"GET {url}")

        try:
            response = self.session.get(
                url, headers=self.headers, params=params, timeout=timeout_tuple
            )
            return self._handle_response(response)
        except Timeout as e:
            logger.error(f"Request timeout: {e}")
            raise MolamTimeoutError(f"Request timed out: {e}")
        except RequestException as e:
            logger.error(f"Network error: {e}")
            raise NetworkError(f"Network error: {e}")

    def post(
        self,
        path: str,
        data: Dict[str, Any],
        idempotency_key: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Make POST request with idempotency support

        Args:
            path: API endpoint path
            data: Request body
            idempotency_key: Idempotency key for safe retries
            timeout: Request timeout override

        Returns:
            Response body

        Raises:
            APIError: If API returns error
            NetworkError: If network error occurs
            TimeoutError: If request times out
        """
        url = self._url(path)
        headers = self.headers.copy()

        # Add idempotency key
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        timeout_tuple = (self.config.timeout_connect, timeout or self.config.timeout_read)

        if logger.isEnabledFor(logging.DEBUG):
            safe_data = sanitize_for_logging(data)
            logger.debug(f"POST {url}: {safe_data}")

        try:
            response = self.session.post(url, headers=headers, json=data, timeout=timeout_tuple)
            return self._handle_response(response)
        except Timeout as e:
            logger.error(f"Request timeout: {e}")
            raise MolamTimeoutError(f"Request timed out: {e}")
        except RequestException as e:
            logger.error(f"Network error: {e}")
            raise NetworkError(f"Network error: {e}")

    # ===================================================================
    # Payment Intents API
    # ===================================================================

    def create_payment_intent(
        self, payload: PaymentIntentCreate, idempotency_key: Optional[str] = None
    ) -> PaymentIntent:
        """
        Create a payment intent

        Args:
            payload: Payment intent data
            idempotency_key: Optional idempotency key (auto-generated if not provided)

        Returns:
            Created payment intent

        Example:
            >>> intent = client.create_payment_intent(
            ...     PaymentIntentCreate(amount=100.50, currency="USD"),
            ...     idempotency_key="order-12345"
            ... )
        """
        if idempotency_key is None:
            idempotency_key = f"pi-{uuid.uuid4().hex}"
            logger.warning(
                "No idempotency_key provided; using auto-generated key. "
                "Provide explicit idempotency_key for production."
            )

        data = payload.model_dump(exclude_none=True)
        body = self.post("/v1/connect/payment_intents", data, idempotency_key=idempotency_key)

        return PaymentIntent(**body)

    def retrieve_payment_intent(self, intent_id: str) -> PaymentIntent:
        """
        Retrieve a payment intent

        Args:
            intent_id: Payment intent ID

        Returns:
            Payment intent
        """
        body = self.get(f"/v1/connect/payment_intents/{intent_id}")
        return PaymentIntent(**body)

    def confirm_payment_intent(
        self, intent_id: str, idempotency_key: Optional[str] = None
    ) -> PaymentIntent:
        """
        Confirm a payment intent

        Args:
            intent_id: Payment intent ID
            idempotency_key: Optional idempotency key

        Returns:
            Updated payment intent
        """
        if idempotency_key is None:
            idempotency_key = f"confirm-{intent_id}-{uuid.uuid4().hex[:8]}"

        body = self.post(
            f"/v1/connect/payment_intents/{intent_id}/confirm", {}, idempotency_key=idempotency_key
        )
        return PaymentIntent(**body)

    def cancel_payment_intent(
        self, intent_id: str, idempotency_key: Optional[str] = None
    ) -> PaymentIntent:
        """
        Cancel a payment intent

        Args:
            intent_id: Payment intent ID
            idempotency_key: Optional idempotency key

        Returns:
            Canceled payment intent
        """
        if idempotency_key is None:
            idempotency_key = f"cancel-{intent_id}-{uuid.uuid4().hex[:8]}"

        body = self.post(
            f"/v1/connect/payment_intents/{intent_id}/cancel", {}, idempotency_key=idempotency_key
        )
        return PaymentIntent(**body)

    # ===================================================================
    # Refunds API
    # ===================================================================

    def create_refund(self, payload: RefundCreate, idempotency_key: Optional[str] = None) -> Refund:
        """
        Create a refund

        Args:
            payload: Refund data
            idempotency_key: Optional idempotency key

        Returns:
            Created refund
        """
        if idempotency_key is None:
            idempotency_key = f"refund-{uuid.uuid4().hex}"
            logger.warning("Auto-generated idempotency key for refund")

        data = payload.model_dump(exclude_none=True)
        body = self.post("/v1/connect/refunds", data, idempotency_key=idempotency_key)

        return Refund(**body)

    def retrieve_refund(self, refund_id: str) -> Refund:
        """
        Retrieve a refund

        Args:
            refund_id: Refund ID

        Returns:
            Refund
        """
        body = self.get(f"/v1/connect/refunds/{refund_id}")
        return Refund(**body)

    # ===================================================================
    # Payouts API
    # ===================================================================

    def create_payout(self, payload: PayoutCreate, idempotency_key: Optional[str] = None) -> Payout:
        """
        Create a payout

        Args:
            payload: Payout data
            idempotency_key: Optional idempotency key

        Returns:
            Created payout
        """
        if idempotency_key is None:
            idempotency_key = f"payout-{uuid.uuid4().hex}"

        data = payload.model_dump(exclude_none=True)
        body = self.post("/v1/connect/payouts", data, idempotency_key=idempotency_key)

        return Payout(**body)

    def retrieve_payout(self, payout_id: str) -> Payout:
        """
        Retrieve a payout

        Args:
            payout_id: Payout ID

        Returns:
            Payout
        """
        body = self.get(f"/v1/connect/payouts/{payout_id}")
        return Payout(**body)

    # ===================================================================
    # Merchant Onboarding API
    # ===================================================================

    def create_merchant_onboarding(
        self, payload: MerchantOnboardingCreate, idempotency_key: Optional[str] = None
    ) -> MerchantOnboarding:
        """
        Create merchant onboarding session

        Args:
            payload: Merchant data
            idempotency_key: Optional idempotency key

        Returns:
            Merchant onboarding session
        """
        if idempotency_key is None:
            idempotency_key = f"onboard-{uuid.uuid4().hex}"

        data = payload.model_dump(exclude_none=True)
        body = self.post("/v1/connect/merchants/onboard", data, idempotency_key=idempotency_key)

        return MerchantOnboarding(**body)

    # ===================================================================
    # Webhook Helpers
    # ===================================================================

    @staticmethod
    def verify_webhook_signature(header: str, payload: bytes, get_secret_by_kid: callable) -> bool:
        """
        Verify webhook signature

        Args:
            header: Molam-Signature header value
            payload: Raw request body as bytes
            get_secret_by_kid: Function to get webhook secret by key ID

        Returns:
            True if signature is valid

        Raises:
            WebhookVerificationError: If signature is invalid

        Example:
            >>> def get_secret(kid):
            ...     return os.environ.get(f"WEBHOOK_SECRET_{kid}")
            >>> MolamClient.verify_webhook_signature(
            ...     request.headers["Molam-Signature"],
            ...     request.get_data(),
            ...     get_secret
            ... )
        """
        from molam_sdk.webhooks import verify_molam_signature

        return verify_molam_signature(header, payload, get_secret_by_kid)

    # ===================================================================
    # Configuration Management
    # ===================================================================

    def set_api_key(self, key: str) -> None:
        """
        Update API key at runtime

        Args:
            key: New API key
        """
        self.config.api_key = key
        self.headers["Authorization"] = f"Bearer {key}"
        logger.info("API key updated")

    def set_region(self, region: str) -> None:
        """
        Update region endpoint

        Args:
            region: Region code (e.g., 'us-east', 'eu-west')
        """
        self.config.region = region
        # Update base URL based on region
        region_urls = {
            "us-east": "https://api-us-east.molam.io",
            "eu-west": "https://api-eu-west.molam.io",
            "ap-south": "https://api-ap-south.molam.io",
        }
        if region in region_urls:
            self.base_url = region_urls[region]
            logger.info(f"Region updated to {region}: {self.base_url}")
        else:
            logger.warning(f"Unknown region: {region}")
