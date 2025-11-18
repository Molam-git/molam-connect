// Molam Go SDK - Usage Examples
package main

import (
	"fmt"
	"log"
	"time"

	"molam" // Replace with actual import path
)

func main() {
	// Initialize SDK with your secret key
	client, err := molam.NewClient("sk_test_1234567890abcdef")
	if err != nil {
		log.Fatalf("Failed to create client: %v", err)
	}

	fmt.Println("Molam Go SDK Examples")
	fmt.Printf("Environment: %s\n\n", client.Environment)

	// Run complete payment flow
	if err := completePaymentFlow(client); err != nil {
		log.Fatalf("Error: %v", err)
	}
}

// Example 1: Create a payment intent
func createPaymentIntent(client *molam.Client) (map[string]interface{}, error) {
	intent, err := client.PaymentIntents.Create(&molam.PaymentIntentParams{
		Amount:        99.99,
		Currency:      "USD",
		CustomerEmail: "customer@example.com",
		CustomerName:  "John Doe",
		Description:   "Premium Plan Subscription",
		Metadata: map[string]interface{}{
			"order_id":    "order_12345",
			"customer_id": "cus_abc123",
		},
	})
	if err != nil {
		fmt.Printf("Error creating payment intent: %v\n", err)
		return nil, err
	}

	fmt.Println("Payment intent created:")
	fmt.Printf("  ID: %s\n", intent["intent_reference"])
	fmt.Printf("  Amount: %v %s\n", intent["amount"], intent["currency"])
	fmt.Printf("  Client secret: %s\n\n", intent["client_secret"])

	return intent, nil
}

// Example 2: Retrieve a payment intent
func retrievePaymentIntent(client *molam.Client, intentID string) (map[string]interface{}, error) {
	intent, err := client.PaymentIntents.Retrieve(intentID)
	if err != nil {
		fmt.Printf("Error retrieving payment intent: %v\n", err)
		return nil, err
	}

	fmt.Println("Payment intent retrieved:")
	fmt.Printf("  ID: %s\n", intent["intent_reference"])
	fmt.Printf("  Status: %s\n", intent["status"])
	fmt.Printf("  Amount: %v %s\n\n", intent["amount"], intent["currency"])

	return intent, nil
}

// Example 3: Confirm a payment intent
func confirmPaymentIntent(client *molam.Client, intentID, paymentMethodToken string) (map[string]interface{}, error) {
	result, err := client.PaymentIntents.Confirm(intentID, paymentMethodToken)
	if err != nil {
		fmt.Printf("Error confirming payment: %v\n", err)
		return nil, err
	}

	fmt.Println("Payment confirmed:")
	fmt.Printf("  ID: %s\n", result["intent_reference"])
	fmt.Printf("  Status: %s\n\n", result["status"])

	return result, nil
}

// Example 4: Cancel a payment intent
func cancelPaymentIntent(client *molam.Client, intentID string) (map[string]interface{}, error) {
	result, err := client.PaymentIntents.Cancel(intentID)
	if err != nil {
		fmt.Printf("Error canceling payment: %v\n", err)
		return nil, err
	}

	fmt.Println("Payment canceled:")
	fmt.Printf("  ID: %s\n", result["intent_reference"])
	fmt.Printf("  Status: %s\n\n", result["status"])

	return result, nil
}

// Example 5: Generate API keys
func generateAPIKeys(client *molam.Client) error {
	// Generate test publishable key
	testKey, err := client.APIKeys.Create(&molam.APIKeyParams{
		MerchantID:  "merchant_abc123",
		KeyType:     "publishable",
		Environment: "test",
	})
	if err != nil {
		fmt.Printf("Error generating test key: %v\n", err)
		return err
	}
	fmt.Printf("Test publishable key created: %s\n", testKey["api_key"])

	// Generate live secret key
	liveKey, err := client.APIKeys.Create(&molam.APIKeyParams{
		MerchantID:  "merchant_abc123",
		KeyType:     "secret",
		Environment: "live",
	})
	if err != nil {
		fmt.Printf("Error generating live key: %v\n", err)
		return err
	}
	fmt.Printf("Live secret key created: %s\n\n", liveKey["api_key"])

	return nil
}

