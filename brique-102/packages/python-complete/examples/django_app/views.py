"""
Django Integration Example for Molam Python SDK

This example demonstrates how to integrate Molam payments into a Django application.
Uses the sync client with circuit breaker protection for production reliability.
"""

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import os
import uuid
import logging

from molam_sdk import MolamSyncClient, ClientConfig, PaymentIntentCreate
from molam_sdk.exceptions import APIError, NetworkError

logger = logging.getLogger(__name__)

# Initialize Molam client (once at module level)
molam_config = ClientConfig(
    api_key=os.getenv("MOLAM_API_KEY", "sk_test_xxx"),
    base_url=os.getenv("MOLAM_BASE_URL", "https://sandbox.api.molam.io"),
    timeout_connect=5.0,
    timeout_read=15.0,
)
molam_client = MolamSyncClient(molam_config)


@csrf_exempt
@require_http_methods(["POST"])
def create_payment(request):
    """
    Create a payment intent for an order.

    Expected POST data:
    {
        "amount": 25.50,
        "currency": "USD",
        "order_id": "ORDER-123",
        "customer_email": "customer@example.com"
    }
    """
    try:
        # Parse request data
        import json

        data = json.loads(request.body)

        amount = float(data.get("amount"))
        currency = data.get("currency", "USD")
        order_id = data.get("order_id")
        customer_email = data.get("customer_email")

        # Create payment intent
        payload = PaymentIntentCreate(
            amount=amount,
            currency=currency,
            description=f"Order {order_id}",
            return_url=f"{request.scheme}://{request.get_host()}/payment/success",
            cancel_url=f"{request.scheme}://{request.get_host()}/payment/cancel",
            metadata={
                "order_id": order_id,
                "customer_email": customer_email,
                "source": "django_app",
            },
        )

        # Generate idempotency key based on order ID
        idempotency_key = f"django-order-{order_id}-{uuid.uuid4().hex[:8]}"

        # Call Molam API
        payment_intent = molam_client.create_payment_intent(
            payload, idempotency_key=idempotency_key
        )

        logger.info(
            f"Payment intent created: {payment_intent.id} for order {order_id}"
        )

        return JsonResponse(
            {
                "success": True,
                "payment_intent_id": payment_intent.id,
                "status": payment_intent.status,
                "redirect_url": payment_intent.redirect_url,
            }
        )

    except ValueError as e:
        logger.error(f"Invalid request data: {e}")
        return JsonResponse({"success": False, "error": "Invalid request data"}, status=400)

    except APIError as e:
        logger.error(f"Molam API error: {e}")
        return JsonResponse(
            {"success": False, "error": f"Payment error: {e.message}"}, status=502
        )

    except NetworkError as e:
        logger.error(f"Network error: {e}")
        return JsonResponse(
            {"success": False, "error": "Payment service unavailable"}, status=503
        )

    except Exception as e:
        logger.exception(f"Unexpected error: {e}")
        return JsonResponse(
            {"success": False, "error": "Internal server error"}, status=500
        )


@csrf_exempt
@require_http_methods(["GET"])
def get_payment_status(request, payment_intent_id):
    """
    Retrieve payment intent status.

    URL: /api/payment/<payment_intent_id>/status
    """
    try:
        payment_intent = molam_client.retrieve_payment_intent(payment_intent_id)

        return JsonResponse(
            {
                "success": True,
                "payment_intent_id": payment_intent.id,
                "status": payment_intent.status,
                "amount": payment_intent.amount,
                "currency": payment_intent.currency,
            }
        )

    except APIError as e:
        logger.error(f"Failed to retrieve payment: {e}")
        return JsonResponse(
            {"success": False, "error": "Payment not found"}, status=404
        )

    except Exception as e:
        logger.exception(f"Error retrieving payment: {e}")
        return JsonResponse(
            {"success": False, "error": "Internal server error"}, status=500
        )


@csrf_exempt
@require_http_methods(["POST"])
def confirm_payment(request, payment_intent_id):
    """
    Confirm a payment intent.

    URL: /api/payment/<payment_intent_id>/confirm
    """
    try:
        idempotency_key = f"django-confirm-{payment_intent_id}-{uuid.uuid4().hex[:8]}"

        confirmed = molam_client.confirm_payment_intent(
            payment_intent_id, idempotency_key=idempotency_key
        )

        logger.info(f"Payment confirmed: {confirmed.id}")

        return JsonResponse(
            {
                "success": True,
                "payment_intent_id": confirmed.id,
                "status": confirmed.status,
            }
        )

    except APIError as e:
        logger.error(f"Failed to confirm payment: {e}")
        return JsonResponse(
            {"success": False, "error": e.message}, status=400
        )

    except Exception as e:
        logger.exception(f"Error confirming payment: {e}")
        return JsonResponse(
            {"success": False, "error": "Internal server error"}, status=500
        )
