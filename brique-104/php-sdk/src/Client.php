<?php

declare(strict_types=1);

namespace Molam\SDK;

use GuzzleHttp\Psr7\Request;
use Molam\SDK\Exceptions\ApiException;
use Molam\SDK\Exceptions\ValidationException;
use Molam\SDK\Http\GuzzleHttpClient;
use Molam\SDK\Http\HttpClientInterface;
use Molam\SDK\Utils\Idempotency;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;

/**
 * Molam PHP SDK Client
 *
 * Production-ready SDK for Molam Form/Connect/Ma integration.
 *
 * Features:
 * - Complete API coverage (PaymentIntents, Refunds, Payouts, Merchants)
 * - Automatic retries with exponential backoff
 * - Idempotency support
 * - HMAC webhook verification
 * - PSR-3 logging
 * - Type-safe with PHP 8.1+
 *
 * @example
 * $config = new Config(['api_key' => 'sk_test_...']);
 * $client = new Client($config);
 *
 * $payment = $client->createPaymentIntent([
 *     'amount' => 100.00,
 *     'currency' => 'USD',
 *     'description' => 'Order #12345'
 * ]);
 */
class Client
{
    private Config $config;
    private HttpClientInterface $http;
    private LoggerInterface $logger;

    /**
     * Initialize Molam SDK client.
     *
     * @param Config $config SDK configuration
     * @param HttpClientInterface|null $httpClient Optional custom HTTP client
     * @param LoggerInterface|null $logger Optional PSR-3 logger
     */
    public function __construct(
        Config $config,
        ?HttpClientInterface $httpClient = null,
        ?LoggerInterface $logger = null
    ) {
        $this->config = $config;
        $this->logger = $logger ?? new NullLogger();

        // Use provided HTTP client or create default Guzzle client
        $this->http = $httpClient ?? new GuzzleHttpClient([
            'timeout' => $config->timeout,
            'verify' => $config->verifySSL,
        ], $this->logger);

        $this->logger->info('Molam SDK initialized', [
            'api_base' => $config->apiBase,
            'sdk_version' => $config->sdkVersion,
        ]);
    }

    // ========================================================================
    // Payment Intents
    // ========================================================================

    /**
     * Create a payment intent.
     *
     * @param array<string, mixed> $data Payment intent data
     * @param string|null $idempotencyKey Optional idempotency key
     * @return array<string, mixed> Payment intent object
     * @throws ApiException
     * @throws ValidationException
     */
    public function createPaymentIntent(array $data, ?string $idempotencyKey = null): array
    {
        $this->validatePaymentIntentData($data);

        if ($idempotencyKey === null) {
            $idempotencyKey = Idempotency::generate();
            $this->logger->warning('Auto-generated idempotency key', [
                'key' => $idempotencyKey,
            ]);
        }

        return $this->request(
            'POST',
            '/v1/connect/payment_intents',
            $data,
            $idempotencyKey
        );
    }

    /**
     * Retrieve a payment intent.
     *
     * @param string $paymentIntentId Payment intent ID
     * @return array<string, mixed> Payment intent object
     * @throws ApiException
     */
    public function retrievePaymentIntent(string $paymentIntentId): array
    {
        return $this->request(
            'GET',
            "/v1/connect/payment_intents/{$paymentIntentId}"
        );
    }

    /**
     * List payment intents.
     *
     * @param array<string, mixed> $params Query parameters (limit, offset, status, etc.)
     * @return array<string, mixed> List of payment intents
     * @throws ApiException
     */
    public function listPaymentIntents(array $params = []): array
    {
        $query = http_build_query($params);
        $path = '/v1/connect/payment_intents' . ($query ? '?' . $query : '');

        return $this->request('GET', $path);
    }

    /**
     * Confirm a payment intent.
     *
     * @param string $paymentIntentId Payment intent ID
     * @param string|null $idempotencyKey Optional idempotency key
     * @return array<string, mixed> Confirmed payment intent
     * @throws ApiException
     */
    public function confirmPaymentIntent(
        string $paymentIntentId,
        ?string $idempotencyKey = null
    ): array {
        if ($idempotencyKey === null) {
            $idempotencyKey = Idempotency::generate();
        }

        return $this->request(
            'POST',
            "/v1/connect/payment_intents/{$paymentIntentId}/confirm",
            [],
            $idempotencyKey
        );
    }

