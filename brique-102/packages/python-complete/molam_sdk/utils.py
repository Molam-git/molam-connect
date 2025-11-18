"""
Molam SDK Utilities
"""

import time
import random
import logging
from typing import Callable, Any, Iterable
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger("molam_sdk")


def requests_session_with_retries(
    total: int = 3,
    backoff_factor: float = 0.3,
    status_forcelist: Iterable[int] = (429, 500, 502, 503, 504),
) -> requests.Session:
    """
    Create a requests session with automatic retries

    Args:
        total: Maximum number of retries
        backoff_factor: Backoff factor for exponential backoff
        status_forcelist: HTTP status codes to retry on

    Returns:
        Configured requests session
    """
    session = requests.Session()

    retries = Retry(
        total=total,
        backoff_factor=backoff_factor,
        status_forcelist=status_forcelist,
        allowed_methods=frozenset(["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"]),
        raise_on_status=False,
        respect_retry_after_header=True,
    )

    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    return session


def backoff_sleep(attempt: int, base: float = 0.2, cap: float = 60.0) -> None:
    """
    Sleep with exponential backoff and jitter

    Args:
        attempt: Current attempt number (0-indexed)
        base: Base sleep time in seconds
        cap: Maximum sleep time in seconds
    """
    jitter = random.uniform(0, base)
    sleep_time = min(cap, base * (2**attempt) + jitter)
    time.sleep(sleep_time)


def setup_logging(debug: bool = False) -> None:
    """
    Setup structured logging for SDK

    Args:
        debug: Enable debug level logging
    """
    level = logging.DEBUG if debug else logging.INFO

    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def sanitize_for_logging(data: dict) -> dict:
    """
    Sanitize sensitive data for logging

    Args:
        data: Dictionary to sanitize

    Returns:
        Sanitized dictionary
    """
    sensitive_keys = {"api_key", "token", "secret", "password", "key", "authorization"}
    sanitized = {}

    for key, value in data.items():
        if any(sensitive in key.lower() for sensitive in sensitive_keys):
            sanitized[key] = "***REDACTED***"
        elif isinstance(value, dict):
            sanitized[key] = sanitize_for_logging(value)
        else:
            sanitized[key] = value

    return sanitized
