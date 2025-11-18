"""
Main Molam Client
"""

import hmac
import hashlib
import time
from typing import Callable, Optional, Dict, Any

from molam.http_client import HttpClient
from molam.resources.payments import Payments
from molam.resources.refunds import Refunds
from molam.resources.webhooks import Webhooks


class MolamClient:
    """Main Molam SDK client"""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout_ms: int = 8000,
        max_retries: int = 3
    ):
        """
        Initialize Molam client

        Args:
            base_url: Base URL for Molam API
            api_key: API secret key
            timeout_ms: Request timeout in milliseconds
            max_retries: Maximum number of retries for failed requests
        """
        if not base_url or not api_key:
            raise ValueError("base_url and api_key are required")

        self.http = HttpClient(
            base_url=base_url,
            api_key=api_key,
            timeout_ms=timeout_ms,
            max_retries=max_retries
        )

        self.payments = Payments(self.http)
        self.refunds = Refunds(self.http)
        self.webhooks = Webhooks(self.http)

    @staticmethod
    def verify_webhook(
        raw_body: bytes,
        signature_header: str,
        get_secret: Callable[[str], str]
    ) -> bool:
        """
        Verify webhook signature (HMAC-SHA256)

        Args:
            raw_body: Raw request body as bytes
            signature_header: Molam-Signature header value
            get_secret: Function to get secret by key ID

        Returns:
            True if signature is valid

        Raises:
            ValueError: If signature is invalid or expired
        """
        parts = dict(p.split("=", 1) for p in signature_header.split(","))

        timestamp_str = parts.get("t")
        signature = parts.get("v1")
        kid = parts.get("kid", "v1")

        if not timestamp_str or not signature:
            raise ValueError("Invalid signature header")

        timestamp = int(timestamp_str)
        now = int(time.time() * 1000)

        # Check timestamp (5-minute tolerance)
        if abs(now - timestamp) > 5 * 60 * 1000:
            raise ValueError("Signature timestamp outside tolerance")

        # Get secret
        secret = get_secret(kid)
        if not secret:
            raise ValueError(f"No secret found for kid: {kid}")

        # Compute HMAC
        payload = f"{timestamp_str}.{raw_body.decode('utf-8')}"
        computed = hmac.new(
            secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()

        # Constant-time comparison
        if not hmac.compare_digest(computed, signature):
            raise ValueError("Signature mismatch")

        return True
