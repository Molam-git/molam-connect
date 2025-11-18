"""
Molam SDK Quickstart Example
"""

import os
from molam_sdk import MolamClient, ClientConfig, PaymentIntentCreate


def main():
    # Initialize client with configuration
    config = ClientConfig(
        api_key=os.getenv("MOLAM_API_KEY", "sk_test_xxx"),
        base_url=os.getenv("MOLAM_BASE_URL", "https://sandbox.api.molam.io"),
        default_currency="USD",
        debug=True,  # Enable debug logging
    )

    client = MolamClient(config)

    # Create payment intent
    print("Creating payment intent...")
    payment_intent = client.create_payment_intent(
        PaymentIntentCreate(
            amount=100.50,
            currency="USD",
            description="Test payment",
            metadata={"order_id": "12345"},
        ),
        idempotency_key="order-12345",  # Use your order ID for idempotency
    )

    print(f"✓ Payment Intent created: {payment_intent.id}")
    print(f"  Status: {payment_intent.status}")
    print(f"  Amount: {payment_intent.amount} {payment_intent.currency}")

    # Retrieve payment intent
    print(f"\nRetrieving payment intent {payment_intent.id}...")
    retrieved = client.retrieve_payment_intent(payment_intent.id)
    print(f"✓ Retrieved: {retrieved.id} ({retrieved.status})")

    # Confirm payment (in production, this would happen after customer authorization)
    # print(f"\nConfirming payment intent...")
    # confirmed = client.confirm_payment_intent(payment_intent.id)
    # print(f"✓ Confirmed: {confirmed.status}")

    print("\n✓ Quickstart complete!")


if __name__ == "__main__":
    main()
