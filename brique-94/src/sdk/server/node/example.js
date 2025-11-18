/**
 * Molam Node.js SDK - Usage Examples
 */

const Molam = require('./molam-sdk');

// Initialize SDK with your secret key
const molam = new Molam('sk_test_1234567890abcdef');

/**
 * Example 1: Create a payment intent
 */
async function createPaymentIntent() {
  try {
    const intent = await molam.paymentIntents.create({
      amount: 99.99,
      currency: 'USD',
      customer_email: 'customer@example.com',
      customer_name: 'John Doe',
      description: 'Premium Plan Subscription',
      metadata: {
        order_id: 'order_12345',
        customer_id: 'cus_abc123'
      }
    });

    console.log('Payment intent created:', intent);
    console.log('Client secret:', intent.client_secret);

    return intent;
  } catch (error) {
    console.error('Error creating payment intent:', error.message);
    throw error;
  }
}

/**
 * Example 2: Retrieve a payment intent
 */
async function retrievePaymentIntent(intentId) {
  try {
    const intent = await molam.paymentIntents.retrieve(intentId);
    console.log('Payment intent retrieved:', intent);
    return intent;
  } catch (error) {
    console.error('Error retrieving payment intent:', error.message);
    throw error;
  }
}

/**
 * Example 3: Confirm a payment intent (server-side)
 */
async function confirmPaymentIntent(intentId, paymentMethodToken) {
  try {
    const result = await molam.paymentIntents.confirm(intentId, paymentMethodToken);
    console.log('Payment confirmed:', result);
    return result;
  } catch (error) {
    console.error('Error confirming payment:', error.message);
    throw error;
  }
}

/**
 * Example 4: Cancel a payment intent
 */
async function cancelPaymentIntent(intentId) {
  try {
    const result = await molam.paymentIntents.cancel(intentId);
    console.log('Payment canceled:', result);
    return result;
  } catch (error) {
    console.error('Error canceling payment:', error.message);
    throw error;
  }
}

/**
 * Example 5: Generate API keys (requires admin/owner role)
 */
async function generateApiKeys() {
  try {
    // Generate test publishable key
    const testKey = await molam.apiKeys.create({
      merchant_id: 'merchant_abc123',
      key_type: 'publishable',
      environment: 'test'
    });
    console.log('Test publishable key created:', testKey.api_key);

    // Generate live secret key
    const liveKey = await molam.apiKeys.create({
      merchant_id: 'merchant_abc123',
      key_type: 'secret',
      environment: 'live'
    });
    console.log('Live secret key created:', liveKey.api_key);

    return { testKey, liveKey };
  } catch (error) {
    console.error('Error generating API keys:', error.message);
    throw error;
  }
}

/**
 * Example 6: List API keys for a merchant
 */
async function listApiKeys(merchantId) {
  try {
    const result = await molam.apiKeys.list(merchantId);
    console.log(`Found ${result.keys.length} API keys:`);
    result.keys.forEach(key => {
      console.log(`  - ${key.key_type} (${key.environment}): ${key.key_prefix}...${key.key_suffix}`);
    });
    return result;
  } catch (error) {
    console.error('Error listing API keys:', error.message);
    throw error;
  }
}

/**
 * Example 7: Log custom events
 */
async function logCustomEvent() {
  try {
    await molam.logs.create({
      event_type: 'custom_event',
      platform: 'node_server',
      payload: {
        action: 'subscription_created',
        plan: 'premium',
        user_id: 'user_123'
      }
    });
    console.log('Custom event logged');
  } catch (error) {
    console.error('Error logging event:', error.message);
  }
}

/**
 * Example 8: Complete payment flow
 */
async function completePaymentFlow() {
  try {
    console.log('=== Starting Complete Payment Flow ===\n');

    // Step 1: Create payment intent
    console.log('Step 1: Creating payment intent...');
    const intent = await molam.paymentIntents.create({
      amount: 49.99,
      currency: 'USD',
      customer_email: 'demo@example.com',
      description: 'Demo Product Purchase'
    });
    console.log(`✓ Payment intent created: ${intent.intent_reference}\n`);

    // Step 2: Client would collect payment method and get token
    // (simulated here)
    console.log('Step 2: Client collects payment method...');
    const mockPaymentMethodToken = 'pm_test_' + Date.now();
    console.log(`✓ Payment method tokenized: ${mockPaymentMethodToken}\n`);

    // Step 3: Confirm payment intent
    console.log('Step 3: Confirming payment...');
    const confirmed = await molam.paymentIntents.confirm(
      intent.intent_reference,
      mockPaymentMethodToken
    );
    console.log(`✓ Payment confirmed: ${confirmed.status}\n`);

    // Step 4: Retrieve final status
    console.log('Step 4: Retrieving final status...');
    const final = await molam.paymentIntents.retrieve(intent.intent_reference);
    console.log(`✓ Final status: ${final.status}`);
    console.log(`✓ Amount: ${final.amount} ${final.currency}\n`);

    console.log('=== Payment Flow Completed Successfully ===');

    return final;
  } catch (error) {
    console.error('Error in payment flow:', error.message);
    throw error;
  }
}

/**
 * Example 9: Error handling
 */
async function errorHandlingExample() {
  try {
    // This will fail with validation error
    await molam.paymentIntents.create({
      amount: -10, // Invalid amount
      currency: 'USD'
    });
  } catch (error) {
    if (error.name === 'MolamError') {
      console.error('Molam API Error:');
      console.error('  Code:', error.code);
      console.error('  Status:', error.statusCode);
      console.error('  Message:', error.message);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

/**
 * Run examples
 */
async function main() {
  console.log('Molam Node.js SDK Examples\n');
  console.log('Environment:', molam.environment);
  console.log('');

  // Run example flow
  await completePaymentFlow();
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

// Export examples for testing
module.exports = {
  createPaymentIntent,
  retrievePaymentIntent,
  confirmPaymentIntent,
  cancelPaymentIntent,
  generateApiKeys,
  listApiKeys,
  logCustomEvent,
  completePaymentFlow,
  errorHandlingExample
};
