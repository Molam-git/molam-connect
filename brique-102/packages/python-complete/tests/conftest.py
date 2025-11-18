"""
Pytest configuration and fixtures
"""

import pytest
from molam_sdk import MolamClient, ClientConfig


@pytest.fixture
def test_client():
    """Create test client fixture"""
    config = ClientConfig(
        api_key="sk_test_123",
        base_url="https://sandbox.api.molam.io",
        max_retries=0,  # Disable retries for faster tests
    )
    return MolamClient(config)


@pytest.fixture
def test_config():
    """Create test configuration fixture"""
    return ClientConfig(
        api_key="sk_test_123",
        base_url="https://sandbox.api.molam.io",
        timeout_connect=1.0,
        timeout_read=5.0,
    )
