#!/usr/bin/env python3
"""
BRIQUE 142-SIRA — SIRA Bridge Tests
Pytest tests for Python SIRA bridge service
"""

import pytest
import requests
import json
import time

# Test configuration
BRIDGE_URL = "http://localhost:8081"


@pytest.fixture(scope="module")
def bridge_health():
    """Check if bridge is running before tests"""
    try:
        resp = requests.get(f"{BRIDGE_URL}/health", timeout=5)
        if resp.status_code == 200:
            return True
    except requests.exceptions.RequestException:
        pytest.skip("SIRA bridge not running. Start with: python sira/sira_bridge.py")
    return False


class TestSiraBridgeHealth:
    """Test bridge health endpoints"""

    def test_health_endpoint_get(self, bridge_health):
        """Health check via GET"""
        resp = requests.get(f"{BRIDGE_URL}/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

    def test_health_endpoint_post(self, bridge_health):
        """Health check via POST"""
        resp = requests.post(f"{BRIDGE_URL}/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"


class TestSiraBridgeInference:
    """Test inference endpoints"""

    def test_infer_endpoint_basic(self, bridge_health):
        """Basic inference request"""
        payload = {
            "samples": [
                {
                    "id": "test1",
                    "type": "payment",
                    "amount": 100.0,
                    "currency": "USD",
                    "occurred_at": "2025-01-15T10:00:00Z",
                    "meta": {"merchant_id": "M123"}
                }
            ]
        }

        resp = requests.post(f"{BRIDGE_URL}/v1/infer", json=payload)
        assert resp.status_code == 200

        data = resp.json()
        assert "scenario" in data
        assert "confidence" in data
        assert "justification" in data
        assert "suggested_actions" in data
        assert "model_version" in data

    def test_infer_endpoint_with_idempotency_key(self, bridge_health):
        """Inference with idempotency key"""
        payload = {
            "samples": [
                {
                    "id": "test2",
                    "type": "chargeback",
                    "amount": 500.0,
                    "currency": "EUR",
                    "occurred_at": "2025-01-15T11:00:00Z"
                }
            ],
            "request_id": "test-request-123"
        }

        headers = {"Idempotency-Key": "test-key-456"}

        resp = requests.post(f"{BRIDGE_URL}/v1/infer", json=payload, headers=headers)
        assert resp.status_code == 200

        data = resp.json()
        assert data["request_id"] in ["test-request-123", "test-key-456", ""]

    def test_infer_endpoint_multiple_samples(self, bridge_health):
        """Inference with multiple event samples"""
        samples = [
            {
                "id": f"evt{i}",
                "type": "payment",
                "amount": 50.0 + i * 10,
                "currency": "USD",
                "occurred_at": "2025-01-15T12:00:00Z"
            }
            for i in range(10)
        ]

        payload = {"samples": samples}

        resp = requests.post(f"{BRIDGE_URL}/v1/infer", json=payload)
        assert resp.status_code == 200

        data = resp.json()
        assert "scenario" in data
        assert isinstance(data["justification"], list)
        assert isinstance(data["suggested_actions"], list)

    def test_infer_endpoint_high_value_transaction(self, bridge_health):
        """Inference with high-value transaction"""
        payload = {
            "samples": [
                {
                    "id": "high-value-1",
                    "type": "payment",
                    "amount": 50000.0,
                    "currency": "USD",
                    "occurred_at": "2025-01-15T13:00:00Z",
                    "meta": {"risk_score": "0.95"}
                }
            ]
        }

        resp = requests.post(f"{BRIDGE_URL}/v1/infer", json=payload)
        assert resp.status_code == 200

        data = resp.json()
        # High value should trigger higher confidence or specific scenario
        assert 0.0 <= data["confidence"] <= 1.0

    def test_infer_endpoint_empty_samples(self, bridge_health):
        """Inference with no samples should fail gracefully"""
        payload = {"samples": []}

        resp = requests.post(f"{BRIDGE_URL}/v1/infer", json=payload)
        # Should either reject or handle gracefully
        assert resp.status_code in [200, 400]

    def test_infer_endpoint_missing_fields(self, bridge_health):
        """Inference with missing required fields"""
        payload = {
            "samples": [
                {
                    "id": "incomplete",
                    # missing type, amount, etc.
                }
            ]
        }

        resp = requests.post(f"{BRIDGE_URL}/v1/infer", json=payload)
        # Should handle gracefully
        assert resp.status_code in [200, 400, 500]


class TestSiraBridgeResponseFormat:
    """Test response format compliance"""

    def test_response_has_required_fields(self, bridge_health):
        """Verify response contains all required fields"""
        payload = {
            "samples": [
                {
                    "id": "format-test",
                    "type": "payment",
                    "amount": 100.0,
                    "currency": "USD",
                    "occurred_at": "2025-01-15T14:00:00Z"
                }
            ]
        }

        resp = requests.post(f"{BRIDGE_URL}/v1/infer", json=payload)
        data = resp.json()

        required_fields = [
            "scenario",
            "confidence",
            "justification",
            "suggested_actions",
            "model_version"
        ]

        for field in required_fields:
            assert field in data, f"Missing required field: {field}"

    def test_justification_format(self, bridge_health):
        """Verify justification has correct format"""
        payload = {
            "samples": [
                {
                    "id": "just-test",
                    "type": "payment",
                    "amount": 200.0,
                    "currency": "EUR",
                    "occurred_at": "2025-01-15T15:00:00Z"
                }
            ]
        }

        resp = requests.post(f"{BRIDGE_URL}/v1/infer", json=payload)
        data = resp.json()

        assert isinstance(data["justification"], list)
        for item in data["justification"]:
            assert "name" in item
            assert "value" in item
            # note field is optional

    def test_confidence_range(self, bridge_health):
        """Verify confidence is in valid range"""
        payload = {
            "samples": [
                {
                    "id": "conf-test",
                    "type": "payment",
                    "amount": 150.0,
                    "currency": "GBP",
                    "occurred_at": "2025-01-15T16:00:00Z"
                }
            ]
        }

        resp = requests.post(f"{BRIDGE_URL}/v1/infer", json=payload)
        data = resp.json()

        confidence = data["confidence"]
        assert 0.0 <= confidence <= 1.0, f"Confidence out of range: {confidence}"


class TestSiraBridgeErrorHandling:
    """Test error handling"""

    def test_invalid_json(self, bridge_health):
        """Invalid JSON payload"""
        resp = requests.post(
            f"{BRIDGE_URL}/v1/infer",
            data="invalid json",
            headers={"Content-Type": "application/json"}
        )
        assert resp.status_code in [400, 500]

    def test_invalid_endpoint(self, bridge_health):
        """Request to invalid endpoint"""
        resp = requests.post(f"{BRIDGE_URL}/invalid/endpoint")
        assert resp.status_code == 404

    def test_missing_content_type(self, bridge_health):
        """Request without content-type header"""
        payload = {"samples": [{"id": "test"}]}
        resp = requests.post(f"{BRIDGE_URL}/v1/infer", data=json.dumps(payload))
        # Should handle gracefully
        assert resp.status_code in [200, 400, 500]


class TestSiraBridgePerformance:
    """Performance tests"""

    def test_response_time(self, bridge_health):
        """Verify reasonable response time"""
        payload = {
            "samples": [
                {
                    "id": "perf-test",
                    "type": "payment",
                    "amount": 100.0,
                    "currency": "USD",
                    "occurred_at": "2025-01-15T17:00:00Z"
                }
            ]
        }

        start = time.time()
        resp = requests.post(f"{BRIDGE_URL}/v1/infer", json=payload, timeout=30)
        elapsed = time.time() - start

        assert resp.status_code == 200
        assert elapsed < 30.0, f"Response too slow: {elapsed}s"

    def test_batch_processing(self, bridge_health):
        """Process multiple samples efficiently"""
        samples = [
            {
                "id": f"batch{i}",
                "type": "payment",
                "amount": 100.0 + i,
                "currency": "USD",
                "occurred_at": "2025-01-15T18:00:00Z"
            }
            for i in range(50)
        ]

        payload = {"samples": samples}

        start = time.time()
        resp = requests.post(f"{BRIDGE_URL}/v1/infer", json=payload, timeout=30)
        elapsed = time.time() - start

        assert resp.status_code == 200
        assert elapsed < 30.0, f"Batch processing too slow: {elapsed}s"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
