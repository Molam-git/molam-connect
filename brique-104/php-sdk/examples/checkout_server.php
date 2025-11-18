<?php

/**
 * Molam Checkout Server Example
 *
 * Simple PHP server for processing payments with Molam SDK.
 * Demonstrates creating payment intents and handling checkout flow.
 *
 * Usage:
 *   1. Set environment variables:
 *      export MOLAM_API_KEY="sk_test_..."
 *      export MOLAM_WEBHOOK_SECRET="whsec_..."
 *
 *   2. Run server:
 *      php -S localhost:8080 examples/checkout_server.php
 *
 *   3. Test endpoints:
 *      POST http://localhost:8080/create-payment
 *      GET  http://localhost:8080/payment/{id}
 *      POST http://localhost:8080/confirm-payment/{id}
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Molam\SDK\Client;
use Molam\SDK\Config;
use Molam\SDK\Exceptions\ApiException;
use Molam\SDK\Exceptions\ValidationException;

// Initialize SDK client
$config = new Config([
    'api_key' => getenv('MOLAM_API_KEY') ?: 'sk_test_your_key_here',
    'api_base' => getenv('MOLAM_API_BASE') ?: 'https://sandbox.api.molam.io',
    'webhook_secret' => getenv('MOLAM_WEBHOOK_SECRET') ?: '',
    'debug' => true,
]);

$molam = new Client($config);

// Simple router
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

header('Content-Type: application/json');

try {
    // Route: POST /create-payment
    if ($method === 'POST' && $path === '/create-payment') {
        $input = json_decode(file_get_contents('php://input'), true);

        $payment = $molam->createPaymentIntent([
            'amount' => $input['amount'] ?? 100.00,
            'currency' => $input['currency'] ?? 'USD',
            'description' => $input['description'] ?? 'Test payment',
            'return_url' => 'http://localhost:8080/success',
            'cancel_url' => 'http://localhost:8080/cancel',
            'metadata' => [
                'order_id' => $input['order_id'] ?? 'order-' . uniqid(),
                'customer_email' => $input['customer_email'] ?? 'customer@example.com',
            ],
        ]);

        http_response_code(201);
        echo json_encode([
            'success' => true,
            'payment_intent' => $payment,
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // Route: GET /payment/{id}
    if ($method === 'GET' && preg_match('#^/payment/([a-zA-Z0-9_]+)$#', $path, $matches)) {
        $paymentId = $matches[1];
        $payment = $molam->retrievePaymentIntent($paymentId);

        echo json_encode([
            'success' => true,
            'payment_intent' => $payment,
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // Route: POST /confirm-payment/{id}
    if ($method === 'POST' && preg_match('#^/confirm-payment/([a-zA-Z0-9_]+)$#', $path, $matches)) {
        $paymentId = $matches[1];
        $payment = $molam->confirmPaymentIntent($paymentId);

        echo json_encode([
            'success' => true,
            'payment_intent' => $payment,
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // Route: POST /cancel-payment/{id}
    if ($method === 'POST' && preg_match('#^/cancel-payment/([a-zA-Z0-9_]+)$#', $path, $matches)) {
        $paymentId = $matches[1];
        $payment = $molam->cancelPaymentIntent($paymentId);

        echo json_encode([
            'success' => true,
            'payment_intent' => $payment,
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // Route: POST /create-refund
    if ($method === 'POST' && $path === '/create-refund') {
        $input = json_decode(file_get_contents('php://input'), true);

        $refund = $molam->createRefund([
            'payment_id' => $input['payment_id'],
            'amount' => $input['amount'] ?? null, // null = full refund
            'reason' => $input['reason'] ?? 'requested_by_customer',
            'metadata' => [
                'refund_reason' => $input['refund_reason'] ?? 'Customer request',
            ],
        ]);

        http_response_code(201);
        echo json_encode([
            'success' => true,
            'refund' => $refund,
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // Route: GET /refund/{id}
    if ($method === 'GET' && preg_match('#^/refund/([a-zA-Z0-9_]+)$#', $path, $matches)) {
        $refundId = $matches[1];
        $refund = $molam->retrieveRefund($refundId);

        echo json_encode([
            'success' => true,
            'refund' => $refund,
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // Route: GET /success
    if ($method === 'GET' && $path === '/success') {
        http_response_code(200);
        echo '<html><body><h1>Payment Successful!</h1><p>Thank you for your payment.</p></body></html>';
        exit;
    }

    // Route: GET /cancel
    if ($method === 'GET' && $path === '/cancel') {
        http_response_code(200);
        echo '<html><body><h1>Payment Canceled</h1><p>Your payment was canceled.</p></body></html>';
        exit;
    }

    // Route: GET / (API info)
    if ($method === 'GET' && $path === '/') {
        echo json_encode([
            'name' => 'Molam Checkout Server',
            'version' => '1.0.0',
            'endpoints' => [
                'POST /create-payment' => 'Create a payment intent',
                'GET /payment/{id}' => 'Retrieve a payment intent',
                'POST /confirm-payment/{id}' => 'Confirm a payment intent',
                'POST /cancel-payment/{id}' => 'Cancel a payment intent',
                'POST /create-refund' => 'Create a refund',
                'GET /refund/{id}' => 'Retrieve a refund',
            ],
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // 404 Not Found
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'error' => [
            'code' => 'not_found',
            'message' => 'Endpoint not found',
        ],
    ], JSON_PRETTY_PRINT);
} catch (ValidationException $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => [
            'code' => 'validation_error',
            'message' => $e->getMessage(),
            'errors' => $e->getErrors(),
        ],
    ], JSON_PRETTY_PRINT);
} catch (ApiException $e) {
    http_response_code($e->getStatusCode() ?: 500);
    echo json_encode([
        'success' => false,
        'error' => [
            'code' => $e->getErrorCode(),
            'message' => $e->getMessage(),
            'details' => $e->getErrorDetails(),
            'request_id' => $e->getRequestId(),
        ],
    ], JSON_PRETTY_PRINT);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => [
            'code' => 'internal_error',
            'message' => $e->getMessage(),
        ],
    ], JSON_PRETTY_PRINT);
}
