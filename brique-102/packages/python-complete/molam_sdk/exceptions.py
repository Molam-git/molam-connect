"""
Molam SDK Exceptions
"""

from typing import Optional, Dict, Any


class MolamError(Exception):
    """Base exception for Molam SDK"""

    pass


class APIError(MolamError):
    """API request error"""

    def __init__(
        self,
        status_code: int,
        message: str,
        body: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ):
        self.status_code = status_code
        self.message = message
        self.body = body or {}
        self.request_id = request_id
        super().__init__(f"APIError {status_code}: {message}")

    def __str__(self) -> str:
        parts = [f"[{self.status_code}] {self.message}"]
        if self.request_id:
            parts.append(f"(request_id: {self.request_id})")
        return " ".join(parts)


class IdempotencyError(MolamError):
    """Idempotency key error"""

    pass


class WebhookVerificationError(MolamError):
    """Webhook signature verification error"""

    pass


class ConfigurationError(MolamError):
    """SDK configuration error"""

    pass


class NetworkError(MolamError):
    """Network/connectivity error"""

    pass


class TimeoutError(MolamError):
    """Request timeout error"""

    pass
