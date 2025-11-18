<?php

/**
 * Molam PHP SDK - Usage Examples
 */

require_once 'MolamSDK.php';

use Molam\MolamSDK;
use Molam\MolamException;

// Initialize SDK with your secret key
$molam = new MolamSDK('sk_test_1234567890abcdef');

echo "Molam PHP SDK Examples\n";
echo "Environment: " . $molam->getEnvironment() . "\n\n";

/**
 * Example 1: Create a payment intent
 */
function createPaymentIntent($molam)
{
    try {
        $intent = $molam->paymentIntents->create([
            'amount' => 99.99,
            'currency' => 'USD',
            'customer_email' => 'customer@example.com',
            'customer_name' => 'John Doe',
            'description' => 'Premium Plan Subscription',
            'metadata' => [
                'order_id' => 'order_12345',
                'customer_id' => 'cus_abc123'
            ]
        ]);

        echo "Payment intent created:\n";
        echo "  ID: " . $intent['intent_reference'] . "\n";
        echo "  Amount: " . $intent['amount'] . " " . $intent['currency'] . "\n";
        echo "  Client secret: " . $intent['client_secret'] . "\n\n";

        return $intent;
    } catch (MolamException $e) {
        echo "Error creating payment intent:\n";
        echo "  Code: " . $e->code . "\n";
        echo "  Status: " . $e->statusCode . "\n";
        echo "  Message: " . $e->getMessage() . "\n\n";
        throw $e;
    }
}

/**
 * Example 2: Retrieve a payment intent
 */
function retrievePaymentIntent($molam, $intentId)
{
    try {
        $intent = $molam->paymentIntents->retrieve($intentId);
        echo "Payment intent retrieved:\n";
        echo "  ID: " . $intent['intent_reference'] . "\n";
        echo "  Status: " . $intent['status'] . "\n";
        echo "  Amount: " . $intent['amount'] . " " . $intent['currency'] . "\n\n";
        return $intent;
    } catch (MolamException $e) {
        echo "Error retrieving payment intent: " . $e->getMessage() . "\n\n";
        throw $e;
    }
}

/**
 * Example 3: Confirm a payment intent
 */
function confirmPaymentIntent($molam, $intentId, $paymentMethodToken)
{
    try {
        $result = $molam->paymentIntents->confirm($intentId, $paymentMethodToken);
        echo "Payment confirmed:\n";
        echo "  ID: " . $result['intent_reference'] . "\n";
        echo "  Status: " . $result['status'] . "\n\n";
        return $result;
    } catch (MolamException $e) {
        echo "Error confirming payment: " . $e->getMessage() . "\n\n";
        throw $e;
    }
}

/**
 * Example 4: Cancel a payment intent
 */
function cancelPaymentIntent($molam, $intentId)
{
    try {
        $result = $molam->paymentIntents->cancel($intentId);
        echo "Payment canceled:\n";
        echo "  ID: " . $result['intent_reference'] . "\n";
        echo "  Status: " . $result['status'] . "\n\n";
        return $result;
    } catch (MolamException $e) {
        echo "Error canceling payment: " . $e->getMessage() . "\n\n";
        throw $e;
    }
}

/**
 * Example 5: Generate API keys
 */
function generateApiKeys($molam)
{
    try {
        // Generate test publishable key
        $testKey = $molam->apiKeys->create([
            'merchant_id' => 'merchant_abc123',
            'key_type' => 'publishable',
            'environment' => 'test'
        ]);
        echo "Test publishable key created: " . $testKey['api_key'] . "\n";

        // Generate live secret key
        $liveKey = $molam->apiKeys->create([
            'merchant_id' => 'merchant_abc123',
            'key_type' => 'secret',
            'environment' => 'live'
        ]);
        echo "Live secret key created: " . $liveKey['api_key'] . "\n\n";

        return ['testKey' => $testKey, 'liveKey' => $liveKey];
    } catch (MolamException $e) {
        echo "Error generating API keys: " . $e->getMessage() . "\n\n";
        throw $e;
    }
}

