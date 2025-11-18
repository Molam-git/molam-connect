<?php

namespace Molam\Resources;

use Molam\Http\HttpClient;

class Webhooks
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * Verify webhook signature
     *
     * @param string $rawBody Raw request body
     * @param string $signatureHeader Molam-Signature header value
     * @param string $secret Webhook secret
     * @return bool
     * @throws \Exception
     */
    public function verifySignature(string $rawBody, string $signatureHeader, string $secret): bool
    {
        $parts = [];
        foreach (explode(',', $signatureHeader) as $part) {
            [$key, $value] = explode('=', $part, 2);
            $parts[$key] = $value;
        }

        if (!isset($parts['t'], $parts['v1'])) {
            throw new \Exception('Invalid signature header format');
        }

        // Check timestamp (5-minute tolerance)
        $timestamp = (int)$parts['t'];
        $now = (int)(microtime(true) * 1000);

        if (abs($now - $timestamp) > 5 * 60 * 1000) {
            throw new \Exception('Signature timestamp outside tolerance');
        }

        // Compute HMAC
        $computed = hash_hmac('sha256', $parts['t'] . '.' . $rawBody, $secret);

        // Constant-time comparison
        if (!hash_equals($computed, $parts['v1'])) {
            throw new \Exception('Signature mismatch');
        }

        return true;
    }

    /**
     * Create webhook endpoint
     */
    public function createEndpoint(string $tenantType, string $tenantId, string $url, array $events): array
    {
        $payload = [
            'tenant_type' => $tenantType,
            'tenant_id' => $tenantId,
            'url' => $url,
            'events' => $events
        ];

        return $this->http->post('/v1/webhooks/endpoints', $payload);
    }

    /**
     * List webhook endpoints
     */
    public function listEndpoints(string $tenantType, string $tenantId): array
    {
        return $this->http->get("/v1/webhooks/endpoints?tenant_type={$tenantType}&tenant_id={$tenantId}");
    }

    /**
     * Delete webhook endpoint
     */
    public function deleteEndpoint(string $endpointId): array
    {
        return $this->http->delete("/v1/webhooks/endpoints/{$endpointId}");
    }
}
