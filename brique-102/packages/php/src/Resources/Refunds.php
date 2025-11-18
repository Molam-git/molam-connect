<?php

namespace Molam\Resources;

use Molam\Http\HttpClient;

class Refunds
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * Create a refund
     *
     * @param array $payload Refund data
     * @param string|null $idempotencyKey Optional idempotency key
     * @return array Refund response
     */
    public function create(array $payload, ?string $idempotencyKey = null): array
    {
        $options = [];
        if ($idempotencyKey) {
            $options['headers'] = ['Idempotency-Key' => $idempotencyKey];
        }

        $response = $this->http->post('/v1/refunds', [
            'refund' => $payload
        ], $options);

        return $response['data'] ?? [];
    }

    /**
     * Retrieve a refund
     */
    public function retrieve(string $id): array
    {
        $response = $this->http->get("/v1/refunds/{$id}");
        return $response['data'] ?? [];
    }

    /**
     * List refunds
     */
    public function list(array $params = []): array
    {
        $response = $this->http->get('/v1/refunds', ['query' => $params]);
        return $response['data'] ?? [];
    }
}
