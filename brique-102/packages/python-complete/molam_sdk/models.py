"""
Molam SDK Data Models
"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, field_validator


class ClientConfig(BaseModel):
    """SDK client configuration"""

    api_key: Optional[str] = Field(None, description="Molam API key or service JWT")
    base_url: str = Field("https://api.molam.io", description="API base URL")
    timeout_connect: float = Field(1.0, description="Connection timeout in seconds")
    timeout_read: float = Field(10.0, description="Read timeout in seconds")
    region: Optional[str] = Field(None, description="Region override (e.g., 'us-east', 'eu-west')")
    verify_ssl: bool = Field(True, description="Verify SSL certificates")
    mtls_cert: Optional[str] = Field(None, description="Path to mTLS client certificate (PEM)")
    mtls_key: Optional[str] = Field(None, description="Path to mTLS client key (PEM)")
    default_currency: str = Field("USD", description="Default currency code")
    default_locale: str = Field("en", description="Default locale")
    max_retries: int = Field(3, description="Maximum number of retries")
    retry_backoff_factor: float = Field(0.3, description="Retry backoff factor")
    debug: bool = Field(False, description="Enable debug logging")

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, v):
        if v and not (v.startswith("sk_") or v.startswith("jwt_")):
            raise ValueError("API key must start with 'sk_' or 'jwt_'")
        return v


class PaymentIntentCreate(BaseModel):
    """Create payment intent request"""

    amount: float = Field(..., description="Amount in major currency units")
    currency: str = Field(..., description="ISO currency code (e.g., XOF, USD)")
    capture: bool = Field(False, description="Auto-capture payment")
    customer_id: Optional[str] = Field(None, description="Customer ID")
    merchant_id: Optional[str] = Field(None, description="Merchant ID")
    description: Optional[str] = Field(None, description="Payment description")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Custom metadata")
    return_url: Optional[str] = Field(None, description="Return URL after payment")
    cancel_url: Optional[str] = Field(None, description="Cancel URL")
    payment_methods: Optional[List[str]] = Field(None, description="Allowed payment methods")

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v):
        if len(v) != 3:
            raise ValueError("Currency must be 3-letter ISO code")
        return v.upper()


class PaymentIntent(BaseModel):
    """Payment intent response"""

    id: str
    status: str
    amount: float
    currency: str
    capture: bool = False
    customer_id: Optional[str] = None
    merchant_id: Optional[str] = None
    description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    created_at: str
    updated_at: Optional[str] = None
    redirect_url: Optional[str] = None


class RefundCreate(BaseModel):
    """Create refund request"""

    payment_id: str = Field(..., description="Payment intent ID to refund")
    amount: Optional[float] = Field(None, description="Refund amount (partial refund if specified)")
    reason: Optional[str] = Field(None, description="Refund reason")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Custom metadata")

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v):
        if v is not None and v <= 0:
            raise ValueError("Amount must be positive")
        return v


class Refund(BaseModel):
    """Refund response"""

    id: str
    payment_id: str
    amount: float
    currency: str
    status: str
    reason: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    created_at: str


class PayoutCreate(BaseModel):
    """Create payout request"""

    amount: float = Field(..., description="Payout amount")
    currency: str = Field(..., description="ISO currency code")
    beneficiary: str = Field(..., description="Beneficiary account ID")
    origin_module: str = Field(..., description="Originating module (e.g., 'marketplace')")
    origin_entity: str = Field(..., description="Originating entity ID")
    description: Optional[str] = Field(None, description="Payout description")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Custom metadata")

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v


class Payout(BaseModel):
    """Payout response"""

    id: str
    amount: float
    currency: str
    beneficiary: str
    status: str
    origin_module: str
    origin_entity: str
    description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    created_at: str
    completed_at: Optional[str] = None


class WebhookEvent(BaseModel):
    """Webhook event"""

    id: str
    type: str
    created: int
    data: Dict[str, Any]
    livemode: bool = False


class MerchantOnboardingCreate(BaseModel):
    """Merchant onboarding request"""

    business_name: str
    business_type: str
    country: str
    currency: str
    email: str
    phone: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class MerchantOnboarding(BaseModel):
    """Merchant onboarding response"""

    id: str
    status: str
    business_name: str
    country: str
    currency: str
    email: str
    kyc_status: str
    created_at: str
    onboarding_url: Optional[str] = None
