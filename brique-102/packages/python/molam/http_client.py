"""
HTTP client with retries and idempotency
"""

import time
import uuid
from typing import Optional, Dict, Any
import requests

from molam.exceptions import MolamError


class HttpClient:
    """HTTP client with retries and idempotency"""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout_ms: int = 8000,
        max_retries: int = 3
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout_ms / 1000.0
        self.max_retries = max_retries

        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Molam-SDK-Python/2.0"
        })

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Make GET request"""
        return self._request_with_retry("GET", path, params=params)

    def post(
        self,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Make POST request"""
        return self._request_with_retry("POST", path, json_data=body, extra_headers=headers)

    def put(
        self,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Make PUT request"""
        return self._request_with_retry("PUT", path, json_data=body, extra_headers=headers)

    def delete(self, path: str) -> Dict[str, Any]:
        """Make DELETE request"""
        return self._request_with_retry("DELETE", path)

    def _request_with_retry(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        extra_headers: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Execute request with automatic retries"""
        headers = extra_headers or {}

        # Add idempotency key if not present
        if "Idempotency-Key" not in headers:
            headers["Idempotency-Key"] = str(uuid.uuid4())

        url = f"{self.base_url}{path}"
        attempt = 0

        while True:
            try:
                response = self.session.request(
                    method=method,
                    url=url,
                    params=params,
                    json=json_data,
                    headers=headers,
                    timeout=self.timeout
                )

                response.raise_for_status()
                return response.json() if response.text else {}

            except requests.exceptions.RequestException as e:
                status = e.response.status_code if e.response is not None else None

                if attempt >= self.max_retries or not self._is_retryable_status(status):
                    raise MolamError.from_requests_exception(e)

                # Backoff
                wait = self._backoff(attempt)
                time.sleep(wait / 1000.0)
                attempt += 1

    @staticmethod
    def _is_retryable_status(status: Optional[int]) -> bool:
        """Check if HTTP status is retryable"""
        if status is None:
            return True
        if status >= 500:
            return True
        return status in [408, 429, 425]

    @staticmethod
    def _backoff(attempt: int) -> int:
        """Calculate backoff delay in milliseconds"""
        sequence = [200, 500, 1000, 2000, 5000]
        return sequence[min(attempt, len(sequence) - 1)]
