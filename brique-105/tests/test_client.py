"""
Tests for synchronous client.
"""

import pytest
from molam_sdk.config import Config
from molam_sdk.client import MolamClient
from molam_sdk.http.adapter import HTTPAdapter
from molam_sdk.exceptions import ApiError
from typing import Tuple, Dict, Any, Optional


class DummyAdapter(HTTPAdapter):
    """Mock HTTP adapter for testing."""

    def __init__(self):
        self.last_request = None
        self.response_data = '{"id":"pi_test_1","status":"requires_action","amount":1000,"currency":"USD"}'
        self.response_status = 200
        self.response_headers = {"X-Request-Id": "req_test_123"}

    def send(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        json: Optional[Any] = None,
        timeout: int = 10,
    ) -> Tuple[int, str, Dict[str, str]]:
        """Mock send method."""
        self.last_request = {
            "method": method,
            "url": url,
            "headers": headers,
            "json": json,
        }
        return self.response_status, self.response_data, self.response_headers


class TestConfig:
    """Test configuration."""

    def test_config_from_env(self, monkeypatch):
        """Test configuration from environment variables."""
        monkeypatch.setenv("MOLAM_API_KEY", "sk_test_env_key")
        monkeypatch.setenv("MOLAM_API_BASE", "https://test.api.molam.com")

        config = Config()
        assert config.api_key == "sk_test_env_key"
        assert config.api_base == "https://test.api.molam.com"

    def test_config_api_key_required(self):
        """Test that API key is required."""
        with pytest.raises(ValueError, match="MOLAM_API_KEY is required"):
            Config(api_key="")

    def test_config_api_key_format(self):
        """Test API key format validation."""
        with pytest.raises(ValueError, match="Invalid API key format"):
            Config(api_key="invalid_key")

        # Valid keys
        Config(api_key="sk_test_123")
        Config(api_key="jwt_test_123")


class TestMolamClient:
    """Test synchronous client."""

    def test_create_payment_intent(self):
        """Test creating payment intent."""
        config = Config(api_key="sk_test_123", api_base="http://localhost")
        adapter = DummyAdapter()
        client = MolamClient(config, http_adapter=adapter)

        # Create payment intent
        payment = client.create_payment_intent(
            amount=1000,
            currency="USD",
            customer_id="cust_1",
        )

        # Verify response
        assert payment["id"] == "pi_test_1"
        assert payment["amount"] == 1000
        assert payment["currency"] == "USD"

        # Verify request
        assert adapter.last_request["method"] == "POST"
        assert "/v1/connect/payment_intents" in adapter.last_request["url"]
        assert adapter.last_request["json"]["amount"] == 1000
        assert adapter.last_request["json"]["currency"] == "USD"

    def test_create_payment_intent_with_idempotency(self):
        """Test creating payment intent with idempotency key."""
        config = Config(api_key="sk_test_123", api_base="http://localhost")
        adapter = DummyAdapter()
        client = MolamClient(config, http_adapter=adapter)

        payment = client.create_payment_intent(
            amount=2000,
            currency="EUR",
            idempotency_key="custom-key-123",
        )

        # Verify idempotency header
        assert "Idempotency-Key" in adapter.last_request["headers"]
        assert adapter.last_request["headers"]["Idempotency-Key"] == "custom-key-123"

    def test_retrieve_payment_intent(self):
        """Test retrieving payment intent."""
        config = Config(api_key="sk_test_123", api_base="http://localhost")
        adapter = DummyAdapter()
        client = MolamClient(config, http_adapter=adapter)

        payment = client.retrieve_payment_intent("pi_test_1")

        assert payment["id"] == "pi_test_1"
        assert adapter.last_request["method"] == "GET"
        assert "pi_test_1" in adapter.last_request["url"]

    def test_confirm_payment_intent(self):
        """Test confirming payment intent."""
        config = Config(api_key="sk_test_123", api_base="http://localhost")
        adapter = DummyAdapter()
        client = MolamClient(config, http_adapter=adapter)

        payment = client.confirm_payment_intent("pi_test_1")

        assert adapter.last_request["method"] == "POST"
        assert "pi_test_1/confirm" in adapter.last_request["url"]

    def test_cancel_payment_intent(self):
        """Test canceling payment intent."""
        config = Config(api_key="sk_test_123", api_base="http://localhost")
        adapter = DummyAdapter()
        client = MolamClient(config, http_adapter=adapter)

        payment = client.cancel_payment_intent("pi_test_1")

        assert adapter.last_request["method"] == "POST"
        assert "pi_test_1/cancel" in adapter.last_request["url"]

    def test_list_payment_intents(self):
        """Test listing payment intents."""
        config = Config(api_key="sk_test_123", api_base="http://localhost")
        adapter = DummyAdapter()
        adapter.response_data = '{"data":[{"id":"pi_1"},{"id":"pi_2"}],"has_more":false}'
        client = MolamClient(config, http_adapter=adapter)

        result = client.list_payment_intents(limit=10, customer_id="cust_1")

        assert adapter.last_request["method"] == "GET"
        assert "limit=10" in adapter.last_request["url"]
        assert "customer_id=cust_1" in adapter.last_request["url"]

    def test_create_refund(self):
        """Test creating refund."""
        config = Config(api_key="sk_test_123", api_base="http://localhost")
        adapter = DummyAdapter()
        adapter.response_data = '{"id":"ref_test_1","amount":500,"status":"succeeded"}'
        client = MolamClient(config, http_adapter=adapter)

        refund = client.create_refund(
            charge_id="ch_test_1",
            amount=500,
            reason="requested_by_customer",
        )

        assert refund["id"] == "ref_test_1"
        assert adapter.last_request["method"] == "POST"
        assert "ch_test_1/refund" in adapter.last_request["url"]

    def test_create_payout(self):
        """Test creating payout."""
        config = Config(api_key="sk_test_123", api_base="http://localhost")
        adapter = DummyAdapter()
        adapter.response_data = '{"id":"po_test_1","amount":1000.0,"status":"pending"}'
        client = MolamClient(config, http_adapter=adapter)

        payout = client.create_payout(
            origin_module="connect",
            origin_entity_id="merch_1",
            amount=1000.0,
            currency="USD",
            beneficiary={"type": "bank_account", "account_number": "123456"},
        )

        assert payout["id"] == "po_test_1"
        assert adapter.last_request["method"] == "POST"
        assert "/v1/treasury/payouts" in adapter.last_request["url"]

    def test_api_error_handling(self):
        """Test API error handling."""
        config = Config(api_key="sk_test_123", api_base="http://localhost")
        adapter = DummyAdapter()
        adapter.response_status = 400
        adapter.response_data = '{"error":{"code":"invalid_amount","message":"Amount too small"}}'
        client = MolamClient(config, http_adapter=adapter)

        with pytest.raises(ApiError) as exc_info:
            client.create_payment_intent(amount=10, currency="USD")

        error = exc_info.value
        assert error.status_code == 400
        assert error.request_id == "req_test_123"
        assert "error" in error.payload

    def test_authorization_header(self):
        """Test authorization header is set correctly."""
        config = Config(api_key="sk_test_secret_123", api_base="http://localhost")
        adapter = DummyAdapter()
        client = MolamClient(config, http_adapter=adapter)

        client.create_payment_intent(amount=1000, currency="USD")

        assert "Authorization" in adapter.last_request["headers"]
        assert adapter.last_request["headers"]["Authorization"] == "Bearer sk_test_secret_123"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
