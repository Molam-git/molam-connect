<?php

namespace Molam;

use Molam\Http\HttpClient;
use Molam\Resources\Payments;
use Molam\Resources\Refunds;
use Molam\Resources\Webhooks;

class MolamClient
{
    /** @var HttpClient */
    private $http;

    /** @var Payments */
    public $payments;

    /** @var Refunds */
    public $refunds;

    /** @var Webhooks */
    public $webhooks;

    /**
     * @param array $options Configuration options
     *   - baseUrl: string (required)
     *   - apiKey: string (required)
     *   - timeoutMs: int (optional, default 8000)
     *   - maxRetries: int (optional, default 3)
     */
    public function __construct(array $options)
    {
        if (empty($options['baseUrl']) || empty($options['apiKey'])) {
            throw new \InvalidArgumentException('baseUrl and apiKey are required');
        }

        $this->http = new HttpClient($options);
        $this->payments = new Payments($this->http);
        $this->refunds = new Refunds($this->http);
        $this->webhooks = new Webhooks($this->http);
    }

    /**
     * Verify webhook signature (static method)
     *
     * @param string $rawBody Raw request body
     * @param string $signatureHeader Molam-Signature header value
     * @param callable $getSecret Function to get secret by kid
     * @return bool
     * @throws \Exception
     */
    public static function verifyWebhook(string $rawBody, string $signatureHeader, callable $getSecret): bool
    {
        $parts = [];
        foreach (explode(',', $signatureHeader) as $part) {
            [$key, $value] = explode('=', $part, 2);
            $parts[$key] = $value;
        }

        if (!isset($parts['t'], $parts['v1'], $parts['kid'])) {
            throw new \Exception('Invalid signature header');
        }

        $timestamp = (int)$parts['t'];
        $now = (int)(microtime(true) * 1000);

        if (abs($now - $timestamp) > 5 * 60 * 1000) {
            throw new \Exception('Signature timestamp outside tolerance');
        }

        $secret = $getSecret($parts['kid']);
        if (empty($secret)) {
            throw new \Exception('No secret found for kid: ' . $parts['kid']);
        }

        $computed = hash_hmac('sha256', $parts['t'] . '.' . $rawBody, $secret);

        if (!hash_equals($computed, $parts['v1'])) {
            throw new \Exception('Signature mismatch');
        }

        return true;
    }
}
