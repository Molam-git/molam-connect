<?php

namespace Molam\Http;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Molam\Exceptions\MolamException;

class HttpClient
{
    /** @var Client */
    private $client;

    /** @var int */
    private $maxRetries;

    /** @var array */
    private $options;

    public function __construct(array $options)
    {
        $this->options = $options;
        $this->maxRetries = $options['maxRetries'] ?? 3;

        $this->client = new Client([
            'base_uri' => $options['baseUrl'],
            'timeout' => ($options['timeoutMs'] ?? 8000) / 1000,
            'headers' => [
                'Authorization' => 'Bearer ' . $options['apiKey'],
                'Content-Type' => 'application/json',
                'User-Agent' => 'Molam-SDK-PHP/2.0'
            ]
        ]);
    }

    /**
     * Make GET request
     */
    public function get(string $path, array $options = []): array
    {
        return $this->requestWithRetry('GET', $path, $options);
    }

    /**
     * Make POST request
     */
    public function post(string $path, array $body = [], array $options = []): array
    {
        $options['json'] = $body;
        return $this->requestWithRetry('POST', $path, $options);
    }

    /**
     * Make PUT request
     */
    public function put(string $path, array $body = [], array $options = []): array
    {
        $options['json'] = $body;
        return $this->requestWithRetry('PUT', $path, $options);
    }

    /**
     * Make DELETE request
     */
    public function delete(string $path, array $options = []): array
    {
        return $this->requestWithRetry('DELETE', $path, $options);
    }

    /**
     * Request with automatic retries
     */
    private function requestWithRetry(string $method, string $path, array $options): array
    {
        // Add idempotency key
        if (!isset($options['headers']['Idempotency-Key'])) {
            $options['headers']['Idempotency-Key'] = $this->generateIdempotencyKey();
        }

        $attempt = 0;

        while (true) {
            try {
                $response = $this->client->request($method, $path, $options);
                $body = json_decode((string)$response->getBody(), true);
                return $body ?? [];
            } catch (RequestException $e) {
                $status = $e->getResponse() ? $e->getResponse()->getStatusCode() : null;

                if ($attempt >= $this->maxRetries || !$this->isRetryableStatus($status)) {
                    throw MolamException::fromGuzzleException($e);
                }

                // Backoff
                $wait = $this->backoff($attempt);
                usleep($wait * 1000);
                $attempt++;
            }
        }
    }

    private function isRetryableStatus(?int $status): bool
    {
        if ($status === null) {
            return true;
        }

        if ($status >= 500) {
            return true;
        }

        return in_array($status, [408, 429, 425], true);
    }

    private function backoff(int $attempt): int
    {
        $sequence = [200, 500, 1000, 2000, 5000];
        return $sequence[min($attempt, count($sequence) - 1)];
    }

    private function generateIdempotencyKey(): string
    {
        return bin2hex(random_bytes(16));
    }
}
