<?php

/**
 * Molam Webhook Receiver Example
 *
 * Secure webhook endpoint for receiving Molam events.
 * Verifies HMAC signatures and processes events.
 *
 * Usage:
 *   1. Set environment variables:
 *      export MOLAM_WEBHOOK_SECRET="whsec_..."
 *
 *   2. Run server:
 *      php -S localhost:8081 examples/webhook_receiver.php
 *
 *   3. Configure webhook URL in Molam dashboard:
 *      https://your-domain.com/webhook/molam
 *
 *   4. Test with curl:
 *      curl -X POST http://localhost:8081/webhook/molam \
 *        -H "Molam-Signature: t=1234567890000,v1=abc...,kid=v1" \
 *        -d '{"type":"payment_intent.succeeded","data":{...}}'
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Molam\SDK\Client;
use Molam\SDK\Config;
use Molam\SDK\Utils\WebhookVerifier;

// Initialize SDK client
$config = new Config([
    'api_key' => getenv('MOLAM_API_KEY') ?: 'sk_test_...',
    'webhook_secret' => getenv('MOLAM_WEBHOOK_SECRET') ?: 'whsec_test_secret',
]);

$molam = new Client($config);

// Database connection (for storing webhook events)
// Adjust credentials as needed
$pdo = new PDO(
    'mysql:host=localhost;dbname=molam_app',
    getenv('DB_USER') ?: 'root',
    getenv('DB_PASS') ?: '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

// Simple router
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

header('Content-Type: application/json');

try {
    // Route: POST /webhook/molam
    if ($method === 'POST' && $path === '/webhook/molam') {
        // Get request data
        $signature = $_SERVER['HTTP_MOLAM_SIGNATURE'] ?? '';
        $payload = file_get_contents('php://input');

        // Verify signature
        try {
            $isValid = WebhookVerifier::verify(
                $signature,
                $payload,
                fn(string $kid) => $config->webhookSecret
            );

            if (!$isValid) {
                http_response_code(401);
                echo json_encode(['error' => 'Invalid signature']);
                exit;
            }
        } catch (InvalidArgumentException $e) {
            http_response_code(401);
            echo json_encode(['error' => $e->getMessage()]);
            exit;
        }

        // Parse event
        $event = json_decode($payload, true);

        // Store event in database (for processing queue)
        $stmt = $pdo->prepare(
            "INSERT INTO molam_webhook_events
            (event_id, event_type, payload, signature, verified)
            VALUES (:event_id, :event_type, :payload, :signature, :verified)"
        );
        $stmt->execute([
            'event_id' => $event['id'] ?? uniqid('evt_'),
            'event_type' => $event['type'] ?? 'unknown',
            'payload' => $payload,
            'signature' => $signature,
            'verified' => 1,
        ]);

        // Process event synchronously (or queue for async processing)
        processWebhookEvent($event, $molam, $pdo);

        // Return 200 OK
        http_response_code(200);
        echo json_encode(['status' => 'ok']);
        exit;
    }

    // Route: GET / (webhook info)
    if ($method === 'GET' && $path === '/') {
        echo json_encode([
            'name' => 'Molam Webhook Receiver',
            'version' => '1.0.0',
            'endpoint' => '/webhook/molam',
            'status' => 'active',
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // 404 Not Found
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
} catch (Exception $e) {
    error_log('Webhook processing error: ' . $e->getMessage());

    http_response_code(500);
    echo json_encode([
        'error' => 'Internal server error',
        'message' => $e->getMessage(),
    ]);
}

/**
 * Process webhook event.
 *
 * @param array<string, mixed> $event Webhook event data
 * @param Client $molam Molam SDK client
 * @param PDO $pdo Database connection
 */
function processWebhookEvent(array $event, Client $molam, PDO $pdo): void
{
    $eventType = $event['type'] ?? 'unknown';
    $eventData = $event['data'] ?? [];

    error_log("Processing webhook event: {$eventType}");

    switch ($eventType) {
        case 'payment_intent.succeeded':
            handlePaymentSucceeded($eventData, $molam, $pdo);
            break;

        case 'payment_intent.failed':
            handlePaymentFailed($eventData, $molam, $pdo);
            break;

        case 'payment_intent.canceled':
            handlePaymentCanceled($eventData, $molam, $pdo);
            break;

        case 'refund.created':
            handleRefundCreated($eventData, $molam, $pdo);
            break;

        case 'refund.succeeded':
            handleRefundSucceeded($eventData, $molam, $pdo);
            break;

        case 'payout.paid':
            handlePayoutPaid($eventData, $molam, $pdo);
            break;

        default:
            error_log("Unknown event type: {$eventType}");
    }

    // Mark event as processed
    $stmt = $pdo->prepare(
        "UPDATE molam_webhook_events
        SET processed = 1, processed_at = NOW()
        WHERE event_id = :event_id"
    );
    $stmt->execute(['event_id' => $event['id'] ?? '']);
}

