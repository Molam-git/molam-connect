"""
Complete Payment Flow Example
"""

import os
from molam_sdk import MolamClient, ClientConfig, PaymentIntentCreate


def main():
    # Setup client
    config = ClientConfig(
        api_key=os.getenv("MOLAM_API_KEY"),
        base_url=os.getenv("MOLAM_BASE_URL", "https://sandbox.api.molam.io"),
    )
    client = MolamClient(config)

    # Create payment intent with all options
    print("Creating payment intent with advanced options...")
    payment_intent = client.create_payment_intent(
        PaymentIntentCreate(
            amount=250.00,
            currency="XOF",  # West African CFA Franc
            capture=False,  # Manual capture
            customer_id="cust_123",
            merchant_id="merch_456",
            description="Premium subscription - Monthly",
            metadata={"subscription_id": "sub_789", "plan": "premium", "billing_cycle": "monthly"},
            return_url="https://example.com/payment/success",
            cancel_url="https://example.com/payment/cancel",
            payment_methods=["wallet", "card", "mobile_money"],
        ),
        idempotency_key=f"sub-789-2025-01",  # Use unique subscription billing ID
    )

    print(f"\n✓ Payment Intent Created")
    print(f"  ID: {payment_intent.id}")
    print(f"  Status: {payment_intent.status}")
    print(f"  Amount: {payment_intent.amount} {payment_intent.currency}")
    print(f"  Redirect URL: {payment_intent.redirect_url}")

    # In a real application, redirect customer to payment_intent.redirect_url
    # Customer completes payment
    # Webhook notification sent to your server

    # Simulate confirmation (normally done after customer authorization)
    # confirm = input("\nConfirm payment? (y/n): ")
    # if confirm.lower() == 'y':
    #     confirmed = client.confirm_payment_intent(payment_intent.id)
    #     print(f"\n✓ Payment Confirmed")
    #     print(f"  New Status: {confirmed.status}")


if __name__ == "__main__":
    main()
