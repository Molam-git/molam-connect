"""
Tests for webhook verification.
"""

import pytest
import time
from molam_sdk.utils.webhook import (
    verify_signature,
    parse_signature_header,
    generate_signature,
)
from molam_sdk.exceptions import SignatureError


class TestWebhookVerification:
    """Test webhook signature verification."""

    def test_parse_signature_header(self):
        """Test parsing signature header."""
        header = "t=1705420800000,v1=abc123def456,kid=1"
        parts = parse_signature_header(header)

        assert parts["t"] == "1705420800000"
        assert parts["v1"] == "abc123def456"
        assert parts["kid"] == "1"

    def test_parse_signature_header_invalid(self):
        """Test parsing invalid signature header."""
        with pytest.raises(SignatureError, match="Missing signature header"):
            parse_signature_header("")

        with pytest.raises(SignatureError, match="Invalid signature header format"):
            parse_signature_header("invalid_format")

    def test_generate_and_verify_signature(self):
        """Test generating and verifying signature."""
        payload = b'{"event":"payment.succeeded","data":{"id":"pi_123"}}'
        secret = "whsec_test_secret_123"
        timestamp_ms = int(time.time() * 1000)

        # Generate signature
        signature_header = generate_signature(payload, secret, timestamp_ms, kid="1")

        # Verify signature
        def get_secret(kid: str) -> str:
            return secret if kid == "1" else ""

        result = verify_signature(signature_header, payload, get_secret, tolerance_ms=5 * 60 * 1000)
        assert result is True

    def test_verify_signature_mismatch(self):
        """Test signature verification with wrong signature."""
        payload = b'{"event":"payment.succeeded"}'
        secret = "whsec_test_secret"
        timestamp_ms = int(time.time() * 1000)

        # Generate signature with one secret
        signature_header = generate_signature(payload, secret, timestamp_ms)

        # Try to verify with different secret
        def get_wrong_secret(kid: str) -> str:
            return "whsec_wrong_secret"

        with pytest.raises(SignatureError, match="Signature mismatch"):
            verify_signature(signature_header, payload, get_wrong_secret)

    def test_verify_signature_missing_fields(self):
        """Test signature verification with missing required fields."""
        payload = b'{"event":"test"}'

        def get_secret(kid: str) -> str:
            return "secret"

        # Missing v1
        with pytest.raises(SignatureError, match="Missing required fields"):
            verify_signature("t=123,kid=1", payload, get_secret)

        # Missing t
        with pytest.raises(SignatureError, match="Missing required fields"):
            verify_signature("v1=abc,kid=1", payload, get_secret)

        # Missing kid
        with pytest.raises(SignatureError, match="Missing required fields"):
            verify_signature("t=123,v1=abc", payload, get_secret)

    def test_verify_signature_timestamp_tolerance(self):
        """Test timestamp tolerance (replay protection)."""
        payload = b'{"event":"test"}'
        secret = "whsec_test_secret"

        # Old timestamp (outside tolerance)
        old_timestamp = int(time.time() * 1000) - (10 * 60 * 1000)  # 10 minutes ago
        signature_header = generate_signature(payload, secret, old_timestamp)

        def get_secret(kid: str) -> str:
            return secret

        # Should fail with default tolerance (5 minutes)
        with pytest.raises(SignatureError, match="Timestamp outside tolerance"):
            verify_signature(signature_header, payload, get_secret)

        # Should succeed with larger tolerance
        result = verify_signature(
            signature_header,
            payload,
            get_secret,
            tolerance_ms=15 * 60 * 1000,  # 15 minutes
        )
        assert result is True

    def test_verify_signature_future_timestamp(self):
        """Test signature verification with future timestamp."""
        payload = b'{"event":"test"}'
        secret = "whsec_test_secret"

        # Future timestamp
        future_timestamp = int(time.time() * 1000) + (10 * 60 * 1000)  # 10 minutes in future
        signature_header = generate_signature(payload, secret, future_timestamp)

        def get_secret(kid: str) -> str:
            return secret

        # Should fail (outside tolerance)
        with pytest.raises(SignatureError, match="Timestamp outside tolerance"):
            verify_signature(signature_header, payload, get_secret)

    def test_verify_signature_secret_not_found(self):
        """Test signature verification when secret is not found."""
        payload = b'{"event":"test"}'
        secret = "whsec_test_secret"
        timestamp_ms = int(time.time() * 1000)

        signature_header = generate_signature(payload, secret, timestamp_ms, kid="2")

        def get_secret(kid: str) -> str:
            return secret if kid == "1" else ""  # Only kid=1 is known

        with pytest.raises(SignatureError, match="Secret not found"):
            verify_signature(signature_header, payload, get_secret)

    def test_verify_signature_tampered_payload(self):
        """Test signature verification with tampered payload."""
        original_payload = b'{"event":"payment.succeeded","amount":1000}'
        tampered_payload = b'{"event":"payment.succeeded","amount":9999}'
        secret = "whsec_test_secret"
        timestamp_ms = int(time.time() * 1000)

        # Generate signature for original payload
        signature_header = generate_signature(original_payload, secret, timestamp_ms)

        def get_secret(kid: str) -> str:
            return secret

        # Try to verify tampered payload
        with pytest.raises(SignatureError, match="Signature mismatch"):
            verify_signature(signature_header, tampered_payload, get_secret)

    def test_multi_version_secrets(self):
        """Test multi-version secret support (key rotation)."""
        payload = b'{"event":"test"}'
        old_secret = "whsec_old_secret"
        new_secret = "whsec_new_secret"
        timestamp_ms = int(time.time() * 1000)

        # Generate signatures with different key IDs
        old_signature = generate_signature(payload, old_secret, timestamp_ms, kid="1")
        new_signature = generate_signature(payload, new_secret, timestamp_ms, kid="2")

        def get_secret(kid: str) -> str:
            secrets = {"1": old_secret, "2": new_secret}
            return secrets.get(kid, "")

        # Verify old signature
        assert verify_signature(old_signature, payload, get_secret) is True

        # Verify new signature
        assert verify_signature(new_signature, payload, get_secret) is True

    def test_invalid_timestamp_format(self):
        """Test handling of invalid timestamp format."""
        payload = b'{"event":"test"}'

        def get_secret(kid: str) -> str:
            return "secret"

        # Non-numeric timestamp
        with pytest.raises(SignatureError, match="Invalid timestamp"):
            verify_signature("t=invalid,v1=abc,kid=1", payload, get_secret)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
