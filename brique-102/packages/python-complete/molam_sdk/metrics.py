"""
Prometheus Metrics for Molam SDK

Provides counters and histograms for request monitoring.
Host application should expose the prometheus_client registry.
"""

import logging
from prometheus_client import Counter, Histogram

logger = logging.getLogger("molam_sdk.metrics")

# Total requests counter with endpoint and status code labels
REQUEST_COUNT = Counter(
    "molam_sdk_requests_total",
    "Total number of SDK requests",
    ["endpoint", "code"],
)

# Request latency histogram with endpoint label
REQUEST_LATENCY = Histogram(
    "molam_sdk_request_latency_seconds",
    "SDK request latency in seconds",
    ["endpoint"],
)


def metrics_request(endpoint: str, code: int, latency: float) -> None:
    """
    Record metrics for an SDK request.

    Args:
        endpoint: API endpoint name (e.g., 'create_payment_intent')
        code: HTTP status code (e.g., 200, 400, 500)
        latency: Request duration in seconds

    Example:
        >>> import time
        >>> start = time.time()
        >>> # ... make request ...
        >>> metrics_request("create_payment", 200, time.time() - start)
    """
    try:
        REQUEST_COUNT.labels(endpoint=endpoint, code=str(code)).inc()
        REQUEST_LATENCY.labels(endpoint=endpoint).observe(latency)
    except Exception as e:
        # Metrics failures should not crash the SDK
        logger.debug("Failed to record metrics: %s", e)
