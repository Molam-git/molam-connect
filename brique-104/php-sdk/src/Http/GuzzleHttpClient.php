<?php

declare(strict_types=1);

namespace Molam\SDK\Http;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use Molam\SDK\Exceptions\NetworkException;
use Molam\SDK\Exceptions\TimeoutException;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;

/**
 * Guzzle HTTP Client Implementation
 *
 * Production-ready HTTP client with:
 * - Automatic retries with exponential backoff
 * - Configurable timeouts
 * - Request/response logging
 * - SSL verification
 */
class GuzzleHttpClient implements HttpClientInterface
{
    private GuzzleClient $client;
    private LoggerInterface $logger;

    /**
     * @param array<string, mixed> $options Guzzle options
     * @param LoggerInterface|null $logger Optional PSR-3 logger
     */
    public function __construct(array $options = [], ?LoggerInterface $logger = null)
    {
        $this->logger = $logger ?? new NullLogger();

        // Build handler stack with retry middleware
        $stack = HandlerStack::create();
        $stack->push(Middleware::retry($this->retryDecider(), $this->retryDelay()));

        // Merge with default options
        $defaultOptions = [
            'handler' => $stack,
            'timeout' => 10.0,
            'connect_timeout' => 5.0,
            'verify' => true, // SSL verification
            'http_errors' => false, // Handle errors manually
        ];

        $this->client = new GuzzleClient(array_merge($defaultOptions, $options));
    }

    /**
     * Send HTTP request.
     *
     * @param RequestInterface $request PSR-7 request
     * @return ResponseInterface PSR-7 response
     * @throws NetworkException On network errors
     * @throws TimeoutException On timeout
     */
    public function send(RequestInterface $request): ResponseInterface
    {
        $this->logger->debug('HTTP Request', [
            'method' => $request->getMethod(),
            'uri' => (string) $request->getUri(),
            'headers' => $this->sanitizeHeaders($request->getHeaders()),
        ]);

        try {
            $response = $this->client->send($request);

            $this->logger->debug('HTTP Response', [
                'status' => $response->getStatusCode(),
                'headers' => $response->getHeaders(),
            ]);

            return $response;
        } catch (ConnectException $e) {
            $this->logger->error('HTTP Connection Error', [
                'message' => $e->getMessage(),
                'uri' => (string) $request->getUri(),
            ]);

            if (str_contains($e->getMessage(), 'timed out')) {
                throw new TimeoutException(
                    'Connection timeout: ' . $e->getMessage(),
                    0,
                    $e
                );
            }

            throw new NetworkException(
                'Network error: ' . $e->getMessage(),
                0,
                $e
            );
        } catch (RequestException $e) {
            $this->logger->error('HTTP Request Error', [
                'message' => $e->getMessage(),
                'uri' => (string) $request->getUri(),
            ]);

            throw new NetworkException(
                'Request failed: ' . $e->getMessage(),
                0,
                $e
            );
        }
    }

    /**
     * Retry decider: retry on network errors and 5xx responses.
     *
     * @return callable
     */
    private function retryDecider(): callable
    {
        return function (
            int $retries,
            RequestInterface $request,
            ?ResponseInterface $response = null,
            ?\Exception $exception = null
        ): bool {
            // Max 3 retries
            if ($retries >= 3) {
                return false;
            }

            // Retry on connection errors
            if ($exception instanceof ConnectException) {
                $this->logger->warning('Retrying after connection error', [
                    'attempt' => $retries + 1,
                    'error' => $exception->getMessage(),
                ]);
                return true;
            }

            // Retry on 5xx server errors
            if ($response && $response->getStatusCode() >= 500) {
                $this->logger->warning('Retrying after server error', [
                    'attempt' => $retries + 1,
                    'status' => $response->getStatusCode(),
                ]);
                return true;
            }

            return false;
        };
    }

    /**
     * Retry delay: exponential backoff with jitter.
     *
     * Delay formula: min(10s, 2^attempt * 100ms) + random(0-100ms)
     *
     * @return callable
     */
    private function retryDelay(): callable
    {
        return function (int $retries): int {
            $base = 100; // 100ms
            $cap = 10000; // 10s
            $exponential = (int) min($cap, $base * (2 ** $retries));
            $jitter = random_int(0, 100);

            $delay = $exponential + $jitter;

            $this->logger->debug('Retry delay', [
                'attempt' => $retries,
                'delay_ms' => $delay,
            ]);

            return $delay;
        };
    }

    /**
     * Sanitize headers for logging (mask secrets).
     *
     * @param array<string, mixed> $headers
     * @return array<string, mixed>
     */
    private function sanitizeHeaders(array $headers): array
    {
        $sanitized = [];
        foreach ($headers as $name => $value) {
            if (in_array(strtolower($name), ['authorization', 'x-api-key'], true)) {
                $sanitized[$name] = '***REDACTED***';
            } else {
                $sanitized[$name] = $value;
            }
        }
        return $sanitized;
    }
}
