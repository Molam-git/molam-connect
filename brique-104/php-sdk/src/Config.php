<?php

declare(strict_types=1);

namespace Molam\SDK;

use InvalidArgumentException;

/**
 * Molam SDK Configuration
 *
 * Holds all configuration parameters for the SDK client.
 * Can be initialized from environment variables or constructor array.
 */
class Config
{
    public string $apiBase;
    public string $apiKey;
    public ?string $vaultEndpoint = null;
    public string $webhookSecret;
    public string $defaultCurrency = 'USD';
    public string $defaultLocale = 'en';
    public string $sdkVersion = '1.0.0';
    public float $timeout = 10.0;
    public int $maxRetries = 3;
    public bool $verifySSL = true;
    public bool $debug = false;

    /**
     * Create configuration from options array.
     *
     * @param array<string, mixed> $opts Configuration options
     * @throws InvalidArgumentException If required configuration is missing
     */
    public function __construct(array $opts = [])
    {
        // API Base URL
        $this->apiBase = $opts['api_base']
            ?? $_ENV['MOLAM_API_BASE']
            ?? getenv('MOLAM_API_BASE')
            ?: 'https://api.molam.io';

        // API Key (required)
        $this->apiKey = $opts['api_key']
            ?? $_ENV['MOLAM_API_KEY']
            ?? getenv('MOLAM_API_KEY')
            ?: '';

        if (empty($this->apiKey)) {
            throw new InvalidArgumentException(
                "Molam API Key is required. Provide via 'api_key' option or MOLAM_API_KEY environment variable."
            );
        }

        // Validate API key format
        if (!str_starts_with($this->apiKey, 'sk_')) {
            throw new InvalidArgumentException(
                "Invalid API key format. Must start with 'sk_'"
            );
        }

        // Webhook Secret
        $this->webhookSecret = $opts['webhook_secret']
            ?? $_ENV['MOLAM_WEBHOOK_SECRET']
            ?? getenv('MOLAM_WEBHOOK_SECRET')
            ?? '';

        // Optional Configuration
        $this->defaultCurrency = $opts['default_currency']
            ?? $_ENV['MOLAM_DEFAULT_CURRENCY']
            ?? getenv('MOLAM_DEFAULT_CURRENCY')
            ?: 'USD';

        $this->defaultLocale = $opts['default_locale']
            ?? $_ENV['MOLAM_DEFAULT_LOCALE']
            ?? getenv('MOLAM_DEFAULT_LOCALE')
            ?: 'en';

        $this->timeout = (float) ($opts['timeout'] ?? 10.0);
        $this->maxRetries = (int) ($opts['max_retries'] ?? 3);
        $this->verifySSL = (bool) ($opts['verify_ssl'] ?? true);
        $this->debug = (bool) ($opts['debug'] ?? false);
        $this->vaultEndpoint = $opts['vault_endpoint'] ?? null;

        // Validate timeout
        if ($this->timeout <= 0) {
            throw new InvalidArgumentException("Timeout must be positive");
        }

        // Enforce TLS in production
        if (!$this->debug && !str_starts_with($this->apiBase, 'https://')) {
            throw new InvalidArgumentException(
                "API base must use HTTPS in production. Set debug=true to override."
            );
        }
    }

    /**
     * Get sanitized configuration for logging (no secrets).
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'api_base' => $this->apiBase,
            'api_key' => $this->maskSecret($this->apiKey),
            'default_currency' => $this->defaultCurrency,
            'default_locale' => $this->defaultLocale,
            'timeout' => $this->timeout,
            'max_retries' => $this->maxRetries,
            'verify_ssl' => $this->verifySSL,
            'debug' => $this->debug,
        ];
    }

    /**
     * Mask secret for logging.
     */
    private function maskSecret(string $secret): string
    {
        if (strlen($secret) < 8) {
            return '***';
        }
        return substr($secret, 0, 7) . '***';
    }
}
