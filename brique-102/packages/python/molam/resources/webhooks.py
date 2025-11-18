"""
Webhooks resource
"""

import hmac
import hashlib
import time
from typing import Dict, Any, List


class Webhooks:
    """Webhooks API"""

    def __init__(self, http):
        self.http = http

    def verify_signature(
        self,
        raw_body: str,
        signature_header: str,
        secret: str
    ) -> bool:
        """
        Verify webhook signature

        Args:
            raw_body: Raw request body as string
            signature_header: Molam-Signature header value
            secret: Webhook secret

        Returns:
            True if signature is valid

        Raises:
            ValueError: If signature is invalid or expired
        """
        parts = dict(p.split("=", 1) for p in signature_header.split(","))

        timestamp_str = parts.get("t")
        signature = parts.get("v1")

        if not timestamp_str or not signature:
            raise ValueError("Invalid signature header format")

        timestamp = int(timestamp_str)
        now = int(time.time() * 1000)

        # Check timestamp (5-minute tolerance)
        if abs(now - timestamp) > 5 * 60 * 1000:
            raise ValueError("Signature timestamp outside tolerance")

        # Compute HMAC
        payload = f"{timestamp_str}.{raw_body}"
        computed = hmac.new(
            secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()

        # Constant-time comparison
        if not hmac.compare_digest(computed, signature):
            raise ValueError("Signature mismatch")

        return True

    def create_endpoint(
        self,
        tenant_type: str,
        tenant_id: str,
        url: str,
        events: List[str]
    ) -> Dict[str, Any]:
        """
        Create webhook endpoint

        Args:
            tenant_type: Tenant type
            tenant_id: Tenant ID
            url: Webhook URL
            events: List of event types to subscribe to

        Returns:
            Endpoint object
        """
        payload = {
            "tenant_type": tenant_type,
            "tenant_id": tenant_id,
            "url": url,
            "events": events
        }
        return self.http.post("/v1/webhooks/endpoints", payload)

    def list_endpoints(self, tenant_type: str, tenant_id: str) -> Dict[str, Any]:
        """
        List webhook endpoints

        Args:
            tenant_type: Tenant type
            tenant_id: Tenant ID

        Returns:
            List of endpoints
        """
        return self.http.get(
            f"/v1/webhooks/endpoints?tenant_type={tenant_type}&tenant_id={tenant_id}"
        )

    def delete_endpoint(self, endpoint_id: str) -> Dict[str, Any]:
        """
        Delete webhook endpoint

        Args:
            endpoint_id: Endpoint ID

        Returns:
            Deletion confirmation
        """
        return self.http.delete(f"/v1/webhooks/endpoints/{endpoint_id}")