/**
 * Handle successful payment.
 */
function handlePaymentSucceeded(array $data, Client $molam, PDO $pdo): void
{
    $paymentId = $data['id'] ?? '';
    $amount = $data['amount'] ?? 0;
    $currency = $data['currency'] ?? 'USD';
    $orderId = $data['metadata']['order_id'] ?? null;

    error_log("Payment succeeded: {$paymentId} ({$amount} {$currency})");

    // Update order status in database
    if ($orderId) {
        $stmt = $pdo->prepare(
            "UPDATE orders SET status = 'paid', payment_id = :payment_id WHERE id = :order_id"
        );
        $stmt->execute([
            'payment_id' => $paymentId,
            'order_id' => $orderId,
        ]);
    }

    // Send confirmation email
    // sendPaymentConfirmationEmail($data);

    // Trigger fulfillment
    // triggerOrderFulfillment($orderId);
}

/**
 * Handle failed payment.
 */
function handlePaymentFailed(array $data, Client $molam, PDO $pdo): void
{
    $paymentId = $data['id'] ?? '';
    $errorCode = $data['error']['code'] ?? 'unknown';
    $orderId = $data['metadata']['order_id'] ?? null;

    error_log("Payment failed: {$paymentId} (error: {$errorCode})");

    // Update order status
    if ($orderId) {
        $stmt = $pdo->prepare(
            "UPDATE orders SET status = 'payment_failed', error = :error WHERE id = :order_id"
        );
        $stmt->execute([
            'error' => $errorCode,
            'order_id' => $orderId,
        ]);
    }

    // Send failure notification
    // sendPaymentFailureEmail($data);
}

/**
 * Handle canceled payment.
 */
function handlePaymentCanceled(array $data, Client $molam, PDO $pdo): void
{
    $paymentId = $data['id'] ?? '';
    $orderId = $data['metadata']['order_id'] ?? null;

    error_log("Payment canceled: {$paymentId}");

    // Update order status
    if ($orderId) {
        $stmt = $pdo->prepare(
            "UPDATE orders SET status = 'canceled' WHERE id = :order_id"
        );
        $stmt->execute(['order_id' => $orderId]);
    }
}

/**
 * Handle refund created.
 */
function handleRefundCreated(array $data, Client $molam, PDO $pdo): void
{
    $refundId = $data['id'] ?? '';
    $paymentId = $data['payment_id'] ?? '';
    $amount = $data['amount'] ?? 0;

    error_log("Refund created: {$refundId} for payment {$paymentId} ({$amount})");

    // Store refund record
    $stmt = $pdo->prepare(
        "INSERT INTO refunds (refund_id, payment_id, amount, status)
        VALUES (:refund_id, :payment_id, :amount, 'pending')"
    );
    $stmt->execute([
        'refund_id' => $refundId,
        'payment_id' => $paymentId,
        'amount' => $amount,
    ]);
}

/**
 * Handle successful refund.
 */
function handleRefundSucceeded(array $data, Client $molam, PDO $pdo): void
{
    $refundId = $data['id'] ?? '';
    $paymentId = $data['payment_id'] ?? '';

    error_log("Refund succeeded: {$refundId}");

    // Update refund status
    $stmt = $pdo->prepare(
        "UPDATE refunds SET status = 'succeeded', processed_at = NOW()
        WHERE refund_id = :refund_id"
    );
    $stmt->execute(['refund_id' => $refundId]);

    // Send refund confirmation email
    // sendRefundConfirmationEmail($data);
}

/**
 * Handle payout paid.
 */
function handlePayoutPaid(array $data, Client $molam, PDO $pdo): void
{
    $payoutId = $data['id'] ?? '';
    $amount = $data['amount'] ?? 0;
    $merchantId = $data['merchant_id'] ?? '';

    error_log("Payout paid: {$payoutId} to merchant {$merchantId} ({$amount})");

    // Update payout record
    $stmt = $pdo->prepare(
        "UPDATE payouts SET status = 'paid', paid_at = NOW()
        WHERE payout_id = :payout_id"
    );
    $stmt->execute(['payout_id' => $payoutId]);

    // Send payout notification
    // sendPayoutNotificationEmail($merchantId, $data);
}
