"""
Payment Intents resource
"""

from typing import Dict, Any, Optional, List


class Payments:
    """Payment Intents API"""

    def __init__(self, http):
        self.http = http

    def create(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a payment intent

        Args:
            payload: Payment intent data

        Returns:
            Payment intent object
        """
        response = self.http.post(
            "/v1/payment_intents",
            {"payment_intent": payload}
        )
        return response.get("data", {})

    def retrieve(self, intent_id: str) -> Dict[str, Any]:
        """
        Retrieve a payment intent

        Args:
            intent_id: Payment intent ID

        Returns:
            Payment intent object
        """
        response = self.http.get(f"/v1/payment_intents/{intent_id}")
        return response.get("data", {})

    def confirm(self, intent_id: str) -> Dict[str, Any]:
        """
        Confirm a payment intent

        Args:
            intent_id: Payment intent ID

        Returns:
            Updated payment intent object
        """
        response = self.http.post(f"/v1/payment_intents/{intent_id}/confirm")
        return response.get("data", {})

    def cancel(self, intent_id: str) -> Dict[str, Any]:
        """
        Cancel a payment intent

        Args:
            intent_id: Payment intent ID

        Returns:
            Updated payment intent object
        """
        response = self.http.post(f"/v1/payment_intents/{intent_id}/cancel")
        return response.get("data", {})

    def list(self, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        List payment intents

        Args:
            params: Query parameters (limit, starting_after, etc.)

        Returns:
            List of payment intent objects
        """
        response = self.http.get("/v1/payment_intents", params=params)
        return response.get("data", [])
