"""
Molam Python SDK - Usage Examples
"""

from molam_sdk import MolamSDK, MolamException
import time

# Initialize SDK with your secret key
molam = MolamSDK('sk_test_1234567890abcdef')

print("Molam Python SDK Examples")
print(f"Environment: {molam.environment}\n")


def create_payment_intent():
    """Example 1: Create a payment intent"""
    try:
        intent = molam.payment_intents.create(
            amount=99.99,
            currency='USD',
            customer_email='customer@example.com',
            customer_name='John Doe',
            description='Premium Plan Subscription',
            metadata={
                'order_id': 'order_12345',
                'customer_id': 'cus_abc123'
            }
        )

        print("Payment intent created:")
        print(f"  ID: {intent['intent_reference']}")
        print(f"  Amount: {intent['amount']} {intent['currency']}")
        print(f"  Client secret: {intent['client_secret']}\n")

        return intent
    except MolamException as e:
        print(f"Error creating payment intent:")
        print(f"  Code: {e.code}")
        print(f"  Status: {e.status_code}")
        print(f"  Message: {e}\n")
        raise


def retrieve_payment_intent(intent_id):
    """Example 2: Retrieve a payment intent"""
    try:
        intent = molam.payment_intents.retrieve(intent_id)
        print("Payment intent retrieved:")
        print(f"  ID: {intent['intent_reference']}")
        print(f"  Status: {intent['status']}")
        print(f"  Amount: {intent['amount']} {intent['currency']}\n")
        return intent
    except MolamException as e:
        print(f"Error retrieving payment intent: {e}\n")
        raise


def confirm_payment_intent(intent_id, payment_method_token):
    """Example 3: Confirm a payment intent"""
    try:
        result = molam.payment_intents.confirm(intent_id, payment_method_token)
        print("Payment confirmed:")
        print(f"  ID: {result['intent_reference']}")
        print(f"  Status: {result['status']}\n")
        return result
    except MolamException as e:
        print(f"Error confirming payment: {e}\n")
        raise


def cancel_payment_intent(intent_id):
    """Example 4: Cancel a payment intent"""
    try:
        result = molam.payment_intents.cancel(intent_id)
        print("Payment canceled:")
        print(f"  ID: {result['intent_reference']}")
        print(f"  Status: {result['status']}\n")
        return result
    except MolamException as e:
        print(f"Error canceling payment: {e}\n")
        raise


def generate_api_keys():
    """Example 5: Generate API keys"""
    try:
        # Generate test publishable key
        test_key = molam.api_keys.create(
            merchant_id='merchant_abc123',
            key_type='publishable',
            environment='test'
        )
        print(f"Test publishable key created: {test_key['api_key']}")

        # Generate live secret key
        live_key = molam.api_keys.create(
            merchant_id='merchant_abc123',
            key_type='secret',
            environment='live'
        )
        print(f"Live secret key created: {live_key['api_key']}\n")

        return {'test_key': test_key, 'live_key': live_key}
    except MolamException as e:
        print(f"Error generating API keys: {e}\n")
        raise


def list_api_keys(merchant_id):
    """Example 6: List API keys"""
    try:
        result = molam.api_keys.list(merchant_id)
        print(f"Found {len(result['keys'])} API keys:")
        for key in result['keys']:
            print(f"  - {key['key_type']} ({key['environment']}): {key['key_prefix']}...{key['key_suffix']}")
        print()
        return result
    except MolamException as e:
        print(f"Error listing API keys: {e}\n")
        raise


def log_custom_event():
    """Example 7: Log custom events"""
    try:
        molam.logs.create(
            event_type='custom_event',
            platform='python_server',
            payload={
                'action': 'subscription_created',
                'plan': 'premium',
                'user_id': 'user_123'
            }
        )
        print("Custom event logged\n")
    except MolamException as e:
        print(f"Error logging event: {e}\n")


def complete_payment_flow():
    """Example 8: Complete payment flow"""
    try:
        print("=== Starting Complete Payment Flow ===\n")

        # Step 1: Create payment intent
        print("Step 1: Creating payment intent...")
        intent = molam.payment_intents.create(
            amount=49.99,
            currency='USD',
            customer_email='demo@example.com',
            description='Demo Product Purchase'
        )
        print(f"✓ Payment intent created: {intent['intent_reference']}\n")

        # Step 2: Client would collect payment method and get token
        print("Step 2: Client collects payment method...")
        mock_payment_method_token = f"pm_test_{int(time.time())}"
        print(f"✓ Payment method tokenized: {mock_payment_method_token}\n")

        # Step 3: Confirm payment intent
        print("Step 3: Confirming payment...")
        confirmed = molam.payment_intents.confirm(
            intent['intent_reference'],
            mock_payment_method_token
        )
        print(f"✓ Payment confirmed: {confirmed['status']}\n")

        # Step 4: Retrieve final status
        print("Step 4: Retrieving final status...")
        final = molam.payment_intents.retrieve(intent['intent_reference'])
        print(f"✓ Final status: {final['status']}")
        print(f"✓ Amount: {final['amount']} {final['currency']}\n")

        print("=== Payment Flow Completed Successfully ===\n")

        return final
    except MolamException as e:
        print(f"Error in payment flow: {e}\n")
        raise


def error_handling_example():
    """Example 9: Error handling"""
    try:
        # This will fail with validation error
        molam.payment_intents.create(
            amount=-10,  # Invalid amount
            currency='USD'
        )
    except ValueError as e:
        print("Validation Error:")
        print(f"  Message: {e}\n")
    except MolamException as e:
        print("Molam API Error:")
        print(f"  Code: {e.code}")
        print(f"  Status: {e.status_code}")
        print(f"  Message: {e}\n")


def webhook_handler(request_data):
    """Example 10: Webhook handler (Flask/Django)"""
    event = request_data  # Assuming request_data is already parsed JSON

    print("Webhook received:")
    print(f"  Event type: {event.get('event_type', 'unknown')}")
    print(f"  Data: {event.get('data', {})}\n")

    # Handle different event types
    event_type = event.get('event_type', '')

    if event_type == 'payment_intent.succeeded':
        # Fulfill order, send confirmation email, etc.
        print("Payment successful! Fulfilling order...")
    elif event_type == 'payment_intent.failed':
        # Notify customer, retry logic, etc.
        print("Payment failed! Notifying customer...")
    else:
        print("Unknown event type")

    return {'received': True}


# Context manager for SDK
class MolamContext:
    """Context manager for Molam SDK (useful for connection pooling)"""

    def __init__(self, api_key):
        self.api_key = api_key
        self.sdk = None

    def __enter__(self):
        self.sdk = MolamSDK(self.api_key)
        return self.sdk

    def __exit__(self, exc_type, exc_val, exc_tb):
        # Cleanup if needed
        pass


# Run examples
if __name__ == '__main__':
    try:
        complete_payment_flow()
    except Exception as e:
        print(f"Error: {e}")
