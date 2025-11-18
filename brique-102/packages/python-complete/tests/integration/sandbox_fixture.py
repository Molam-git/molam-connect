"""
Sandbox Fixtures for Integration Tests

Provides configured clients for testing against Molam sandbox environment.
Requires MOLAM_SANDBOX_KEY environment variable to be set.
"""

import os
import pytest
from molam_sdk.client import MolamClient
from molam_sdk.sync_client import MolamSyncClient
from molam_sdk.models import ClientConfig


@pytest.fixture(scope="session")
def sandbox_config():
    """
    Create sandbox configuration from environment variables.

    Environment Variables:
        MOLAM_SANDBOX_KEY: Required API key for sandbox
        MOLAM_SANDBOX_URL: Optional sandbox URL (default: https://sandbox.api.molam.io)

    Skips tests if MOLAM_SANDBOX_KEY is not set.
    """
    api_key = os.getenv("MOLAM_SANDBOX_KEY")
    if not api_key:
        pytest.skip("MOLAM_SANDBOX_KEY environment variable not set")

    base_url = os.getenv("MOLAM_SANDBOX_URL", "https://sandbox.api.molam.io")

    return ClientConfig(
        api_key=api_key,
        base_url=base_url,
        timeout_connect=5.0,
        timeout_read=15.0,
    )


@pytest.fixture(scope="session")
def sandbox_client(sandbox_config):
    """
    Create basic MolamClient for sandbox testing.

    Returns:
        MolamClient: Configured client instance
    """
    return MolamClient(sandbox_config)


@pytest.fixture(scope="session")
def sandbox_sync_client(sandbox_config):
    """
    Create MolamSyncClient with circuit breaker for sandbox testing.

    Returns:
        MolamSyncClient: Configured sync client with circuit breaker
    """
    return MolamSyncClient(sandbox_config)


@pytest.fixture
def unique_idempotency_key():
    """
    Generate unique idempotency key for each test.

    Returns:
        str: Unique idempotency key with timestamp
    """
    import uuid
    import time

    timestamp = int(time.time() * 1000)
    return f"test-{timestamp}-{uuid.uuid4().hex[:8]}"
