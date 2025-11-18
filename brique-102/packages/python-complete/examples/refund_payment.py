"""
Refund Example
"""

import os
from molam_sdk import MolamClient, ClientConfig, RefundCreate


def main():
    # Setup client
    config = ClientConfig(
        api_key=os.getenv("MOLAM_API_KEY"),
        base_url=os.getenv("MOLAM_BASE_URL", "https://sandbox.api.molam.io"),
    )
    client = MolamClient(config)

    # Full refund
    print("Creating full refund...")
    refund = client.create_refund(
        RefundCreate(
            payment_id="pi_abc123",  # Payment intent ID to refund
            reason="customer_request",
            metadata={"ticket_id": "TICKET-789"},
        ),
        idempotency_key="refund-pi_abc123-full",
    )

    print(f"\n✓ Full Refund Created")
    print(f"  ID: {refund.id}")
    print(f"  Payment ID: {refund.payment_id}")
    print(f"  Amount: {refund.amount} {refund.currency}")
    print(f"  Status: {refund.status}")

    # Partial refund
    print("\n\nCreating partial refund...")
    partial_refund = client.create_refund(
        RefundCreate(
            payment_id="pi_def456",
            amount=50.00,  # Partial amount
            reason="product_return",
            metadata={"items": "item-1"},
        ),
        idempotency_key="refund-pi_def456-partial-50",
    )

    print(f"\n✓ Partial Refund Created")
    print(f"  ID: {partial_refund.id}")
    print(f"  Amount: {partial_refund.amount} {partial_refund.currency}")

    # Retrieve refund
    print(f"\n\nRetrieving refund {refund.id}...")
    retrieved = client.retrieve_refund(refund.id)
    print(f"✓ Retrieved: {retrieved.id} ({retrieved.status})")


if __name__ == "__main__":
    main()
