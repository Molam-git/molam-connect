"""
Configuration module for Molam SDK.
"""

from typing import Optional
import os


class Config:
    """
    SDK Configuration.

    Supports environment variables for easy configuration:
    - MOLAM_API_BASE: API base URL (default: https://api.molam.com)
    - MOLAM_API_KEY: API key (required)
    - MOLAM_DEFAULT_CURRENCY: Default currency (default: USD)
    - MOLAM_DEFAULT_LOCALE: Default locale (default: en)
    - MOLAM_WEBHOOK_SECRET: Webhook signature secret
    """

    def __init__(
        self,
        api_base: Optional[str] = None,
        api_key: Optional[str] = None,
        default_currency: str = "USD",
        default_locale: str = "en",
        webhook_secret: Optional[str] = None,
        timeout: int = 30,
        max_retries: int = 3,
    ):
        """
        Initialize SDK configuration.

        Args:
            api_base: API base URL
            api_key: API key (required)
            default_currency: Default currency code
            default_locale: Default locale
            webhook_secret: Webhook signature secret
            timeout: Request timeout in seconds
            max_retries: Maximum retry attempts
        """
        self.api_base = (
            api_base or os.getenv("MOLAM_API_BASE", "https://api.molam.com")
        ).rstrip("/")
        self.api_key = api_key or os.getenv("MOLAM_API_KEY", "")
        self.default_currency = default_currency or os.getenv(
            "MOLAM_DEFAULT_CURRENCY", "USD"
        )
        self.default_locale = default_locale or os.getenv("MOLAM_DEFAULT_LOCALE", "en")
        self.webhook_secret = webhook_secret or os.getenv("MOLAM_WEBHOOK_SECRET", "")
        self.timeout = timeout
        self.max_retries = max_retries

        if not self.api_key:
            raise ValueError("MOLAM_API_KEY is required")

        if not self.api_key.startswith(("sk_", "jwt_")):
            raise ValueError(
                "Invalid API key format. Must start with 'sk_' or 'jwt_'"
            )

    def __repr__(self) -> str:
        return (
            f"Config(api_base={self.api_base!r}, "
            f"api_key=***REDACTED***, "
            f"default_currency={self.default_currency!r}, "
            f"default_locale={self.default_locale!r})"
        )
