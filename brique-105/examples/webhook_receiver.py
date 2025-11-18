"""
Webhook receiver example.

Demonstrates webhook signature verification and event processing.

Usage:
    # Standalone verification
    echo '{"event":"payment.succeeded"}' | python examples/webhook_receiver.py "t=1705420800000,v1=abc...,kid=1"

    # Flask webhook endpoint
    export MOLAM_WEBHOOK_SECRET="whsec_..."
    python examples/webhook_receiver.py --server
"""

import sys
import os
import json

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from molam_sdk.utils.webhook import verify_signature, parse_signature_header
from molam_sdk.exceptions import SignatureError


def get_secret_by_kid(kid: str) -> str:
    """
    Retrieve webhook secret by key ID.

    In production, this should fetch from:
    - Environment variables (for simple setups)
    - Database (for multi-tenant)
    - Vault/KMS (for high security)

    Args:
        kid: Key ID from signature header

    Returns:
        Webhook secret for the given key ID
    """
    # Simple implementation: single secret from environment
    # For multi-version support, add logic to handle multiple kids
    secret = os.getenv("MOLAM_WEBHOOK_SECRET", "")

    if not secret:
        raise SignatureError(f"No secret configured for kid={kid}")

    return secret


def process_webhook_event(event: dict) -> None:
    """
    Process webhook event.

    Args:
        event: Parsed webhook event data
    """
    event_type = event.get("type", "unknown")
    event_data = event.get("data", {})

    print(f"Processing event: {event_type}")

    # Handle different event types
    if event_type == "payment_intent.succeeded":
        handle_payment_succeeded(event_data)
    elif event_type == "payment_intent.failed":
        handle_payment_failed(event_data)
    elif event_type == "payment_intent.canceled":
        handle_payment_canceled(event_data)
    elif event_type == "refund.created":
        handle_refund_created(event_data)
    elif event_type == "refund.succeeded":
        handle_refund_succeeded(event_data)
    elif event_type == "payout.paid":
        handle_payout_paid(event_data)
    else:
        print(f"⚠ Unknown event type: {event_type}")


def handle_payment_succeeded(data: dict) -> None:
    """Handle successful payment event."""
    payment_id = data.get("id")
    amount = data.get("amount")
    currency = data.get("currency")
    metadata = data.get("metadata", {})
    order_id = metadata.get("order_id")

    print(f"✓ Payment succeeded: {payment_id}")
    print(f"  Amount: {amount} {currency}")
    print(f"  Order: {order_id}")

    # TODO: Update order status in database
    # TODO: Send confirmation email
    # TODO: Trigger fulfillment


def handle_payment_failed(data: dict) -> None:
    """Handle failed payment event."""
    payment_id = data.get("id")
    error = data.get("last_error", {})
    error_code = error.get("code", "unknown")

    print(f"✗ Payment failed: {payment_id}")
    print(f"  Error: {error_code}")

    # TODO: Update order status
    # TODO: Notify customer


def handle_payment_canceled(data: dict) -> None:
    """Handle canceled payment event."""
    payment_id = data.get("id")
    print(f"⊘ Payment canceled: {payment_id}")

    # TODO: Update order status


def handle_refund_created(data: dict) -> None:
    """Handle refund created event."""
    refund_id = data.get("id")
    amount = data.get("amount")
    print(f"↩ Refund created: {refund_id} ({amount})")

    # TODO: Store refund record


def handle_refund_succeeded(data: dict) -> None:
    """Handle refund succeeded event."""
    refund_id = data.get("id")
    print(f"✓ Refund succeeded: {refund_id}")

    # TODO: Update refund status
    # TODO: Notify customer


def handle_payout_paid(data: dict) -> None:
    """Handle payout paid event."""
    payout_id = data.get("id")
    amount = data.get("amount")
    print(f"💸 Payout paid: {payout_id} ({amount})")

    # TODO: Update payout status
    # TODO: Notify merchant


def verify_and_process(signature_header: str, raw_body: bytes) -> bool:
    """
    Verify signature and process webhook.

    Args:
        signature_header: Molam-Signature header value
        raw_body: Raw request body

    Returns:
        True if verification and processing succeeded
    """
    try:
        # Verify signature
        print("Verifying signature...")
        is_valid = verify_signature(
            signature_header,
            raw_body,
            get_secret_by_kid,
            tolerance_ms=5 * 60 * 1000,  # 5 minutes
        )

        if not is_valid:
            print("✗ Signature verification failed")
            return False

        print("✓ Signature verified")

        # Parse and process event
        event = json.loads(raw_body.decode("utf-8"))
        process_webhook_event(event)

        return True

    except SignatureError as e:
        print(f"✗ Signature error: {e}")
        return False

    except json.JSONDecodeError as e:
        print(f"✗ Invalid JSON: {e}")
        return False

    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False


# ============================================================================
# Flask Webhook Endpoint
# ============================================================================

def create_flask_app():
    """
    Create Flask app with webhook endpoint.

    Usage:
        export MOLAM_WEBHOOK_SECRET="whsec_..."
        python examples/webhook_receiver.py --server
    """
    try:
        from flask import Flask, request, jsonify
    except ImportError:
        print("Error: Flask not installed. Run: pip install flask")
        sys.exit(1)

    app = Flask(__name__)

    @app.route("/webhook/molam", methods=["POST"])
    def molam_webhook():
        """Molam webhook endpoint."""
        signature = request.headers.get("Molam-Signature", "")
        raw_body = request.get_data()

        print(f"\n{'=' * 60}")
        print("Webhook received")
        print(f"{'=' * 60}")
        print(f"Signature: {signature[:50]}...")
        print(f"Body size: {len(raw_body)} bytes")

        if verify_and_process(signature, raw_body):
            return jsonify({"status": "ok"}), 200
        else:
            return jsonify({"error": "Verification failed"}), 401

    @app.route("/health", methods=["GET"])
    def health():
        """Health check endpoint."""
        return jsonify({"status": "healthy"}), 200

    return app


# ============================================================================
# CLI Interface
# ============================================================================

def main():
    """Main CLI interface."""
    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        # Run Flask server
        print("Starting webhook server...")
        print("Webhook endpoint: http://localhost:5000/webhook/molam")
        print("Health check: http://localhost:5000/health")
        print("\nPress Ctrl+C to stop\n")

        app = create_flask_app()
        app.run(host="0.0.0.0", port=5000, debug=True)

    elif len(sys.argv) > 1:
        # Verify signature from command line
        signature_header = sys.argv[1]
        raw_body = sys.stdin.buffer.read()

        print(f"Signature: {signature_header}")
        print(f"Body: {raw_body.decode('utf-8')[:200]}...")
        print()

        if verify_and_process(signature_header, raw_body):
            print("\n✓ Verification successful")
            sys.exit(0)
        else:
            print("\n✗ Verification failed")
            sys.exit(1)

    else:
        print("Usage:")
        print("  # Start webhook server")
        print("  python examples/webhook_receiver.py --server")
        print()
        print("  # Verify signature from stdin")
        print("  echo '{...}' | python examples/webhook_receiver.py 't=...,v1=...,kid=1'")
        sys.exit(1)


if __name__ == "__main__":
    main()
