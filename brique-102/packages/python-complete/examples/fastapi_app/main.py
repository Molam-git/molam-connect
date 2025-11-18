"""
FastAPI Integration Example for Molam Python SDK

This example demonstrates async payment processing with FastAPI.
Can use either async or sync client depending on performance needs.
"""

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
import os
import uuid
import logging

from molam_sdk import MolamSyncClient, ClientConfig, PaymentIntentCreate
from molam_sdk.exceptions import APIError, NetworkError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Molam Payment API",
    description="FastAPI integration with Molam Python SDK",
    version="1.0.0",
)

# Initialize Molam client
molam_config = ClientConfig(
    api_key=os.getenv("MOLAM_API_KEY", "sk_test_xxx"),
    base_url=os.getenv("MOLAM_BASE_URL", "https://sandbox.api.molam.io"),
    timeout_connect=5.0,
    timeout_read=15.0,
)
molam_client = MolamSyncClient(molam_config)


# Request/Response Models
class CreatePaymentRequest(BaseModel):
    """Request model for creating payment"""

    amount: float = Field(..., gt=0, description="Payment amount")
    currency: str = Field(..., min_length=3, max_length=3, description="Currency code")
    order_id: str = Field(..., description="Merchant order ID")
    customer_email: str = Field(..., description="Customer email")
    description: str = Field(None, description="Payment description")
    return_url: str = Field(None, description="Return URL after payment")


class PaymentResponse(BaseModel):
    """Response model for payment operations"""

    success: bool
    payment_intent_id: str
    status: str
    redirect_url: str = None
    message: str = None


# Routes
@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "service": "Molam Payment API",
        "version": "1.0.0",
        "sdk": "molam-python-sdk",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "sdk_initialized": True}


@app.post("/payments", response_model=PaymentResponse)
async def create_payment(request: CreatePaymentRequest):
    """
    Create a new payment intent.

    - **amount**: Payment amount (must be positive)
    - **currency**: 3-letter currency code (e.g., USD, EUR)
    - **order_id**: Your internal order ID
    - **customer_email**: Customer's email address
    """
    try:
        # Build payment intent
        payload = PaymentIntentCreate(
            amount=request.amount,
            currency=request.currency.upper(),
            description=request.description or f"Order {request.order_id}",
            return_url=request.return_url or "https://merchant.example.com/success",
            cancel_url="https://merchant.example.com/cancel",
            metadata={
                "order_id": request.order_id,
                "customer_email": request.customer_email,
                "source": "fastapi_app",
            },
        )

        # Generate idempotency key
        idempotency_key = f"fastapi-{request.order_id}-{uuid.uuid4().hex[:8]}"

        # Create payment intent
        payment_intent = molam_client.create_payment_intent(
            payload, idempotency_key=idempotency_key
        )

        logger.info(
            f"Payment created: {payment_intent.id} for order {request.order_id}"
        )

        return PaymentResponse(
            success=True,
            payment_intent_id=payment_intent.id,
            status=payment_intent.status,
            redirect_url=payment_intent.redirect_url,
            message="Payment intent created successfully",
        )

    except APIError as e:
        logger.error(f"Molam API error: {e}")
        raise HTTPException(status_code=502, detail=f"Payment error: {e.message}")

    except NetworkError as e:
        logger.error(f"Network error: {e}")
        raise HTTPException(status_code=503, detail="Payment service unavailable")

    except Exception as e:
        logger.exception(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/payments/{payment_intent_id}", response_model=PaymentResponse)
async def get_payment(payment_intent_id: str):
    """
    Retrieve payment intent status by ID.
    """
    try:
        payment_intent = molam_client.retrieve_payment_intent(payment_intent_id)

        return PaymentResponse(
            success=True,
            payment_intent_id=payment_intent.id,
            status=payment_intent.status,
            message=f"Payment status: {payment_intent.status}",
        )

    except APIError as e:
        logger.error(f"Failed to retrieve payment: {e}")
        raise HTTPException(status_code=404, detail="Payment not found")

    except Exception as e:
        logger.exception(f"Error retrieving payment: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/payments/{payment_intent_id}/confirm", response_model=PaymentResponse)
async def confirm_payment(payment_intent_id: str):
    """
    Confirm a payment intent.
    """
    try:
        idempotency_key = f"fastapi-confirm-{payment_intent_id}-{uuid.uuid4().hex[:8]}"

        confirmed = molam_client.confirm_payment_intent(
            payment_intent_id, idempotency_key=idempotency_key
        )

        logger.info(f"Payment confirmed: {confirmed.id}")

        return PaymentResponse(
            success=True,
            payment_intent_id=confirmed.id,
            status=confirmed.status,
            message="Payment confirmed successfully",
        )

    except APIError as e:
        logger.error(f"Failed to confirm payment: {e}")
        raise HTTPException(status_code=400, detail=e.message)

    except Exception as e:
        logger.exception(f"Error confirming payment: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# Startup/Shutdown Events
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("Molam Payment API starting up...")
    logger.info(f"SDK initialized with base URL: {molam_config.base_url}")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Molam Payment API shutting down...")


# Run with: uvicorn main:app --reload
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
