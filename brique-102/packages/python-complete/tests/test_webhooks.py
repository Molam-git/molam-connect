"""
Unit tests for webhook verification
"""

import pytest
import hmac
import hashlib
import time
from molam_sdk.webhooks import verify_molam_signature, construct_event
from molam_sdk.exceptions import WebhookVerificationError


def test_verify_signature_success():
    """Test successful signature verification"""
    secret = "test_secret_key_12345"
    payload = b'{"id":"evt_123","type":"payment.succeeded","data":{"amount":100}}'
    timestamp = str(int(time.time() * 1000))

    # Compute valid signature
    signed_payload = f"{timestamp}.".encode() + payload
    signature = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()

    header = f"t={timestamp},v1={signature},kid=v1"

    def get_secret(kid):
        return secret if kid == "v1" else None

    result = verify_molam_signature(header, payload, get_secret)
    assert result is True


def test_verify_signature_invalid():
    """Test verification with invalid signature"""
    secret = "test_secret_key"
    payload = b'{"id":"evt_123"}'
    timestamp = str(int(time.time() * 1000))
    header = f"t={timestamp},v1=invalid_signature,kid=v1"

    def get_secret(kid):
        return secret

    with pytest.raises(WebhookVerificationError, match="Signature mismatch"):
        verify_molam_signature(header, payload, get_secret)


def test_verify_signature_expired():
    """Test verification with expired timestamp"""
    secret = "test_secret_key"
    payload = b'{"id":"evt_123"}'

    # Timestamp from 10 minutes ago
    timestamp = str(int((time.time() - 600) * 1000))

    signed_payload = f"{timestamp}.".encode() + payload
    signature = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()

    header = f"t={timestamp},v1={signature},kid=v1"

    def get_secret(kid):
        return secret

    with pytest.raises(WebhookVerificationError, match="timestamp outside tolerance"):
        verify_molam_signature(header, payload, get_secret)


def test_verify_signature_missing_header():
    """Test verification with missing header"""

    def get_secret(kid):
        return "secret"

    with pytest.raises(WebhookVerificationError, match="Missing Molam-Signature"):
        verify_molam_signature("", b"payload", get_secret)


def test_verify_signature_invalid_format():
    """Test verification with invalid header format"""
    header = "invalid_format"

    def get_secret(kid):
        return "secret"

    with pytest.raises(WebhookVerificationError, match="Invalid signature header"):
        verify_molam_signature(header, b"payload", get_secret)


def test_verify_signature_unknown_kid():
    """Test verification with unknown key ID"""
    payload = b'{"id":"evt_123"}'
    timestamp = str(int(time.time() * 1000))

    signed_payload = f"{timestamp}.".encode() + payload
    signature = hmac.new(b"secret", signed_payload, hashlib.sha256).hexdigest()

    header = f"t={timestamp},v1={signature},kid=unknown"

    def get_secret(kid):
        return None  # Unknown kid

    with pytest.raises(WebhookVerificationError, match="Unknown key ID"):
        verify_molam_signature(header, payload, get_secret)


def test_construct_event_success():
    """Test successful event construction"""
    secret = "test_secret_key"
    payload = b'{"id":"evt_123","type":"payment.succeeded","data":{"amount":100}}'
    timestamp = str(int(time.time() * 1000))

    signed_payload = f"{timestamp}.".encode() + payload
    signature = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()

    header = f"t={timestamp},v1={signature},kid=v1"

    def get_secret(kid):
        return secret

    event = construct_event(payload, header, get_secret)

    assert event["id"] == "evt_123"
    assert event["type"] == "payment.succeeded"
    assert event["data"]["amount"] == 100


def test_construct_event_invalid_json():
    """Test event construction with invalid JSON"""
    secret = "test_secret_key"
    payload = b"invalid json"
    timestamp = str(int(time.time() * 1000))

    signed_payload = f"{timestamp}.".encode() + payload
    signature = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()

    header = f"t={timestamp},v1={signature},kid=v1"

    def get_secret(kid):
        return secret

    with pytest.raises(WebhookVerificationError, match="Invalid JSON payload"):
        construct_event(payload, header, get_secret)