    /**
     * Cancel a payment intent.
     *
     * @param string $paymentIntentId Payment intent ID
     * @param string|null $idempotencyKey Optional idempotency key
     * @return array<string, mixed> Canceled payment intent
     * @throws ApiException
     */
    public function cancelPaymentIntent(
        string $paymentIntentId,
        ?string $idempotencyKey = null
    ): array {
        if ($idempotencyKey === null) {
            $idempotencyKey = Idempotency::generate();
        }

        return $this->request(
            'POST',
            "/v1/connect/payment_intents/{$paymentIntentId}/cancel",
            [],
            $idempotencyKey
        );
    }

    // ========================================================================
    // Refunds
    // ========================================================================

    /**
     * Create a refund.
     *
     * @param array<string, mixed> $data Refund data (payment_id, amount, reason, etc.)
     * @param string|null $idempotencyKey Optional idempotency key
     * @return array<string, mixed> Refund object
     * @throws ApiException
     */
    public function createRefund(array $data, ?string $idempotencyKey = null): array
    {
        $this->validateRefundData($data);

        if ($idempotencyKey === null) {
            $idempotencyKey = Idempotency::generate();
        }

        return $this->request(
            'POST',
            '/v1/connect/refunds',
            $data,
            $idempotencyKey
        );
    }

    /**
     * Retrieve a refund.
     *
     * @param string $refundId Refund ID
     * @return array<string, mixed> Refund object
     * @throws ApiException
     */
    public function retrieveRefund(string $refundId): array
    {
        return $this->request(
            'GET',
            "/v1/connect/refunds/{$refundId}"
        );
    }

    /**
     * List refunds.
     *
     * @param array<string, mixed> $params Query parameters
     * @return array<string, mixed> List of refunds
     * @throws ApiException
     */
    public function listRefunds(array $params = []): array
    {
        $query = http_build_query($params);
        $path = '/v1/connect/refunds' . ($query ? '?' . $query : '');

        return $this->request('GET', $path);
    }

    // ========================================================================
    // Payouts
    // ========================================================================

    /**
     * Create a payout.
     *
     * @param array<string, mixed> $data Payout data
     * @param string|null $idempotencyKey Optional idempotency key
     * @return array<string, mixed> Payout object
     * @throws ApiException
     */
    public function createPayout(array $data, ?string $idempotencyKey = null): array
    {
        if ($idempotencyKey === null) {
            $idempotencyKey = Idempotency::generate();
        }

        return $this->request(
            'POST',
            '/v1/connect/payouts',
            $data,
            $idempotencyKey
        );
    }

    /**
     * Retrieve a payout.
     *
     * @param string $payoutId Payout ID
     * @return array<string, mixed> Payout object
     * @throws ApiException
     */
    public function retrievePayout(string $payoutId): array
    {
        return $this->request(
            'GET',
            "/v1/connect/payouts/{$payoutId}"
        );
    }

    // ========================================================================
    // Merchants
    // ========================================================================

    /**
     * Create a merchant account.
     *
     * @param array<string, mixed> $data Merchant data
     * @param string|null $idempotencyKey Optional idempotency key
     * @return array<string, mixed> Merchant object
     * @throws ApiException
     */
    public function createMerchant(array $data, ?string $idempotencyKey = null): array
    {
        if ($idempotencyKey === null) {
            $idempotencyKey = Idempotency::generate();
        }

        return $this->request(
            'POST',
            '/v1/connect/merchants',
            $data,
            $idempotencyKey
        );
    }

    /**
     * Retrieve a merchant.
     *
     * @param string $merchantId Merchant ID
     * @return array<string, mixed> Merchant object
     * @throws ApiException
     */
    public function retrieveMerchant(string $merchantId): array
    {
        return $this->request(
            'GET',
            "/v1/connect/merchants/{$merchantId}"
        );
    }

    /**
     * Update a merchant.
     *
     * @param string $merchantId Merchant ID
     * @param array<string, mixed> $data Update data
     * @return array<string, mixed> Updated merchant object
     * @throws ApiException
     */
    public function updateMerchant(string $merchantId, array $data): array
    {
        return $this->request(
            'PATCH',
            "/v1/connect/merchants/{$merchantId}",
            $data
        );
    }

    // ========================================================================
    // Webhooks
    // ========================================================================

