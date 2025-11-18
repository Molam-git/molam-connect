"""
SDK Adoption Metrics and Telemetry

Tracks SDK usage for monitoring adoption, identifying issues, and improving DX.
Data sent to Molam telemetry API for Ops dashboard and Sira analysis.

Privacy: Only technical metadata is collected (no PII, no payment data).
"""

import time
import platform
import os
import logging
from typing import Optional, Dict, Any
import requests

from molam_sdk.__version__ import __version__

logger = logging.getLogger(__name__)

# Telemetry configuration
TELEMETRY_ENABLED = os.getenv("MOLAM_TELEMETRY_ENABLED", "true").lower() == "true"
TELEMETRY_URL = os.getenv(
    "MOLAM_TELEMETRY_URL", "https://telemetry.molam.io/v1/events"
)


class TelemetryClient:
    """
    Client for sending SDK usage telemetry to Molam.

    Collects anonymous usage data to help improve the SDK.
    Can be disabled by setting MOLAM_TELEMETRY_ENABLED=false.
    """

    def __init__(self):
        self.enabled = TELEMETRY_ENABLED
        self.url = TELEMETRY_URL
        self.merchant_id = os.getenv("MOLAM_MERCHANT_ID", "unknown")

    def record_event(
        self,
        event_type: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Record a telemetry event.

        Args:
            event_type: Type of event (e.g., 'sdk_initialized', 'payment_created')
            properties: Additional event properties

        Example:
            telemetry.record_event('payment_created', {
                'method': 'create_payment_intent',
                'success': True,
                'latency_ms': 234
            })
        """
        if not self.enabled:
            return

        try:
            payload = self._build_payload(event_type, properties or {})
            self._send_async(payload)
        except Exception as e:
            # Telemetry failures should not impact application
            logger.debug(f"Failed to send telemetry: {e}")

    def _build_payload(
        self, event_type: str, properties: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Build telemetry event payload"""
        return {
            "timestamp": int(time.time() * 1000),
            "event_type": event_type,
            "sdk_language": "python",
            "sdk_version": __version__,
            "platform": {
                "system": platform.system(),
                "release": platform.release(),
                "python_version": platform.python_version(),
                "machine": platform.machine(),
            },
            "merchant_id": self.merchant_id,
            "properties": properties,
        }

    def _send_async(self, payload: Dict[str, Any]) -> None:
        """
        Send telemetry event asynchronously (non-blocking).

        In production, consider using:
        - Background task queue (Celery, RQ)
        - Thread pool
        - Async HTTP client
        """
        try:
            # Use short timeout to avoid blocking
            requests.post(
                self.url,
                json=payload,
                timeout=1.0,
                headers={"User-Agent": f"molam-python-sdk/{__version__}"},
            )
        except requests.RequestException:
            # Silently fail - telemetry is best-effort
            pass


# Global telemetry instance
_telemetry_client = TelemetryClient()


def record_sdk_initialization(config: Dict[str, Any]) -> None:
    """
    Record SDK initialization event.

    Args:
        config: Sanitized configuration (no secrets)
    """
    _telemetry_client.record_event(
        "sdk_initialized",
        {
            "base_url_type": (
                "sandbox" if "sandbox" in config.get("base_url", "") else "production"
            ),
            "timeout_connect": config.get("timeout_connect"),
            "timeout_read": config.get("timeout_read"),
            "max_retries": config.get("max_retries"),
        },
    )


def record_api_call(
    method: str, success: bool, latency_ms: float, status_code: Optional[int] = None
) -> None:
    """
    Record API call metrics.

    Args:
        method: API method name (e.g., 'create_payment_intent')
        success: Whether call succeeded
        latency_ms: Request latency in milliseconds
        status_code: HTTP status code
    """
    _telemetry_client.record_event(
        "api_call",
        {
            "method": method,
            "success": success,
            "latency_ms": round(latency_ms, 2),
            "status_code": status_code,
        },
    )


def record_error(error_type: str, error_code: Optional[str] = None) -> None:
    """
    Record SDK error.

    Args:
        error_type: Error type (e.g., 'APIError', 'NetworkError')
        error_code: Error code from API
    """
    _telemetry_client.record_event(
        "sdk_error",
        {
            "error_type": error_type,
            "error_code": error_code,
        },
    )


def record_circuit_breaker_event(event: str, circuit_name: str) -> None:
    """
    Record circuit breaker state change.

    Args:
        event: Event type ('opened', 'closed', 'half_open')
        circuit_name: Circuit breaker name
    """
    _telemetry_client.record_event(
        "circuit_breaker",
        {
            "event": event,
            "circuit_name": circuit_name,
        },
    )


# Example usage in SDK
if __name__ == "__main__":
    # Simulate SDK usage
    record_sdk_initialization(
        {
            "base_url": "https://sandbox.api.molam.io",
            "timeout_connect": 5.0,
            "timeout_read": 15.0,
            "max_retries": 3,
        }
    )

    record_api_call("create_payment_intent", success=True, latency_ms=234.5, status_code=200)

    record_error("APIError", error_code="invalid_amount")

    record_circuit_breaker_event("opened", "molam_api_cb")

    print("✓ Telemetry events recorded (if enabled)")
    print(f"Telemetry enabled: {TELEMETRY_ENABLED}")
    print(f"Telemetry URL: {TELEMETRY_URL}")
