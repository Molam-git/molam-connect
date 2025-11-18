"""
Refunds resource
"""

from typing import Dict, Any, Optional, List


class Refunds:
    """Refunds API"""

    def __init__(self, http):
        self.http = http

    def create(
        self,
        payload: Dict[str, Any],
        idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a refund

        Args:
            payload: Refund data
            idempotency_key: Optional idempotency key

        Returns:
            Refund object
        """
        headers = {}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        response = self.http.post(
            "/v1/refunds",
            {"refund": payload},
            headers=headers if headers else None
        )
        return response.get("data", {})

    def retrieve(self, refund_id: str) -> Dict[str, Any]:
        """
        Retrieve a refund

        Args:
            refund_id: Refund ID

        Returns:
            Refund object
        """
        response = self.http.get(f"/v1/refunds/{refund_id}")
        return response.get("data", {})

    def list(self, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        List refunds

        Args:
            params: Query parameters (limit, starting_after, etc.)

        Returns:
            List of refund objects
        """
        response = self.http.get("/v1/refunds", params=params)
        return response.get("data", [])
