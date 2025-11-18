"""
Circuit Breaker Implementation for Molam SDK

Protects against cascading failures by stopping requests when error rate is high.
Uses pybreaker library with logging integration.
"""

import logging
from pybreaker import CircuitBreaker, CircuitBreakerListener

logger = logging.getLogger("molam_sdk.cb")


class LoggingListener(CircuitBreakerListener):
    """Listener that logs circuit breaker state changes"""

    def state_change(self, cb, old_state, new_state):
        logger.warning(
            "CircuitBreaker %s state change %s -> %s", cb.name, old_state, new_state
        )

    def before_call(self, cb, func, *args, **kwargs):
        logger.debug("CircuitBreaker %s before call to %s", cb.name, func.__name__)

    def success(self, cb):
        logger.debug("CircuitBreaker %s successful call", cb.name)

    def failure(self, cb, exc):
        logger.warning("CircuitBreaker %s failure: %s", cb.name, exc)


def create_circuit_breaker(
    name: str, fail_max: int = 5, reset_timeout: int = 60
) -> CircuitBreaker:
    """
    Create a pybreaker.CircuitBreaker with logging listener.

    Args:
        name: Circuit breaker name for logging
        fail_max: Number of consecutive failures to open circuit (default: 5)
        reset_timeout: Seconds before trying half-open state (default: 60)

    Returns:
        CircuitBreaker: Configured circuit breaker instance

    Example:
        >>> cb = create_circuit_breaker("api_calls", fail_max=3)
        >>> with cb:
        ...     make_api_call()
    """
    return CircuitBreaker(
        fail_max=fail_max,
        reset_timeout=reset_timeout,
        name=name,
        listeners=[LoggingListener()],
    )
