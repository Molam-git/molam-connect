"""
Webhook Handler for Molam Payment Events

This Flask application demonstrates how to receive and verify webhooks from Molam.
Suitable for WooCommerce, Shopify, or custom e-commerce integrations.

Security Features:
- HMAC-SHA256 signature verification
- Timestamp validation (replay protection)
- Idempotency handling
"""

from flask import Flask, request, jsonify
import hmac
import hashlib
import time
import os
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration
MOLAM_WEBHOOK_SECRET = os.getenv("MOLAM_WEBHOOK_SECRET", "replace_me_with_real_secret")
WEBHOOK_TOLERANCE_SECONDS = 300  # 5 minutes


# In-memory store for idempotency (use Redis in production)
processed_events = set()


def verify_signature(payload: bytes, signature_header: str, secret: str) -> bool:
    """
    Verify HMAC-SHA256 webhook signature.

    Args:
        payload: Raw request body
        signature_header: Molam-Signature header value
        secret: Webhook secret

    Returns:
        bool: True if signature is valid

    Raises:
        ValueError: If signature format is invalid or timestamp is outside tolerance
    """
    try:
        # Parse signature header: t=<timestamp>,v1=<hmac>,kid=<key_id>
        parts = dict(part.split("=", 1) for part in signature_header.split(","))

        timestamp = int(parts["t"])
        signature = parts["v1"]
        kid = parts.get("kid", "v1")

        # Validate timestamp (replay protection)
        current_time = int(time.time() * 1000)
        if abs(current_time - timestamp) > (WEBHOOK_TOLERANCE_SECONDS * 1000):
            logger.warning(
                f"Webhook timestamp outside tolerance: {abs(current_time - timestamp)}ms"
            )
            return False

        # Compute expected signature
        signed_payload = f"{timestamp}.".encode() + payload
        expected_signature = hmac.new(
            secret.encode(), signed_payload, hashlib.sha256
        ).hexdigest()

        # Constant-time comparison
        is_valid = hmac.compare_digest(expected_signature, signature)

        if not is_valid:
            logger.warning(f"Signature mismatch for kid={kid}")

        return is_valid

    except (KeyError, ValueError) as e:
        logger.error(f"Invalid signature header format: {e}")
        return False


def is_duplicate_event(event_id: str) -> bool:
    """
    Check if event has already been processed (idempotency).

    In production, use Redis with TTL:
        redis_client.set(f"webhook:{event_id}", "1", ex=86400)
    """
    if event_id in processed_events:
        logger.info(f"Duplicate event detected: {event_id}")
        return True

    processed_events.add(event_id)
    return False


def handle_payment_succeeded(event_data: dict):
    """
    Handle successful payment event.

    Update order status in database, send confirmation email, etc.
    """
    payment_intent_id = event_data["id"]
    amount = event_data.get("amount")
    currency = event_data.get("currency")
    metadata = event_data.get("metadata", {})
    order_id = metadata.get("order_id")

    logger.info(
        f"Payment succeeded: {payment_intent_id}, "
        f"amount={amount} {currency}, "
        f"order={order_id}"
    )

    # TODO: Update order status in your database
    # Order.objects.filter(id=order_id).update(status='paid')

    # TODO: Send confirmation email
    # send_email(customer_email, "Payment Received", ...)

    # TODO: Trigger fulfillment workflow
    # fulfillment_service.process_order(order_id)


def handle_payment_failed(event_data: dict):
    """Handle failed payment event."""
    payment_intent_id = event_data["id"]
    metadata = event_data.get("metadata", {})
    order_id = metadata.get("order_id")

    logger.warning(f"Payment failed: {payment_intent_id}, order={order_id}")

    # TODO: Update order status
    # Order.objects.filter(id=order_id).update(status='failed')

    # TODO: Notify customer
    # send_email(customer_email, "Payment Failed", ...)


def handle_refund_processed(event_data: dict):
    """Handle refund processed event."""
    refund_id = event_data["id"]
    payment_id = event_data.get("payment_id")
    amount = event_data.get("amount")

    logger.info(f"Refund processed: {refund_id}, payment={payment_id}, amount={amount}")

    # TODO: Update refund status in database
    # Refund.objects.filter(id=refund_id).update(status='completed')


# Event handlers mapping
EVENT_HANDLERS = {
    "payment_intent.succeeded": handle_payment_succeeded,
    "payment_intent.failed": handle_payment_failed,
    "refund.processed": handle_refund_processed,
}


@app.route("/webhook/molam", methods=["POST"])
def molam_webhook():
    """
    Molam webhook endpoint.

    Expected headers:
        Molam-Signature: t=<timestamp>,v1=<hmac>,kid=<key_id>

    Expected payload:
        {
            "id": "evt_123",
            "type": "payment_intent.succeeded",
            "created": 1234567890,
            "data": {...},
            "livemode": false
        }
    """
    # Get signature header
    signature = request.headers.get("Molam-Signature")
    if not signature:
        logger.warning("Missing Molam-Signature header")
        return jsonify({"error": "Missing signature"}), 401

    # Get raw body
    raw_body = request.get_data()

    # Verify signature
    try:
        if not verify_signature(raw_body, signature, MOLAM_WEBHOOK_SECRET):
            logger.warning("Invalid webhook signature")
            return jsonify({"error": "Invalid signature"}), 401
    except Exception as e:
        logger.error(f"Signature verification error: {e}")
        return jsonify({"error": "Signature verification failed"}), 401

    # Parse event
    try:
        event = request.get_json()
    except Exception as e:
        logger.error(f"Failed to parse JSON: {e}")
        return jsonify({"error": "Invalid JSON"}), 400

    # Check for duplicate
    event_id = event.get("id")
    if is_duplicate_event(event_id):
        logger.info(f"Ignoring duplicate event: {event_id}")
        return jsonify({"status": "duplicate"}), 200

    # Route to handler
    event_type = event.get("type")
    event_data = event.get("data", {})

    logger.info(f"Received webhook: type={event_type}, id={event_id}")

    handler = EVENT_HANDLERS.get(event_type)
    if handler:
        try:
            handler(event_data)
            logger.info(f"Successfully processed event: {event_id}")
        except Exception as e:
            logger.exception(f"Error processing event {event_id}: {e}")
            # Return 200 to avoid retries for processing errors
            return jsonify({"status": "error", "message": str(e)}), 200
    else:
        logger.warning(f"Unknown event type: {event_type}")

    return jsonify({"status": "ok"}), 200


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "service": "molam-webhook-handler"}), 200


if __name__ == "__main__":
    logger.info("Starting Molam Webhook Handler...")
    logger.info(
        f"Webhook secret configured: {MOLAM_WEBHOOK_SECRET[:10]}..."
        if MOLAM_WEBHOOK_SECRET != "replace_me_with_real_secret"
        else "WARNING: Using default webhook secret!"
    )

    # Run Flask app
    app.run(host="0.0.0.0", port=5000, debug=True)
