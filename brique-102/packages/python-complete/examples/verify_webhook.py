"""
Webhook Verification Example (Flask)
"""

import os
from flask import Flask, request, jsonify
from molam_sdk import MolamClient

app = Flask(__name__)


def get_secret_by_kid(kid: str) -> str:
    """
    Retrieve webhook secret by key ID

    In production:
    - Fetch from Vault/KMS
    - Support multiple secrets for rotation
    - Never store secrets in plaintext
    """
    secrets = {
        "v1": os.getenv("MOLAM_WEBHOOK_SECRET_V1"),
        "v2": os.getenv("MOLAM_WEBHOOK_SECRET_V2"),
    }
    return secrets.get(kid, "")


@app.route("/webhooks/molam", methods=["POST"])
def molam_webhook():
    """Handle Molam webhook"""

    # Get signature header
    signature = request.headers.get("Molam-Signature")
    if not signature:
        return jsonify({"error": "Missing signature"}), 401

    # Get raw body
    raw_body = request.get_data()

    # Verify signature
    try:
        MolamClient.verify_webhook_signature(signature, raw_body, get_secret_by_kid)
    except Exception as e:
        print(f"Webhook verification failed: {e}")
        return jsonify({"error": "Invalid signature"}), 401

    # Parse event
    event = request.get_json()

    # Handle event type
    event_type = event.get("type")

    if event_type == "payment.succeeded":
        handle_payment_succeeded(event)
    elif event_type == "payment.failed":
        handle_payment_failed(event)
    elif event_type == "refund.created":
        handle_refund_created(event)
    else:
        print(f"Unhandled event type: {event_type}")

    return jsonify({"ok": True}), 200


def handle_payment_succeeded(event):
    """Handle successful payment"""
    payment = event["data"]
    print(f"✓ Payment succeeded: {payment['id']}")
    print(f"  Amount: {payment['amount']} {payment['currency']}")

    # Update your database
    # Send confirmation email
    # Fulfill order
    # etc.


def handle_payment_failed(event):
    """Handle failed payment"""
    payment = event["data"]
    print(f"✗ Payment failed: {payment['id']}")
    print(f"  Error: {payment.get('error', {}).get('message')}")

    # Update order status
    # Notify customer
    # etc.


def handle_refund_created(event):
    """Handle refund creation"""
    refund = event["data"]
    print(f"↻ Refund created: {refund['id']}")
    print(f"  Amount: {refund['amount']} {refund['currency']}")

    # Update order status
    # Send refund confirmation
    # etc.


if __name__ == "__main__":
    # For production, use a proper WSGI server like gunicorn
    # gunicorn -w 4 -b 0.0.0.0:5000 verify_webhook:app

    app.run(debug=True, port=5000)
