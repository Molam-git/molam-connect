"""
Molam SDK exceptions
"""

from typing import Optional, Dict, Any
import requests


class MolamError(Exception):
    """Base exception for Molam SDK"""

    def __init__(
        self,
        code: str,
        message: str,
        status: int = 500,
        request_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.request_id = request_id
        self.details = details

    @classmethod
    def from_requests_exception(cls, exc: requests.exceptions.RequestException) -> "MolamError":
        """Create MolamError from requests exception"""
        response = exc.response
        status = response.status_code if response is not None else 500

        body = None
        if response is not None:
            try:
                body = response.json()
            except ValueError:
                body = None

        if body and "error" in body:
            code = body["error"].get("code", "server_error" if status >= 500 else "request_failed")
            message = body["error"].get("message", str(exc))
        else:
            code = "server_error" if status >= 500 else "request_failed"
            message = str(exc)

        request_id = response.headers.get("X-Molam-Request-Id") if response is not None else None

        return cls(
            code=code,
            message=message,
            status=status,
            request_id=request_id,
            details=body
        )

    def __str__(self) -> str:
        parts = [f"[{self.code}] {self.message}"]
        if self.request_id:
            parts.append(f"(request_id: {self.request_id})")
        return " ".join(parts)
