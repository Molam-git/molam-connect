"""
CLI Demo for Molam Python SDK

Quick demonstration of SDK capabilities from command line.
Useful for testing and debugging.

Usage:
    python cli_demo.py create-payment
    python cli_demo.py get-payment pi_123
    python cli_demo.py list-payments
"""

import os
import sys
import uuid
import argparse
import logging

from molam_sdk import MolamSyncClient, ClientConfig, PaymentIntentCreate, RefundCreate
from molam_sdk.exceptions import APIError, NetworkError

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def get_client() -> MolamSyncClient:
    """Initialize Molam client from environment variables"""
    api_key = os.getenv("MOLAM_API_KEY")
    if not api_key:
        logger.error("MOLAM_API_KEY environment variable not set")
        sys.exit(1)

    config = ClientConfig(
        api_key=api_key,
        base_url=os.getenv("MOLAM_BASE_URL", "https://sandbox.api.molam.io"),
        timeout_connect=5.0,
        timeout_read=15.0,
    )

    return MolamSyncClient(config)


def create_payment(client: MolamSyncClient, amount: float, currency: str):
    """Create a payment intent"""
    try:
        payload = PaymentIntentCreate(
            amount=amount,
            currency=currency,
            description=f"CLI Demo Payment - {amount} {currency}",
            return_url="https://merchant.example.com/return",
            cancel_url="https://merchant.example.com/cancel",
            metadata={"source": "cli_demo", "demo": "true"},
        )

        idempotency_key = f"cli-{uuid.uuid4()}"

        payment = client.create_payment_intent(payload, idempotency_key=idempotency_key)

        logger.info(f"✓ Payment intent created successfully")
        print(f"\nPayment Intent ID: {payment.id}")
        print(f"Status: {payment.status}")
        print(f"Amount: {payment.amount} {payment.currency}")
        if payment.redirect_url:
            print(f"Redirect URL: {payment.redirect_url}")

        return payment

    except APIError as e:
        logger.error(f"API Error: {e.message}")
        sys.exit(1)
    except NetworkError as e:
        logger.error(f"Network Error: {e}")
        sys.exit(1)


def get_payment(client: MolamSyncClient, payment_id: str):
    """Retrieve a payment intent"""
    try:
        payment = client.retrieve_payment_intent(payment_id)

        logger.info(f"✓ Payment intent retrieved successfully")
        print(f"\nPayment Intent ID: {payment.id}")
        print(f"Status: {payment.status}")
        print(f"Amount: {payment.amount} {payment.currency}")
        print(f"Created: {payment.created_at}")

        if payment.description:
            print(f"Description: {payment.description}")

        return payment

    except APIError as e:
        logger.error(f"API Error: {e.message}")
        sys.exit(1)


def confirm_payment(client: MolamSyncClient, payment_id: str):
    """Confirm a payment intent"""
    try:
        idempotency_key = f"cli-confirm-{uuid.uuid4()}"

        confirmed = client.confirm_payment_intent(payment_id, idempotency_key=idempotency_key)

        logger.info(f"✓ Payment confirmed successfully")
        print(f"\nPayment Intent ID: {confirmed.id}")
        print(f"Status: {confirmed.status}")

        return confirmed

    except APIError as e:
        logger.error(f"API Error: {e.message}")
        sys.exit(1)


def create_refund(client: MolamSyncClient, payment_id: str, amount: float = None):
    """Create a refund"""
    try:
        payload = RefundCreate(
            payment_id=payment_id,
            amount=amount,  # None = full refund
            reason="requested_by_customer",
            metadata={"source": "cli_demo"},
        )

        idempotency_key = f"cli-refund-{uuid.uuid4()}"

        refund = client.create_refund(payload, idempotency_key=idempotency_key)

        logger.info(f"✓ Refund created successfully")
        print(f"\nRefund ID: {refund.id}")
        print(f"Payment ID: {refund.payment_id}")
        print(f"Amount: {refund.amount} {refund.currency}")
        print(f"Status: {refund.status}")

        return refund

    except APIError as e:
        logger.error(f"API Error: {e.message}")
        sys.exit(1)


def run_demo(client: MolamSyncClient):
    """Run complete demo flow"""
    print("\n" + "=" * 60)
    print("Molam Python SDK - CLI Demo")
    print("=" * 60 + "\n")

    # Step 1: Create payment
    print("Step 1: Creating payment intent...")
    payment = create_payment(client, amount=49.99, currency="EUR")

    # Step 2: Retrieve payment
    print("\n" + "-" * 60)
    print("Step 2: Retrieving payment intent...")
    get_payment(client, payment.id)

    # Step 3: Confirm payment (optional, based on workflow)
    print("\n" + "-" * 60)
    print("Step 3: Confirming payment intent...")
    confirm_payment(client, payment.id)

    # Step 4: Create refund
    print("\n" + "-" * 60)
    print("Step 4: Creating refund (partial)...")
    create_refund(client, payment.id, amount=10.00)

    print("\n" + "=" * 60)
    print("Demo completed successfully!")
    print("=" * 60 + "\n")


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(description="Molam Python SDK CLI Demo")
    subparsers = parser.add_parsers(dest="command", help="Commands")

    # create-payment command
    create_parser = subparsers.add_parser("create-payment", help="Create a payment intent")
    create_parser.add_argument("--amount", type=float, default=49.99, help="Payment amount")
    create_parser.add_argument("--currency", default="USD", help="Currency code")

    # get-payment command
    get_parser = subparsers.add_parser("get-payment", help="Retrieve a payment intent")
    get_parser.add_argument("payment_id", help="Payment intent ID")

    # confirm-payment command
    confirm_parser = subparsers.add_parser("confirm-payment", help="Confirm a payment intent")
    confirm_parser.add_argument("payment_id", help="Payment intent ID")

    # create-refund command
    refund_parser = subparsers.add_parser("create-refund", help="Create a refund")
    refund_parser.add_argument("payment_id", help="Payment intent ID")
    refund_parser.add_argument("--amount", type=float, help="Refund amount (full if not specified)")

    # demo command
    subparsers.add_parser("demo", help="Run complete demo flow")

    args = parser.parse_args()

    # Initialize client
    client = get_client()

    # Execute command
    if args.command == "create-payment":
        create_payment(client, args.amount, args.currency)
    elif args.command == "get-payment":
        get_payment(client, args.payment_id)
    elif args.command == "confirm-payment":
        confirm_payment(client, args.payment_id)
    elif args.command == "create-refund":
        create_refund(client, args.payment_id, args.amount)
    elif args.command == "demo":
        run_demo(client)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
