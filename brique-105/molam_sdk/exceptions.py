"""
Exception classes for Molam SDK.
"""

from typing import Dict, Any, Optional


class MolamError(Exception):
    """Base exception for all Molam SDK errors."""

    pass


class ApiError(MolamError):
    """
    API error exception.

    Raised when the API returns an error response.
    """

    def __init__(
        self,
        message: str,
        status_code: int = 0,
        payload: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
    ):
        """
        Initialize API error.

        Args:
            message: Error message
            status_code: HTTP status code
            payload: Response payload
            request_id: Request ID for debugging
        """
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload or {}
        self.request_id = request_id

    def __repr__(self) -> str:
        return (
            f"ApiError(message={self.args[0]!r}, "
            f"status_code={self.status_code}, "
            f"request_id={self.request_id!r})"
        )


class SignatureError(MolamError):
    """
    Webhook signature verification error.

    Raised when webhook signature verification fails.
    """

    pass


class NetworkError(MolamError):
    """
    Network connectivity error.

    Raised when network requests fail.
    """

    pass


class TimeoutError(MolamError):
    """
    Request timeout error.

    Raised when requests timeout.
    """

    pass


class ValidationError(MolamError):
    """
    Input validation error.

    Raised when input validation fails.
    """

    def __init__(self, message: str, errors: Optional[Dict[str, str]] = None):
        """
        Initialize validation error.

        Args:
            message: Error message
            errors: Field-level validation errors
        """
        super().__init__(message)
        self.errors = errors or {}
