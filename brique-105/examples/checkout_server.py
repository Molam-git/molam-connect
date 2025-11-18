"""
Synchronous checkout server example.

Demonstrates basic payment flow using Molam SDK.

Usage:
    export MOLAM_API_KEY="sk_test_..."
    export MOLAM_API_BASE="https://staging-api.molam.com"
    python examples/checkout_server.py
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from molam_sdk.config import Config
from molam_sdk.client import MolamClient
from molam_sdk.exceptions import ApiError, ValidationError


def main():
    """
    Main checkout flow demonstration.
    """
    # Initialize SDK
    config = Config(
        api_key=os.getenv("MOLAM_API_KEY", "sk_test_xxx"),
        api_base=os.getenv("MOLAM_API_BASE", "https://staging-api.molam.com"),
        default_currency="USD",
    )

    client = MolamClient(config)

    print("=" * 60)
    print("Molam SDK - Synchronous Checkout Example")
    print("=" * 60)

    try:
        # Step 1: Create payment intent
        print("\n[1] Creating payment intent...")
        payment_intent = client.create_payment_intent(
            amount=2500,  # $25.00 in cents
            currency="USD",
            customer_id="cust_12",
            description="Order #ORD-100",
            metadata={
                "order_id": "ORD-100",
                "customer_email": "customer@example.com",
            },
            capture=False,  # Manual capture
            return_url="https://example.com/success",
            cancel_url="https://example.com/cancel",
        )

        print(f"✓ Payment Intent created: {payment_intent['id']}")
        print(f"  Status: {payment_intent.get('status')}")
        print(f"  Amount: {payment_intent.get('amount')} {payment_intent.get('currency')}")

        payment_id = payment_intent['id']

        # Step 2: Retrieve payment intent
        print(f"\n[2] Retrieving payment intent {payment_id}...")
        retrieved = client.retrieve_payment_intent(payment_id)
        print(f"✓ Retrieved payment intent: {retrieved['id']}")
        print(f"  Status: {retrieved.get('status')}")

        # Step 3: Confirm payment (after client provides payment method)
        print(f"\n[3] Confirming payment intent...")
        # In production, this would be called after client provides payment method
        # confirmed = client.confirm_payment_intent(payment_id)
        # print(f"✓ Payment confirmed: {confirmed['id']}")
        # print(f"  Status: {confirmed.get('status')}")
        print("  (Skipped - would require payment method)")

        # Step 4: List payment intents
        print("\n[4] Listing recent payment intents...")
        payments_list = client.list_payment_intents(limit=5)
        print(f"✓ Found {len(payments_list.get('data', []))} payment intents")

        # Step 5: Cancel payment (optional)
        print(f"\n[5] Canceling payment intent...")
        canceled = client.cancel_payment_intent(payment_id)
        print(f"✓ Payment canceled: {canceled['id']}")
        print(f"  Status: {canceled.get('status')}")

        print("\n" + "=" * 60)
        print("✓ Checkout flow completed successfully!")
        print("=" * 60)

    except ValidationError as e:
        print(f"\n✗ Validation Error: {e}")
        if e.errors:
            print("  Errors:")
            for field, error in e.errors.items():
                print(f"    - {field}: {error}")

    except ApiError as e:
        print(f"\n✗ API Error: {e}")
        print(f"  Status Code: {e.status_code}")
        print(f"  Request ID: {e.request_id}")
        if e.payload:
            print(f"  Payload: {e.payload}")

    except Exception as e:
        print(f"\n✗ Unexpected Error: {e}")
        import traceback
        traceback.print_exc()


def refund_example():
    """
    Refund flow demonstration.
    """
    config = Config(api_key=os.getenv("MOLAM_API_KEY", "sk_test_xxx"))
    client = MolamClient(config)

    print("\n" + "=" * 60)
    print("Refund Example")
    print("=" * 60)

    try:
        # Create refund
        print("\n[1] Creating full refund for charge...")
        refund = client.create_refund(
            charge_id="ch_test_123",  # Replace with actual charge ID
            reason="requested_by_customer",
            metadata={"support_ticket": "TKT-456"},
        )
        print(f"✓ Refund created: {refund['id']}")
        print(f"  Amount: {refund.get('amount')}")
        print(f"  Status: {refund.get('status')}")

    except ApiError as e:
        print(f"✗ API Error: {e}")


def payout_example():
    """
    Payout flow demonstration (Treasury API).
    """
    config = Config(api_key=os.getenv("MOLAM_API_KEY", "sk_test_xxx"))
    client = MolamClient(config)

    print("\n" + "=" * 60)
    print("Payout Example (Treasury)")
    print("=" * 60)

    try:
        # Create payout
        print("\n[1] Creating payout...")
        payout = client.create_payout(
            origin_module="connect",
            origin_entity_id="merch_123",
            amount=500.00,
            currency="USD",
            beneficiary={
                "type": "bank_account",
                "bank_code": "123456",
                "account_number": "9876543210",
                "account_holder": "Jane Doe",
            },
            metadata={"payout_batch": "BATCH-2025-01"},
        )
        print(f"✓ Payout created: {payout['id']}")
        print(f"  Amount: {payout.get('amount')} {payout.get('currency')}")
        print(f"  Status: {payout.get('status')}")

    except ApiError as e:
        print(f"✗ API Error: {e}")


if __name__ == "__main__":
    main()

    # Uncomment to run additional examples
    # refund_example()
    # payout_example()
