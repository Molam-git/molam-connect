<?php

declare(strict_types=1);

namespace Molam\SDK\Utils;

use InvalidArgumentException;

/**
 * Webhook Signature Verifier
 *
 * Verifies HMAC-SHA256 signatures from Molam webhooks to ensure authenticity.
 *
 * Signature format: "t=<timestamp>,v1=<hmac>,kid=<key_id>"
 * Signed payload: "<timestamp>.<json_body>"
 *
 * Security features:
 * - HMAC-SHA256 cryptographic verification
 * - Timestamp validation (prevents replay attacks)
 * - Constant-time comparison (prevents timing attacks)
 * - Multiple secret versions support via kid (key rotation)
 */
class WebhookVerifier
{
    private const DEFAULT_TOLERANCE_SECONDS = 300; // 5 minutes

    /**
     * Verify webhook signature.
     *
     * @param string $signatureHeader Value of "Molam-Signature" HTTP header
     * @param string $payload Raw request body (JSON string)
     * @param callable $secretProvider Function to get secret by key ID: fn(string $kid): string
     * @param int $toleranceSeconds Max age of webhook (default: 300s = 5min)
     * @return bool True if signature is valid
     * @throws InvalidArgumentException If signature format is invalid
     */
    public static function verify(
        string $signatureHeader,
        string $payload,
        callable $secretProvider,
        int $toleranceSeconds = self::DEFAULT_TOLERANCE_SECONDS
    ): bool {
        // Parse signature header
        $parts = self::parseSignatureHeader($signatureHeader);

        // Validate timestamp (replay protection)
        $timestamp = (int) $parts['t'];
        $currentTime = time() * 1000; // Convert to milliseconds

        if (abs($currentTime - $timestamp) > $toleranceSeconds * 1000) {
            throw new InvalidArgumentException(
                'Webhook timestamp outside tolerance window. Possible replay attack.'
            );
        }

        // Get secret for key ID
        $kid = $parts['kid'] ?? 'v1';
        $secret = $secretProvider($kid);

        if (empty($secret)) {
            throw new InvalidArgumentException("No secret found for key ID: {$kid}");
        }

        // Compute expected signature
        $signedPayload = $parts['t'] . '.' . $payload;
        $expectedSignature = hash_hmac('sha256', $signedPayload, $secret);

        // Constant-time comparison (prevents timing attacks)
        return hash_equals($expectedSignature, $parts['v1']);
    }

    /**
     * Parse signature header into components.
     *
     * @param string $header Signature header value
     * @return array<string, string> Components: t, v1, kid
     * @throws InvalidArgumentException If header format is invalid
     */
    private static function parseSignatureHeader(string $header): array
    {
        $parts = [];

        foreach (explode(',', $header) as $pair) {
            $kv = explode('=', $pair, 2);
            if (count($kv) !== 2) {
                throw new InvalidArgumentException('Invalid signature header format');
            }
            $parts[trim($kv[0])] = trim($kv[1]);
        }

        // Validate required fields
        if (!isset($parts['t']) || !isset($parts['v1'])) {
            throw new InvalidArgumentException(
                'Signature header missing required fields (t, v1)'
            );
        }

        return $parts;
    }

    /**
     * Generate signature for testing purposes.
     *
     * @param string $payload JSON payload
     * @param string $secret Webhook secret
     * @param int|null $timestamp Optional timestamp (default: now)
     * @param string $kid Key ID (default: 'v1')
     * @return string Signature header value
     */
    public static function generateSignature(
        string $payload,
        string $secret,
        ?int $timestamp = null,
        string $kid = 'v1'
    ): string {
        $timestamp = $timestamp ?? (time() * 1000);
        $signedPayload = $timestamp . '.' . $payload;
        $signature = hash_hmac('sha256', $signedPayload, $secret);

        return "t={$timestamp},v1={$signature},kid={$kid}";
    }
}
