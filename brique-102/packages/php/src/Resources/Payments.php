<?php

namespace Molam\Resources;

use Molam\Http\HttpClient;

class Payments
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * Create a payment intent
     *
     * @param array $payload Payment intent data
     * @return array Payment intent response
     */
    public function create(array $payload): array
    {
        $response = $this->http->post('/v1/payment_intents', [
            'payment_intent' => $payload
        ]);

        return $response['data'] ?? [];
    }

    /**
     * Retrieve a payment intent
     */
    public function retrieve(string $id): array
    {
        $response = $this->http->get("/v1/payment_intents/{$id}");
        return $response['data'] ?? [];
    }

    /**
     * Confirm a payment intent
     */
    public function confirm(string $id): array
    {
        $response = $this->http->post("/v1/payment_intents/{$id}/confirm");
        return $response['data'] ?? [];
    }

    /**
     * Cancel a payment intent
     */
    public function cancel(string $id): array
    {
        $response = $this->http->post("/v1/payment_intents/{$id}/cancel");
        return $response['data'] ?? [];
    }

    /**
     * List payment intents
     */
    public function list(array $params = []): array
    {
        $response = $this->http->get('/v1/payment_intents', ['query' => $params]);
        return $response['data'] ?? [];
    }
}
