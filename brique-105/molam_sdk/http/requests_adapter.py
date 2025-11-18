"""
Requests-based HTTP adapter (synchronous).
"""

import requests
from typing import Any, Dict, Optional, Tuple
from .adapter import HTTPAdapter
from ..exceptions import NetworkError, TimeoutError as MolamTimeoutError


class RequestsAdapter(HTTPAdapter):
    """
    Synchronous HTTP adapter using requests library.

    Features:
    - Automatic retries with exponential backoff
    - Connection pooling via session
    - Configurable timeouts
    """

    def __init__(
        self,
        session: Optional[requests.Session] = None,
        max_retries: int = 3,
    ):
        """
        Initialize requests adapter.

        Args:
            session: Optional requests.Session instance
            max_retries: Maximum number of retry attempts
        """
        self.session = session or requests.Session()
        self.max_retries = max_retries

        # Configure retries
        from requests.adapters import HTTPAdapter as RequestsHTTPAdapter
        from urllib3.util.retry import Retry

        retry_strategy = Retry(
            total=max_retries,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        )

        adapter = RequestsHTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def send(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        json: Optional[Any] = None,
        timeout: int = 10,
    ) -> Tuple[int, str, Dict[str, str]]:
        """
        Send HTTP request using requests library.

        Args:
            method: HTTP method
            url: Request URL
            headers: Request headers
            json: JSON request body
            timeout: Request timeout in seconds

        Returns:
            Tuple of (status_code, response_text, response_headers)

        Raises:
            NetworkError: On network connectivity issues
            TimeoutError: On request timeout
        """
        try:
            response = self.session.request(
                method=method,
                url=url,
                headers=headers,
                json=json,
                timeout=timeout,
            )

            return (
                response.status_code,
                response.text,
                dict(response.headers),
            )

        except requests.exceptions.Timeout as e:
            raise MolamTimeoutError(f"Request timed out: {e}") from e

        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Network request failed: {e}") from e
