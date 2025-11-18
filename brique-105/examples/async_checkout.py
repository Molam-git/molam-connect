"""
Asynchronous checkout example using async/await.

Demonstrates async payment flow for use with FastAPI, aiohttp, etc.

Usage:
    export MOLAM_API_KEY="sk_test_..."
    python examples/async_checkout.py
"""

import sys
import os
import asyncio

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from molam_sdk.config import Config
from molam_sdk.async_client import MolamAsyncClient
from molam_sdk.exceptions import ApiError


async def main():
    """
    Main async checkout flow.
    """
    config = Config(
        api_key=os.getenv("MOLAM_API_KEY", "sk_test_xxx"),
        api_base=os.getenv("MOLAM_API_BASE", "https://staging-api.molam.com"),
        default_currency="USD",
    )

    print("=" * 60)
    print("Molam SDK - Asynchronous Checkout Example")
    print("=" * 60)

    async with MolamAsyncClient(config) as client:
        try:
            # Step 1: Create payment intent
            print("\n[1] Creating payment intent (async)...")
            payment_intent = await client.create_payment_intent(
                amount=3500,  # $35.00
                currency="USD",
                customer_id="cust_async_1",
                description="Async Order #AO-200",
                metadata={
                    "order_id": "AO-200",
                    "customer_email": "async@example.com",
                },
            )

            print(f"✓ Payment Intent created: {payment_intent['id']}")
            print(f"  Status: {payment_intent.get('status')}")

            payment_id = payment_intent['id']

            # Step 2: Retrieve payment (concurrently demonstrate async power)
            print("\n[2] Retrieving payment intent (async)...")
            retrieved = await client.retrieve_payment_intent(payment_id)
            print(f"✓ Retrieved: {retrieved['id']}")

            # Step 3: List payments concurrently
            print("\n[3] Running multiple async operations concurrently...")
            results = await asyncio.gather(
                client.list_payment_intents(limit=3),
                client.retrieve_payment_intent(payment_id),
                return_exceptions=True,
            )

            print(f"✓ Concurrent operations completed:")
            print(f"  - Listed {len(results[0].get('data', []))} payments")
            print(f"  - Retrieved payment: {results[1]['id']}")

            # Step 4: Cancel payment
            print(f"\n[4] Canceling payment intent...")
            canceled = await client.cancel_payment_intent(payment_id)
            print(f"✓ Payment canceled: {canceled['id']}")

            print("\n" + "=" * 60)
            print("✓ Async checkout flow completed!")
            print("=" * 60)

        except ApiError as e:
            print(f"\n✗ API Error: {e}")
            print(f"  Status: {e.status_code}")
            print(f"  Request ID: {e.request_id}")

        except Exception as e:
            print(f"\n✗ Error: {e}")
            import traceback
            traceback.print_exc()


async def concurrent_operations_example():
    """
    Demonstrate concurrent operations with async client.
    """
    config = Config(api_key=os.getenv("MOLAM_API_KEY", "sk_test_xxx"))

    print("\n" + "=" * 60)
    print("Concurrent Operations Example")
    print("=" * 60)

    async with MolamAsyncClient(config) as client:
        # Create multiple payment intents concurrently
        print("\nCreating 3 payment intents concurrently...")

        tasks = [
            client.create_payment_intent(
                amount=1000 * (i + 1),
                currency="USD",
                description=f"Concurrent payment {i+1}",
            )
            for i in range(3)
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, result in enumerate(results, 1):
            if isinstance(result, Exception):
                print(f"  Payment {i}: ✗ Failed - {result}")
            else:
                print(f"  Payment {i}: ✓ Created - {result['id']}")


if __name__ == "__main__":
    # Run main async flow
    asyncio.run(main())

    # Uncomment to run concurrent operations example
    # asyncio.run(concurrent_operations_example())
