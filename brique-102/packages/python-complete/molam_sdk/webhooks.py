"""
Molam Webhook Signature Verification
"""

import hmac
import hashlib
import time
from typing import Callable
from molam_sdk.exceptions import WebhookVerificationError


def verify_molam_signature(
    header: str,
    payload: bytes,
    get_secret_by_kid: Callable[[str], str],
    tolerance_seconds: int = 300,
) -> bool:
    """
    Verify Molam webhook signature (HMAC-SHA256)

    Signature format: t=<unix_ms>,v1=<hex_signature>,kid=<key_id>

    Args:
        header: Molam-Signature header value
        payload: Raw request body as bytes
        get_secret_by_kid: Function to retrieve webhook secret by key ID
        tolerance_seconds: Maximum age of signature in seconds (default 5 minutes)

    Returns:
        True if signature is valid

    Raises:
        WebhookVerificationError: If signature is invalid or expired

    Example:
        >>> def get_secret(kid):
        ...     return os.environ.get(f"WEBHOOK_SECRET_{kid}")
        >>> verify_molam_signature(
        ...     "t=1700000000000,v1=abc123...,kid=v1",
        ...     b'{"event": "payment.succeeded"}',
        ...     get_secret
        ... )
        True
    """
    if not header:
        raise WebhookVerificationError("Missing Molam-Signature header")

    # Parse signature header
    parts = {}
    try:
        for part in header.split(","):
            key, value = part.split("=", 1)
            parts[key] = value
    except Exception as e:
        raise WebhookVerificationError(f"Invalid signature header format: {e}")

    timestamp_str = parts.get("t")
    signature = parts.get("v1")
    kid = parts.get("kid", "v1")

    if not timestamp_str or not signature:
        raise WebhookVerificationError("Missing timestamp or signature in header")

    # Validate timestamp
    try:
        timestamp = int(timestamp_str)
    except ValueError:
        raise WebhookVerificationError("Invalid timestamp format")

    current_time = int(time.time() * 1000)
    age = abs(current_time - timestamp)

    if age > tolerance_seconds * 1000:
        raise WebhookVerificationError(
            f"Signature timestamp outside tolerance: {age}ms > {tolerance_seconds * 1000}ms"
        )

    # Get webhook secret
    secret = get_secret_by_kid(kid)
    if not secret:
        raise WebhookVerificationError(f"Unknown key ID: {kid}")

    # Compute expected signature
    signed_payload = f"{timestamp_str}.".encode("utf-8") + payload
    expected_signature = hmac.new(
        secret.encode("utf-8"), signed_payload, hashlib.sha256
    ).hexdigest()

    # Constant-time comparison
    if not hmac.compare_digest(expected_signature, signature):
        raise WebhookVerificationError("Signature mismatch")

    return True


def construct_event(
    payload: bytes, signature_header: str, get_secret_by_kid: Callable[[str], str]
) -> dict:
    """
    Verify signature and construct webhook event

    Args:
        payload: Raw request body as bytes
        signature_header: Molam-Signature header value
        get_secret_by_kid: Function to retrieve webhook secret

    Returns:
        Parsed webhook event as dictionary

    Raises:
        WebhookVerificationError: If signature verification fails
    """
    import json

    # Verify signature first
    verify_molam_signature(signature_header, payload, get_secret_by_kid)

    # Parse event
    try:
        event = json.loads(payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise WebhookVerificationError(f"Invalid JSON payload: {e}")

    return event