// Example 6: List API keys
func listAPIKeys(client *molam.Client, merchantID string) error {
	result, err := client.APIKeys.List(merchantID)
	if err != nil {
		fmt.Printf("Error listing API keys: %v\n", err)
		return err
	}

	keys := result["keys"].([]interface{})
	fmt.Printf("Found %d API keys:\n", len(keys))
	for _, key := range keys {
		k := key.(map[string]interface{})
		fmt.Printf("  - %s (%s): %s...%s\n",
			k["key_type"],
			k["environment"],
			k["key_prefix"],
			k["key_suffix"])
	}
	fmt.Println()

	return nil
}

// Example 7: Log custom events
func logCustomEvent(client *molam.Client) error {
	_, err := client.Logs.Create(&molam.LogParams{
		EventType: "custom_event",
		Platform:  "go_server",
		Payload: map[string]interface{}{
			"action":  "subscription_created",
			"plan":    "premium",
			"user_id": "user_123",
		},
	})
	if err != nil {
		fmt.Printf("Error logging event: %v\n", err)
		return err
	}

	fmt.Println("Custom event logged\n")
	return nil
}

// Example 8: Complete payment flow
func completePaymentFlow(client *molam.Client) error {
	fmt.Println("=== Starting Complete Payment Flow ===\n")

	// Step 1: Create payment intent
	fmt.Println("Step 1: Creating payment intent...")
	intent, err := client.PaymentIntents.Create(&molam.PaymentIntentParams{
		Amount:        49.99,
		Currency:      "USD",
		CustomerEmail: "demo@example.com",
		Description:   "Demo Product Purchase",
	})
	if err != nil {
		return err
	}
	fmt.Printf("✓ Payment intent created: %s\n\n", intent["intent_reference"])

	// Step 2: Client would collect payment method and get token (simulated)
	fmt.Println("Step 2: Client collects payment method...")
	mockPaymentMethodToken := fmt.Sprintf("pm_test_%d", time.Now().Unix())
	fmt.Printf("✓ Payment method tokenized: %s\n\n", mockPaymentMethodToken)

	// Step 3: Confirm payment intent
	fmt.Println("Step 3: Confirming payment...")
	confirmed, err := client.PaymentIntents.Confirm(
		intent["intent_reference"].(string),
		mockPaymentMethodToken,
	)
	if err != nil {
		return err
	}
	fmt.Printf("✓ Payment confirmed: %s\n\n", confirmed["status"])

	// Step 4: Retrieve final status
	fmt.Println("Step 4: Retrieving final status...")
	final, err := client.PaymentIntents.Retrieve(intent["intent_reference"].(string))
	if err != nil {
		return err
	}
	fmt.Printf("✓ Final status: %s\n", final["status"])
	fmt.Printf("✓ Amount: %v %s\n\n", final["amount"], final["currency"])

	fmt.Println("=== Payment Flow Completed Successfully ===\n")

	return nil
}

// Example 9: Error handling
func errorHandlingExample(client *molam.Client) {
	// This will fail with validation error
	_, err := client.PaymentIntents.Create(&molam.PaymentIntentParams{
		Amount:   -10, // Invalid amount
		Currency: "USD",
	})

	if err != nil {
		if molamErr, ok := err.(*molam.MolamError); ok {
			fmt.Println("Molam API Error:")
			fmt.Printf("  Code: %s\n", molamErr.Code)
			fmt.Printf("  Status: %d\n", molamErr.StatusCode)
			fmt.Printf("  Message: %s\n", molamErr.Message)
		} else {
			fmt.Printf("Unexpected error: %v\n", err)
		}
	}
}

// Example 10: Webhook handler (HTTP handler function)
func webhookHandler(client *molam.Client, eventData map[string]interface{}) {
	fmt.Println("Webhook received:")
	fmt.Printf("  Event type: %s\n", eventData["event_type"])
	fmt.Printf("  Data: %v\n\n", eventData["data"])

	// Handle different event types
	eventType := eventData["event_type"].(string)

	switch eventType {
	case "payment_intent.succeeded":
		// Fulfill order, send confirmation email, etc.
		fmt.Println("Payment successful! Fulfilling order...")
	case "payment_intent.failed":
		// Notify customer, retry logic, etc.
		fmt.Println("Payment failed! Notifying customer...")
	default:
		fmt.Println("Unknown event type")
	}

	// Log webhook receipt
	client.Logs.Create(&molam.LogParams{
		EventType: "webhook_received",
		Payload: map[string]interface{}{
			"event_type": eventType,
		},
	})
}
