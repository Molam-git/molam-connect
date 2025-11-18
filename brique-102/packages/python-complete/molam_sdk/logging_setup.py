"""
Structured JSON Logging for Molam SDK

Provides a JSON formatter for structured logging output.
Useful for log aggregation systems like ELK, Datadog, CloudWatch.
"""

import logging
import sys
import json
from typing import Any, Dict


class JsonFormatter(logging.Formatter):
    """Formats log records as JSON for structured logging"""

    def format(self, record: logging.LogRecord) -> str:
        """
        Format a log record as JSON.

        Args:
            record: Log record to format

        Returns:
            JSON string with timestamp, logger name, level, message
        """
        payload: Dict[str, Any] = {
            "ts": int(record.created * 1000),  # milliseconds
            "name": record.name,
            "level": record.levelname,
            "msg": record.getMessage(),
        }

        # Add exception info if present
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)

        # Add extra fields from record
        if hasattr(record, "request_id"):
            payload["request_id"] = record.request_id

        if hasattr(record, "endpoint"):
            payload["endpoint"] = record.endpoint

        return json.dumps(payload, default=str)


def setup_structured_logger(level: int = logging.INFO) -> None:
    """
    Configure structured JSON logging for the SDK.

    Args:
        level: Logging level (default: logging.INFO)

    Example:
        >>> from molam_sdk.logging_setup import setup_structured_logger
        >>> setup_structured_logger(logging.DEBUG)
        >>> import logging
        >>> logger = logging.getLogger("molam_sdk")
        >>> logger.info("Payment created", extra={"request_id": "req_123"})
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    # Configure molam_sdk logger
    sdk_logger = logging.getLogger("molam_sdk")
    sdk_logger.setLevel(level)
    sdk_logger.handlers = [handler]
    sdk_logger.propagate = False


def sanitize_sensitive_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remove sensitive data from log payloads.

    Args:
        data: Dictionary potentially containing sensitive data

    Returns:
        Dictionary with sensitive fields redacted

    Example:
        >>> sanitize_sensitive_data({"api_key": "sk_123", "amount": 100})
        {'api_key': '***REDACTED***', 'amount': 100}
    """
    sensitive_keys = {"api_key", "password", "secret", "token", "authorization"}
    sanitized = data.copy()

    for key in sanitized:
        if any(sensitive in key.lower() for sensitive in sensitive_keys):
            sanitized[key] = "***REDACTED***"

    return sanitized
