"""
Idempotency key generation and management.
"""

import time
import secrets
from typing import Optional


def make_idempotency_key(provided: Optional[str] = None) -> str:
    """
    Generate or validate idempotency key.

    Idempotency keys prevent duplicate operations by ensuring the same
    operation is not executed twice.

    Args:
        provided: Optional user-provided idempotency key

    Returns:
        Validated or generated idempotency key

    Raises:
        ValueError: If provided key is too long (> 128 chars)

    Examples:
        >>> # Auto-generate key
        >>> key = make_idempotency_key()
        >>> print(key)  # molam-1705420800000-a1b2c3d4e5f6

        >>> # Use custom key
        >>> key = make_idempotency_key("order-12345")
        >>> print(key)  # order-12345
    """
    if provided:
        if len(provided) > 128:
            raise ValueError("Idempotency key too long (max 128 characters)")
        return provided

    # Auto-generate: molam-{timestamp_ms}-{random_hex}
    ts = int(time.time() * 1000)
    rand = secrets.token_hex(12)
    return f"molam-{ts}-{rand}"


class IdempotencyStore:
    """
    Database-backed idempotency store.

    Stores idempotency keys and their corresponding responses to prevent
    duplicate operations in distributed systems.
    """

    def __init__(self, db_connection: Any):
        """
        Initialize idempotency store.

        Args:
            db_connection: Database connection (e.g., psycopg2 connection)
        """
        self.db = db_connection

    def get_cached_response(self, idempotency_key: str, route: str) -> Optional[Dict]:
        """
        Retrieve cached response for idempotency key.

        Args:
            idempotency_key: Idempotency key
            route: API route

        Returns:
            Cached response data or None if not found
        """
        cursor = self.db.cursor()
        cursor.execute(
            """
            SELECT response, status
            FROM server_idempotency
            WHERE idempotency_key = %s AND route = %s
            """,
            (idempotency_key, route),
        )
        row = cursor.fetchone()
        cursor.close()

        if row:
            return {"response": row[0], "status": row[1]}
        return None

    def store_response(
        self,
        idempotency_key: str,
        route: str,
        response: Dict,
        status: str = "completed",
    ) -> None:
        """
        Store response for idempotency key.

        Args:
            idempotency_key: Idempotency key
            route: API route
            response: Response data
            status: Operation status (processing, completed, failed)
        """
        cursor = self.db.cursor()
        cursor.execute(
            """
            INSERT INTO server_idempotency (idempotency_key, route, response, status)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (idempotency_key) DO UPDATE
            SET response = EXCLUDED.response, status = EXCLUDED.status
            """,
            (idempotency_key, route, response, status),
        )
        self.db.commit()
        cursor.close()


# Type hints
from typing import Dict, Any