/**
 * Example 6: List API keys
 */
function listApiKeys($molam, $merchantId)
{
    try {
        $result = $molam->apiKeys->listKeys($merchantId);
        echo "Found " . count($result['keys']) . " API keys:\n";
        foreach ($result['keys'] as $key) {
            echo "  - " . $key['key_type'] . " (" . $key['environment'] . "): ";
            echo $key['key_prefix'] . "..." . $key['key_suffix'] . "\n";
        }
        echo "\n";
        return $result;
    } catch (MolamException $e) {
        echo "Error listing API keys: " . $e->getMessage() . "\n\n";
        throw $e;
    }
}

/**
 * Example 7: Log custom events
 */
function logCustomEvent($molam)
{
    try {
        $molam->logs->create([
            'event_type' => 'custom_event',
            'platform' => 'php_server',
            'payload' => [
                'action' => 'subscription_created',
                'plan' => 'premium',
                'user_id' => 'user_123'
            ]
        ]);
        echo "Custom event logged\n\n";
    } catch (MolamException $e) {
        echo "Error logging event: " . $e->getMessage() . "\n\n";
    }
}

/**
 * Example 8: Complete payment flow
 */
function completePaymentFlow($molam)
{
    try {
        echo "=== Starting Complete Payment Flow ===\n\n";

        // Step 1: Create payment intent
        echo "Step 1: Creating payment intent...\n";
        $intent = $molam->paymentIntents->create([
            'amount' => 49.99,
            'currency' => 'USD',
            'customer_email' => 'demo@example.com',
            'description' => 'Demo Product Purchase'
        ]);
        echo "✓ Payment intent created: " . $intent['intent_reference'] . "\n\n";

        // Step 2: Client would collect payment method and get token
        echo "Step 2: Client collects payment method...\n";
        $mockPaymentMethodToken = 'pm_test_' . time();
        echo "✓ Payment method tokenized: $mockPaymentMethodToken\n\n";

        // Step 3: Confirm payment intent
        echo "Step 3: Confirming payment...\n";
        $confirmed = $molam->paymentIntents->confirm(
            $intent['intent_reference'],
            $mockPaymentMethodToken
        );
        echo "✓ Payment confirmed: " . $confirmed['status'] . "\n\n";

        // Step 4: Retrieve final status
        echo "Step 4: Retrieving final status...\n";
        $final = $molam->paymentIntents->retrieve($intent['intent_reference']);
        echo "✓ Final status: " . $final['status'] . "\n";
        echo "✓ Amount: " . $final['amount'] . " " . $final['currency'] . "\n\n";

        echo "=== Payment Flow Completed Successfully ===\n\n";

        return $final;
    } catch (MolamException $e) {
        echo "Error in payment flow: " . $e->getMessage() . "\n\n";
        throw $e;
    }
}

/**
 * Example 9: Webhook handler
 */
function handleWebhook()
{
    // Get raw POST data
    $payload = file_get_contents('php://input');
    $event = json_decode($payload, true);

    echo "Webhook received:\n";
    echo "  Event type: " . ($event['event_type'] ?? 'unknown') . "\n";
    echo "  Data: " . json_encode($event['data'] ?? []) . "\n\n";

    // Handle different event types
    switch ($event['event_type'] ?? '') {
        case 'payment_intent.succeeded':
            // Fulfill order, send confirmation email, etc.
            echo "Payment successful! Fulfilling order...\n";
            break;

        case 'payment_intent.failed':
            // Notify customer, retry logic, etc.
            echo "Payment failed! Notifying customer...\n";
            break;

        default:
            echo "Unknown event type\n";
    }

    // Return 200 OK
    http_response_code(200);
    echo json_encode(['received' => true]);
}

// Run examples
try {
    completePaymentFlow($molam);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
