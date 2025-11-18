<?php

declare(strict_types=1);

namespace Molam\SDK\Tests;

use GuzzleHttp\Psr7\Response;
use Molam\SDK\Client;
use Molam\SDK\Config;
use Molam\SDK\Exceptions\ApiException;
use Molam\SDK\Exceptions\ValidationException;
use Molam\SDK\Http\HttpClientInterface;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * Client Unit Tests
 *
 * Tests SDK client functionality with mocked HTTP client.
 */
class ClientTest extends TestCase
{
    private Config $config;
    private MockHttpClient $httpClient;
    private Client $client;

    protected function setUp(): void
    {
        $this->config = new Config([
            'api_key' => 'sk_test_12345',
            'api_base' => 'https://sandbox.api.molam.io',
            'webhook_secret' => 'whsec_test_secret',
            'debug' => true,
        ]);

        $this->httpClient = new MockHttpClient();
        $this->client = new Client($this->config, $this->httpClient);
    }

    public function testCreatePaymentIntentSuccess(): void
    {
        $responseData = [
            'id' => 'pi_abc123',
            'amount' => 100.00,
            'currency' => 'USD',
            'status' => 'requires_confirmation',
            'created_at' => '2025-01-16T10:00:00Z',
        ];

        $this->httpClient->setNextResponse(
            new Response(201, [], json_encode($responseData))
        );

        $result = $this->client->createPaymentIntent([
            'amount' => 100.00,
            'currency' => 'USD',
            'description' => 'Test payment',
        ], 'idempotency-key-123');

        $this->assertEquals('pi_abc123', $result['id']);
        $this->assertEquals(100.00, $result['amount']);
        $this->assertEquals('USD', $result['currency']);

        // Verify request
        $request = $this->httpClient->getLastRequest();
        $this->assertEquals('POST', $request->getMethod());
        $this->assertStringContainsString('/v1/connect/payment_intents', (string) $request->getUri());
        $this->assertEquals('Bearer sk_test_12345', $request->getHeaderLine('Authorization'));
        $this->assertEquals('idempotency-key-123', $request->getHeaderLine('Idempotency-Key'));
    }

    public function testCreatePaymentIntentValidationError(): void
    {
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('Validation failed');

        $this->client->createPaymentIntent([
            // Missing required fields
        ]);
    }

    public function testCreatePaymentIntentInvalidAmount(): void
    {
        $this->expectException(ValidationException::class);

        $this->client->createPaymentIntent([
            'amount' => -10.00, // Invalid negative amount
            'currency' => 'USD',
        ]);
    }

    public function testCreatePaymentIntentApiError(): void
    {
        $errorResponse = [
            'error' => [
                'code' => 'invalid_amount',
                'message' => 'Amount must be at least 1.00 USD',
                'details' => [],
            ],
        ];

        $this->httpClient->setNextResponse(
            new Response(400, ['X-Request-Id' => 'req_xyz789'], json_encode($errorResponse))
        );

        try {
            $this->client->createPaymentIntent([
                'amount' => 100.00,
                'currency' => 'USD',
            ]);
            $this->fail('Expected ApiException to be thrown');
        } catch (ApiException $e) {
            $this->assertEquals(400, $e->getStatusCode());
            $this->assertEquals('invalid_amount', $e->getErrorCode());
            $this->assertEquals('req_xyz789', $e->getRequestId());
        }
    }

    public function testRetrievePaymentIntent(): void
    {
        $responseData = [
            'id' => 'pi_abc123',
            'amount' => 50.00,
            'currency' => 'EUR',
            'status' => 'succeeded',
        ];

        $this->httpClient->setNextResponse(
            new Response(200, [], json_encode($responseData))
        );

        $result = $this->client->retrievePaymentIntent('pi_abc123');

        $this->assertEquals('pi_abc123', $result['id']);
        $this->assertEquals('succeeded', $result['status']);
    }

    public function testConfirmPaymentIntent(): void
    {
        $responseData = [
            'id' => 'pi_abc123',
            'status' => 'processing',
        ];

        $this->httpClient->setNextResponse(
            new Response(200, [], json_encode($responseData))
        );

        $result = $this->client->confirmPaymentIntent('pi_abc123');

        $this->assertEquals('processing', $result['status']);
    }

    public function testCancelPaymentIntent(): void
    {
        $responseData = [
            'id' => 'pi_abc123',
            'status' => 'canceled',
        ];

        $this->httpClient->setNextResponse(
            new Response(200, [], json_encode($responseData))
        );

        $result = $this->client->cancelPaymentIntent('pi_abc123');

        $this->assertEquals('canceled', $result['status']);
    }

    public function testCreateRefund(): void
    {
        $responseData = [
            'id' => 'ref_abc123',
            'payment_id' => 'pi_abc123',
            'amount' => 25.00,
            'currency' => 'USD',
            'status' => 'succeeded',
        ];

        $this->httpClient->setNextResponse(
            new Response(201, [], json_encode($responseData))
        );

        $result = $this->client->createRefund([
            'payment_id' => 'pi_abc123',
            'amount' => 25.00,
            'reason' => 'requested_by_customer',
        ]);

        $this->assertEquals('ref_abc123', $result['id']);
        $this->assertEquals(25.00, $result['amount']);
    }

    public function testCreateRefundValidationError(): void
    {
        $this->expectException(ValidationException::class);

        $this->client->createRefund([
            // Missing payment_id
            'amount' => 10.00,
        ]);
    }

    public function testListPaymentIntents(): void
    {
        $responseData = [
            'data' => [
                ['id' => 'pi_1', 'amount' => 100],
                ['id' => 'pi_2', 'amount' => 200],
            ],
            'has_more' => false,
        ];

        $this->httpClient->setNextResponse(
            new Response(200, [], json_encode($responseData))
        );

        $result = $this->client->listPaymentIntents(['limit' => 10]);

        $this->assertCount(2, $result['data']);
        $this->assertEquals('pi_1', $result['data'][0]['id']);
    }

    public function testVerifyWebhookSignature(): void
    {
        $payload = '{"type":"payment_intent.succeeded","data":{"id":"pi_123"}}';
        $secret = 'whsec_test_secret';
        $timestamp = time() * 1000;

        // Generate valid signature
        $signedPayload = $timestamp . '.' . $payload;
        $signature = hash_hmac('sha256', $signedPayload, $secret);
        $header = "t={$timestamp},v1={$signature},kid=v1";

        $isValid = $this->client->verifyWebhookSignature($header, $payload);

        $this->assertTrue($isValid);
    }

    public function testVerifyWebhookSignatureInvalid(): void
    {
        $payload = '{"type":"payment_intent.succeeded"}';
        $header = 't=1234567890000,v1=invalid_signature,kid=v1';

        $this->expectException(\InvalidArgumentException::class);

        $this->client->verifyWebhookSignature($header, $payload);
    }
}

/**
 * Mock HTTP Client for Testing
 */
class MockHttpClient implements HttpClientInterface
{
    private ?ResponseInterface $nextResponse = null;
    private ?RequestInterface $lastRequest = null;

    public function setNextResponse(ResponseInterface $response): void
    {
        $this->nextResponse = $response;
    }

    public function getLastRequest(): ?RequestInterface
    {
        return $this->lastRequest;
    }

    public function send(RequestInterface $request): ResponseInterface
    {
        $this->lastRequest = $request;

        if ($this->nextResponse === null) {
            throw new \RuntimeException('No response configured for mock HTTP client');
        }

        $response = $this->nextResponse;
        $this->nextResponse = null;

        return $response;
    }
}
