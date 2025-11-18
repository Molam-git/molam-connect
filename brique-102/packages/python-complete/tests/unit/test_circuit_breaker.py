"""
Unit Tests for Circuit Breaker

Tests circuit breaker behavior with mocked failures.
"""

import pytest
from molam_sdk.cb import create_circuit_breaker


def test_circuit_breaker_creation():
    """Test circuit breaker can be created with custom parameters"""
    cb = create_circuit_breaker("test_cb", fail_max=3, reset_timeout=30)

    assert cb is not None
    assert cb.name == "test_cb"
    assert cb.fail_max == 3
    assert cb.reset_timeout == 30


def test_circuit_breaker_opens_after_failures():
    """Test circuit breaker opens after consecutive failures"""
    from pybreaker import CircuitBreakerError, STATE_OPEN

    cb = create_circuit_breaker("test_fail", fail_max=3, reset_timeout=1)

    def failing_func():
        raise ValueError("fail")

    # First two failures should pass through
    for i in range(2):
        with pytest.raises(ValueError):
            cb.call(failing_func)

    # Third failure opens circuit and raises CircuitBreakerError
    with pytest.raises(CircuitBreakerError):
        cb.call(failing_func)

    # Circuit should now be open
    assert cb.current_state == STATE_OPEN

    # Next call should raise CircuitBreakerError immediately (circuit is open)
    with pytest.raises(CircuitBreakerError):
        cb.call(failing_func)


def test_circuit_breaker_allows_success():
    """Test circuit breaker allows successful calls through"""
    cb = create_circuit_breaker("test_success", fail_max=2)

    def success_func():
        return "success"

    # Successful call should not increment failure count
    result = cb.call(success_func)

    assert result == "success"


def test_circuit_breaker_resets_after_success():
    """Test circuit breaker resets failure count after success"""
    from pybreaker import STATE_CLOSED

    cb = create_circuit_breaker("test_reset", fail_max=3)

    def failing_func():
        raise ValueError("fail")

    def success_func():
        return "success"

    # One failure
    with pytest.raises(ValueError):
        cb.call(failing_func)

    # Success should reset counter
    result = cb.call(success_func)

    assert cb.current_state == STATE_CLOSED

    # Should still allow calls
    result = cb.call(success_func)
    assert result == "success"


def test_multiple_circuit_breakers():
    """Test multiple independent circuit breakers"""
    from pybreaker import STATE_CLOSED

    cb1 = create_circuit_breaker("cb1", fail_max=3)
    cb2 = create_circuit_breaker("cb2", fail_max=3)

    def failing_func():
        raise ValueError("fail")

    def success_func():
        return "success"

    # Fail cb1 once
    with pytest.raises(ValueError):
        cb1.call(failing_func)

    # cb2 should still work (independent circuit)
    result = cb2.call(success_func)
    assert result == "success"
    assert cb2.current_state == STATE_CLOSED