    /**
     * Verify webhook signature.
     *
     * @param string $signatureHeader Value of "Molam-Signature" HTTP header
     * @param string $payload Raw request body
     * @return bool True if signature is valid
     * @throws \InvalidArgumentException If verification fails
     */
    public function verifyWebhookSignature(string $signatureHeader, string $payload): bool
    {
        return Utils\WebhookVerifier::verify(
            $signatureHeader,
            $payload,
            fn(string $kid) => $this->config->webhookSecret
        );
    }

    // ========================================================================
    // Internal Methods
    // ========================================================================

    /**
     * Make HTTP request to Molam API.
     *
     * @param string $method HTTP method
     * @param string $path API path
     * @param array<string, mixed> $data Request body data
     * @param string|null $idempotencyKey Optional idempotency key
     * @return array<string, mixed> Response data
     * @throws ApiException
     */
    private function request(
        string $method,
        string $path,
        array $data = [],
        ?string $idempotencyKey = null
    ): array {
        $url = $this->config->apiBase . $path;

        // Build headers
        $headers = [
            'Authorization' => 'Bearer ' . $this->config->apiKey,
            'Content-Type' => 'application/json',
            'User-Agent' => 'molam-php-sdk/' . $this->config->sdkVersion,
            'X-SDK-Version' => $this->config->sdkVersion,
        ];

        if ($idempotencyKey !== null) {
            $headers['Idempotency-Key'] = $idempotencyKey;
        }

        // Build request body
        $body = empty($data) ? null : json_encode($data);

        $this->logger->debug('API Request', [
            'method' => $method,
            'path' => $path,
            'idempotency_key' => $idempotencyKey,
        ]);

        // Create PSR-7 request
        $request = new Request($method, $url, $headers, $body);

        // Send request
        $response = $this->http->send($request);

        $statusCode = $response->getStatusCode();
        $responseBody = (string) $response->getBody();
        $responseData = json_decode($responseBody, true);

        $this->logger->debug('API Response', [
            'status' => $statusCode,
            'path' => $path,
        ]);

        // Handle errors
        if ($statusCode >= 400) {
            $this->handleErrorResponse($statusCode, $responseData, $response);
        }

        return $responseData;
    }

    /**
     * Handle API error response.
     *
     * @param int $statusCode HTTP status code
     * @param array<string, mixed>|null $data Response data
     * @param \Psr\Http\Message\ResponseInterface $response Full response
     * @throws ApiException
     */
    private function handleErrorResponse(int $statusCode, ?array $data, $response): void
    {
        $errorMessage = $data['error']['message'] ?? 'Unknown error';
        $errorCode = $data['error']['code'] ?? '';
        $errorDetails = $data['error']['details'] ?? [];
        $requestId = $response->getHeaderLine('X-Request-Id') ?: null;

        $this->logger->error('API Error', [
            'status' => $statusCode,
            'message' => $errorMessage,
            'code' => $errorCode,
            'request_id' => $requestId,
        ]);

        throw new ApiException(
            $errorMessage,
            $statusCode,
            $errorCode,
            $errorDetails,
            $requestId
        );
    }

    /**
     * Validate payment intent data.
     *
     * @param array<string, mixed> $data Payment intent data
     * @throws ValidationException
     */
    private function validatePaymentIntentData(array $data): void
    {
        $errors = [];

        if (!isset($data['amount'])) {
            $errors['amount'] = 'Amount is required';
        } elseif (!is_numeric($data['amount']) || $data['amount'] <= 0) {
            $errors['amount'] = 'Amount must be a positive number';
        }

        if (!isset($data['currency'])) {
            $errors['currency'] = 'Currency is required';
        } elseif (strlen($data['currency']) !== 3) {
            $errors['currency'] = 'Currency must be a 3-letter ISO code';
        }

        if (!empty($errors)) {
            throw new ValidationException('Validation failed', $errors);
        }
    }

    /**
     * Validate refund data.
     *
     * @param array<string, mixed> $data Refund data
     * @throws ValidationException
     */
    private function validateRefundData(array $data): void
    {
        $errors = [];

        if (!isset($data['payment_id'])) {
            $errors['payment_id'] = 'Payment ID is required';
        }

        if (isset($data['amount'])) {
            if (!is_numeric($data['amount']) || $data['amount'] <= 0) {
                $errors['amount'] = 'Amount must be a positive number';
            }
        }

        if (!empty($errors)) {
            throw new ValidationException('Validation failed', $errors);
        }
    }
}
