"""
Aiohttp-based HTTP adapter (asynchronous).
"""

import aiohttp
import asyncio
from typing import Any, Dict, Optional, Tuple
from ..exceptions import NetworkError, TimeoutError as MolamTimeoutError


class AiohttpAdapter:
    """
    Asynchronous HTTP adapter using aiohttp library.

    Features:
    - Non-blocking requests for async applications
    - Connection pooling
    - Configurable timeouts
    - Automatic retries
    """

    def __init__(
        self,
        session: Optional[aiohttp.ClientSession] = None,
        max_retries: int = 3,
    ):
        """
        Initialize aiohttp adapter.

        Args:
            session: Optional aiohttp.ClientSession instance
            max_retries: Maximum number of retry attempts
        """
        self._external_session = session is not None
        self.session = session
        self.max_retries = max_retries

    async def __aenter__(self) -> "AiohttpAdapter":
        """Context manager entry."""
        if self.session is None:
            self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        if not self._external_session and self.session:
            await self.session.close()

    async def send(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        json: Optional[Any] = None,
        timeout: int = 10,
    ) -> Tuple[int, str, Dict[str, str]]:
        """
        Send HTTP request using aiohttp library.

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
        if self.session is None:
            raise RuntimeError("Session not initialized. Use 'async with' context.")

        timeout_obj = aiohttp.ClientTimeout(total=timeout)

        for attempt in range(self.max_retries):
            try:
                async with self.session.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=json,
                    timeout=timeout_obj,
                ) as response:
                    text = await response.text()
                    return (
                        response.status,
                        text,
                        dict(response.headers),
                    )

            except asyncio.TimeoutError as e:
                if attempt == self.max_retries - 1:
                    raise MolamTimeoutError(f"Request timed out: {e}") from e
                await asyncio.sleep(0.5 * (2**attempt))  # Exponential backoff

            except aiohttp.ClientError as e:
                if attempt == self.max_retries - 1:
                    raise NetworkError(f"Network request failed: {e}") from e
                await asyncio.sleep(0.5 * (2**attempt))  # Exponential backoff

        raise NetworkError("Max retries exceeded")

    async def close(self) -> None:
        """Close the session."""
        if not self._external_session and self.session:
            await self.session.close()
