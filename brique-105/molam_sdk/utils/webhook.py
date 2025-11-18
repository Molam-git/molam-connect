"""
Webhook signature verification.
"""

import hmac
import hashlib
import time
from typing import Callable, Dict, Optional
from ..exceptions import SignatureError


def parse_signature_header(header: str) -> Dict[str, str]:
    """
    Parse Molam-Signature header.

    Header format: "t=<timestamp>,v1=<signature>,kid=<key_id>"

    Args:
        header: Molam-Signature header value

    Returns:
        Dictionary with 't', 'v1', and 'kid' keys

    Raises:
        SignatureError: If header format is invalid

    Examples:
        >>> header = "t=1705420800000,v1=abc123,kid=1"
        >>> parts = parse_signature_header(header)
        >>> parts['t']
        '1705420800000'
    """
    if not header:
        raise SignatureError("Missing signature header")

    parts = {}
    for pair in header.split(","):
        try:
            key, value = pair.split("=", 1)
            parts[key.strip()] = value.strip()
        except ValueError:
            raise SignatureError(f"Invalid signature header format: {pair}")

    return parts


def verify_signature(
    header: str,
    raw_body: bytes,
    get_secret_by_kid: Callable[[str], Optional[str]],
    tolerance_ms: int = 5 * 60 * 1000,
) -> bool:
    """
    Verify Molam webhook signature.

    Implements HMAC-SHA256 signature verification with:
    - Timestamp validation (replay protection)
    - Constant-time comparison (timing attack prevention)
    - Multi-version secret support (key rotation)

    Args:
        header: Molam-Signature header value
        raw_body: Raw request body (bytes)
        get_secret_by_kid: Function to retrieve secret by key ID
        tolerance_ms: Maximum age of webhook in milliseconds (default: 5 minutes)

    Returns:
        True if signature is valid

    Raises:
        SignatureError: If signature verification fails

    Examples:
        >>> def get_secret(kid):
        ...     return "whsec_test_secret" if kid == "1" else None
        >>>
        >>> header = "t=1705420800000,v1=abc...,kid=1"
        >>> body = b'{"event": "payment.succeeded"}'
        >>> verify_signature(header, body, get_secret)
        True
    """
    if not header:
        raise SignatureError("Missing signature header")

    # Parse header
    parts = parse_signature_header(header)

    # Validate required fields
    required_fields = {"t", "v1", "kid"}
    if not required_fields.issubset(parts.keys()):
        missing = required_fields - parts.keys()
        raise SignatureError(f"Missing required fields in signature: {missing}")

    # Extract fields
    try:
        timestamp_ms = int(parts["t"])
    except ValueError:
        raise SignatureError("Invalid timestamp format")

    signature = parts["v1"]
    kid = parts["kid"]

    # Validate timestamp (replay protection)
    now_ms = int(time.time() * 1000)
    if abs(now_ms - timestamp_ms) > tolerance_ms:
        raise SignatureError(
            f"Timestamp outside tolerance window "
            f"(age: {abs(now_ms - timestamp_ms)}ms, max: {tolerance_ms}ms)"
        )

    # Get secret for key ID
    secret = get_secret_by_kid(kid)
    if not secret:
        raise SignatureError(f"Secret not found for key ID: {kid}")

    # Compute expected signature
    # Signed payload format: "<timestamp>.<body>"
    signed_payload = f"{parts['t']}.{raw_body.decode('utf-8')}"
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    # Constant-time comparison (prevents timing attacks)
    if not hmac.compare_digest(expected_signature, signature):
        raise SignatureError("Signature mismatch")

    return True


def generate_signature(
    payload: bytes,
    secret: str,
    timestamp_ms: Optional[int] = None,
    kid: str = "1",
) -> str:
    """
    Generate webhook signature for testing.

    Args:
        payload: Request body
        secret: Webhook secret
        timestamp_ms: Optional timestamp (default: current time)
        kid: Key ID (default: "1")

    Returns:
        Molam-Signature header value

    Examples:
        >>> secret = "whsec_test_secret"
        >>> payload = b'{"event": "payment.succeeded"}'
        >>> header = generate_signature(payload, secret)
        >>> print(header)  # t=1705420800000,v1=abc...,kid=1
    """
    if timestamp_ms is None:
        timestamp_ms = int(time.time() * 1000)

    # Compute signature
    signed_payload = f"{timestamp_ms}.{payload.decode('utf-8')}"
    signature = hmac.new(
        secret.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return f"t={timestamp_ms},v1={signature},kid={kid}"
