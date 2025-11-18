<?php

/**
 * Molam Form Core - PHP Server SDK
 * For server-side payment intent creation and management
 *
 * Usage:
 * require_once 'MolamSDK.php';
 * $molam = new Molam\MolamSDK('sk_test_xxx');
 *
 * $intent = $molam->paymentIntents->create([
 *   'amount' => 100.00,
 *   'currency' => 'USD',
 *   'customer_email' => 'customer@example.com'
 * ]);
 */

namespace Molam;

const SDK_VERSION = '1.0.0';
const API_BASE_URL = 'https://api.molam.com/form';

class MolamException extends \Exception
{
    public $statusCode;
    public $code;

    public function __construct($message, $statusCode = null, $code = null)
    {
        parent::__construct($message);
        $this->statusCode = $statusCode;
        $this->code = $code;
    }
}

class MolamSDK
{
    private $apiKey;
    private $environment;
    private $baseUrl;
    private $timeout;

    public $paymentIntents;
    public $apiKeys;
    public $logs;

    public function __construct($apiKey, $options = [])
    {
        if (empty($apiKey) || strpos($apiKey, 'sk_') !== 0) {
            throw new \InvalidArgumentException('Invalid API key. Must be a secret key starting with "sk_"');
        }

        $this->apiKey = $apiKey;
        $this->environment = strpos($apiKey, 'sk_test_') === 0 ? 'test' : 'live';
        $this->baseUrl = $options['baseUrl'] ?? API_BASE_URL;
        $this->timeout = $options['timeout'] ?? 30;

        // Initialize resource handlers
        $this->paymentIntents = new PaymentIntents($this);
        $this->apiKeys = new ApiKeys($this);
        $this->logs = new Logs($this);
    }

    /**
     * Make HTTP request to Molam API
     */
    public function request($method, $path, $data = null)
    {
        $url = $this->baseUrl . $path;

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $this->apiKey,
            'Content-Type: application/json',
            'User-Agent: Molam PHP SDK/' . SDK_VERSION,
        ]);

        if ($data !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }

        $response = curl_exec($ch);
        $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            throw new MolamException('Network error: ' . $error, null, 'network_error');
        }

        $json = json_decode($response, true);
        if ($json === null) {
            throw new MolamException('Invalid JSON response', $statusCode, 'parse_error');
        }

        if ($statusCode < 200 || $statusCode >= 300) {
            throw new MolamException(
                $json['message'] ?? 'API request failed',
                $statusCode,
                $json['error'] ?? null
            );
        }

        return $json;
    }

    public function getEnvironment()
    {
        return $this->environment;
    }
}

/**
 * Payment Intents Resource
 */
class PaymentIntents
{
    private $sdk;

    public function __construct($sdk)
    {
        $this->sdk = $sdk;
    }

    /**
     * Create a payment intent
     */
    public function create($params)
    {
        $amount = $params['amount'] ?? null;
        $currency = $params['currency'] ?? null;

        if (empty($amount) || $amount <= 0) {
            throw new \InvalidArgumentException('amount must be a positive number');
        }

        if (empty($currency)) {
            throw new \InvalidArgumentException('currency is required');
        }

        return $this->sdk->request('POST', '/payment-intents', [
            'amount' => $amount,
            'currency' => strtoupper($currency),
            'customer_email' => $params['customer_email'] ?? null,
            'customer_name' => $params['customer_name'] ?? null,
            'description' => $params['description'] ?? null,
            'metadata' => $params['metadata'] ?? [],
            'payment_method_type' => $params['payment_method_type'] ?? null,
            'return_url' => $params['return_url'] ?? null,
        ]);
    }

    /**
     * Retrieve a payment intent
     */
    public function retrieve($intentId)
    {
        if (empty($intentId)) {
            throw new \InvalidArgumentException('intentId is required');
        }

        return $this->sdk->request('GET', "/payment-intents/{$intentId}");
    }

    /**
     * Update a payment intent
     */
    public function update($intentId, $params)
    {
        if (empty($intentId)) {
            throw new \InvalidArgumentException('intentId is required');
        }

        $action = $params['action'] ?? null;
        if (empty($action)) {
            throw new \InvalidArgumentException('action is required (confirm, capture, cancel)');
        }

        return $this->sdk->request('PATCH', "/payment-intents/{$intentId}", [
            'action' => $action,
            'payment_method_token' => $params['payment_method_token'] ?? null,
        ]);
    }

    /**
     * Confirm a payment intent
     */
    public function confirm($intentId, $paymentMethodToken)
    {
        return $this->update($intentId, [
            'action' => 'confirm',
            'payment_method_token' => $paymentMethodToken,
        ]);
    }

    /**
     * Capture a payment intent
     */
    public function capture($intentId)
    {
        return $this->update($intentId, ['action' => 'capture']);
    }

    /**
     * Cancel a payment intent
     */
    public function cancel($intentId)
    {
        return $this->update($intentId, ['action' => 'cancel']);
    }
}

/**
 * API Keys Resource
 */
class ApiKeys
{
    private $sdk;

    public function __construct($sdk)
    {
        $this->sdk = $sdk;
    }

    /**
     * Generate a new API key
     */
    public function create($params)
    {
        if (empty($params['merchant_id']) || empty($params['key_type']) || empty($params['environment'])) {
            throw new \InvalidArgumentException('merchant_id, key_type, and environment are required');
        }

        return $this->sdk->request('POST', '/api-keys', [
            'merchant_id' => $params['merchant_id'],
            'key_type' => $params['key_type'],
            'environment' => $params['environment'],
        ]);
    }

    /**
     * List API keys
     */
    public function listKeys($merchantId)
    {
        if (empty($merchantId)) {
            throw new \InvalidArgumentException('merchantId is required');
        }

        return $this->sdk->request('GET', "/api-keys?merchant_id={$merchantId}");
    }

    /**
     * Revoke an API key
     */
    public function revoke($keyId)
    {
        if (empty($keyId)) {
            throw new \InvalidArgumentException('keyId is required');
        }

        return $this->sdk->request('DELETE', "/api-keys/{$keyId}");
    }
}

/**
 * Logs Resource
 */
class Logs
{
    private $sdk;

    public function __construct($sdk)
    {
        $this->sdk = $sdk;
    }

    /**
     * Create a log entry
     */
    public function create($params)
    {
        if (empty($params['event_type'])) {
            throw new \InvalidArgumentException('event_type is required');
        }

        return $this->sdk->request('POST', '/logs', [
            'event_type' => $params['event_type'],
            'sdk_version' => $params['sdk_version'] ?? SDK_VERSION,
            'platform' => $params['platform'] ?? 'php',
            'payload' => $params['payload'] ?? [],
            'intent_reference' => $params['intent_reference'] ?? null,
        ]);
    }

    /**
     * List logs for a merchant
     */
    public function listLogs($params = [])
    {
        if (empty($params['merchant_id'])) {
            throw new \InvalidArgumentException('merchant_id is required');
        }

        $query = http_build_query([
            'merchant_id' => $params['merchant_id'],
            'limit' => $params['limit'] ?? 100,
            'offset' => $params['offset'] ?? 0,
            'event_type' => $params['event_type'] ?? null,
        ]);

        return $this->sdk->request('GET', "/logs?{$query}");
    }
}
