"""
Base HTTP adapter interface.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Tuple


class HTTPAdapter(ABC):
    """
    Abstract base class for HTTP adapters.

    Allows pluggable HTTP clients for different use cases.
    """

    @abstractmethod
    def send(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        json: Optional[Any] = None,
        timeout: int = 10,
    ) -> Tuple[int, str, Dict[str, str]]:
        """
        Send HTTP request.

        Args:
            method: HTTP method (GET, POST, etc.)
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
        raise NotImplementedError
