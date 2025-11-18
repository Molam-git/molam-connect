"""
Asynchronous Client for Molam SDK

Provides non-blocking API calls using aiohttp.
Ideal for async frameworks like FastAPI, aiohttp, or async scripts.
"""

import asyncio
import logging
import time
from typing import Optional, Dict, Any

try:
    import aiohttp
except ImportError:
    raise ImportError(
        "aiohttp is required for async client. Install with: pip install aiohttp"
    )

from .models import (
    ClientConfig,
    PaymentIntentCreate,
    PaymentIntent,
    RefundCreate,
    Refund,
)
from .metrics import metrics_request
from .exceptions import APIError, NetworkError, TimeoutError as MolamTimeoutError
from .__version__ import __version__

logger = logging.getLogger("molam_sdk.async")


class MolamAsyncClient:
    """
    Asynchronous Molam SDK Client

    Provides non-blocking API calls for async Python applications.
    Must be used with async/await syntax.

    Example:
        >>> import asyncio
        >>> from molam_sdk import MolamAsyncClient, ClientConfig, PaymentIntentCreate
        >>>
        >>> async def main():
        ...     config = ClientConfig(api_key="sk_test_123")
        ...     client = MolamAsyncClient(config)
        ...     try:
        ...         payment = await client.create_payment_intent(
        ...             PaymentIntentCreate(amount=100, currency="USD"),
        ...             idempotency_key="payment_123"
        ...         )
        ...         print(payment.id)
        ...     finally:
        ...         await client.close()
        >>>
        >>> asyncio.run(main())

    Context Manager:
        >>> async with MolamAsyncClient(config) as client:
        ...     payment = await client.create_payment_intent(...)
    """

    def __init__(self, config: ClientConfig):
        """
        Initialize async client.

        Args:
            config: Client configuration
        """
        self.config = config
        self.base_url = config.base_url.rstrip("/")
        self._session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        """Context manager entry"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - closes session"""
        await self.close()

    async def _get_session(self) -> aiohttp.ClientSession:
        """
        Get or create aiohttp session with proper configuration.

        Returns:
            aiohttp.ClientSession: Configured session
        """
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(
                sock_connect=self.config.timeout_connect,
                sock_read=self.config.timeout_read,
            )
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    async def close(self) -> None:
        """Close the aiohttp session"""
        if self._session and not self._session.closed:
            await self._session.close()
            # Give time for connections to close
            await asyncio.sleep(0.25)

    async def _request(
        self,
        method: str,
        path: str,
        json_data: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Make an async HTTP request.

        Args:
            method: HTTP method (GET, POST, etc.)
            path: API path
            json_data: Optional JSON payload
            idempotency_key: Optional idempotency key

        Returns:
            Dict[str, Any]: Response JSON

        Raises:
            APIError: If API returns error
            NetworkError: If network error occurs
            MolamTimeoutError: If request times out
        """
        session = await self._get_session()

        headers = {
            "Accept": "application/json",
            "User-Agent": f"molam-python-sdk-async/{__version__}",
        }

        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"

        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        url = f"{self.base_url}{path}"
        start = time.time()

        try:
            async with session.request(
                method, url, json=json_data, headers=headers
            ) as resp:
                latency = time.time() - start
                status = resp.status
                body = await resp.json()

                if status >= 400:
                    error_message = (
                        body.get("error", {}).get("message", "Unknown error")
                        if isinstance(body, dict)
                        else str(body)
                    )
                    logger.error(
                        "Async request failed: %s %s", status, error_message
                    )
                    raise APIError(
                        status_code=status,
                        message=error_message,
                        body=body,
                        request_id=resp.headers.get("X-Request-ID"),
                    )

                return body

        except asyncio.TimeoutError as e:
            latency = time.time() - start
            logger.exception("Request timeout")
            raise MolamTimeoutError(f"Request timeout after {latency:.2f}s") from e

        except aiohttp.ClientError as e:
            latency = time.time() - start
            logger.exception("Network error")
            raise NetworkError(f"Network error: {e}") from e

    async def create_payment_intent(
        self,
        payload: PaymentIntentCreate,
        idempotency_key: Optional[str] = None,
    ) -> PaymentIntent:
        """
        Create a payment intent asynchronously.

        Args:
            payload: Payment intent creation data
            idempotency_key: Optional idempotency key

        Returns:
            PaymentIntent: Created payment intent
        """
        endpoint = "create_payment_intent"
        start = time.time()

        try:
            data = payload.model_dump(exclude_none=True)
            result = await self._request(
                "POST",
                "/v1/connect/payment_intents",
                json_data=data,
                idempotency_key=idempotency_key,
            )
            metrics_request(endpoint, 200, time.time() - start)
            return PaymentIntent(**result)
        except Exception as e:
            metrics_request(endpoint, getattr(e, "status_code", 500), time.time() - start)
            raise

    async def retrieve_payment_intent(self, payment_intent_id: str) -> PaymentIntent:
        """
        Retrieve a payment intent by ID.

        Args:
            payment_intent_id: Payment intent ID

        Returns:
            PaymentIntent: Retrieved payment intent
        """
        endpoint = "retrieve_payment_intent"
        start = time.time()

        try:
            result = await self._request(
                "GET", f"/v1/connect/payment_intents/{payment_intent_id}"
            )
            metrics_request(endpoint, 200, time.time() - start)
            return PaymentIntent(**result)
        except Exception as e:
            metrics_request(endpoint, getattr(e, "status_code", 500), time.time() - start)
            raise

    async def confirm_payment_intent(
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
        endpoint = "confirm_payment_intent"
        start = time.time()

        try:
            result = await self._request(
                "POST",
                f"/v1/connect/payment_intents/{payment_intent_id}/confirm",
                idempotency_key=idempotency_key,
            )
            metrics_request(endpoint, 200, time.time() - start)
            return PaymentIntent(**result)
        except Exception as e:
            metrics_request(endpoint, getattr(e, "status_code", 500), time.time() - start)
            raise

    async def create_refund(
        self,
        payload: RefundCreate,
        idempotency_key: Optional[str] = None,
    ) -> Refund:
        """
        Create a refund asynchronously.

        Args:
            payload: Refund creation data
            idempotency_key: Optional idempotency key

        Returns:
            Refund: Created refund
        """
        endpoint = "create_refund"
        start = time.time()

        try:
            data = payload.model_dump(exclude_none=True)
            result = await self._request(
                "POST",
                "/v1/connect/refunds",
                json_data=data,
                idempotency_key=idempotency_key,
            )
            metrics_request(endpoint, 200, time.time() - start)
            return Refund(**result)
        except Exception as e:
            metrics_request(endpoint, getattr(e, "status_code", 500), time.time() - start)
            raise
