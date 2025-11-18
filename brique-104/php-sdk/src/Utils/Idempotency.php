<?php

declare(strict_types=1);

namespace Molam\SDK\Utils;

use PDO;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;

/**
 * Idempotency Manager
 *
 * Prevents duplicate payment operations by tracking idempotency keys.
 * Uses database storage for distributed systems.
 *
 * Schema:
 * CREATE TABLE molam_idempotency_keys (
 *   idempotency_key VARCHAR(255) PRIMARY KEY,
 *   response_data TEXT,
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   INDEX idx_created_at (created_at)
 * );
 */
class Idempotency
{
    private PDO $pdo;
    private LoggerInterface $logger;
    private string $tableName = 'molam_idempotency_keys';

    public function __construct(PDO $pdo, ?LoggerInterface $logger = null)
    {
        $this->pdo = $pdo;
        $this->logger = $logger ?? new NullLogger();
    }

    /**
     * Generate a new idempotency key.
     *
     * Format: "molam-{uuid}"
     */
    public static function generate(): string
    {
        return 'molam-' . self::generateUuid();
    }

    /**
     * Check if idempotency key exists and return cached response.
     *
     * @param string $key Idempotency key
     * @return array|null Cached response data or null if not found
     */
    public function getCached(string $key): ?array
    {
        $stmt = $this->pdo->prepare(
            "SELECT response_data FROM {$this->tableName} WHERE idempotency_key = :key LIMIT 1"
        );
        $stmt->execute(['key' => $key]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row) {
            $this->logger->debug('Idempotency key cache hit', ['key' => $key]);
            return json_decode($row['response_data'], true);
        }

        $this->logger->debug('Idempotency key cache miss', ['key' => $key]);
        return null;
    }

    /**
     * Store response data for idempotency key.
     *
     * @param string $key Idempotency key
     * @param array<string, mixed> $responseData Response data to cache
     */
    public function store(string $key, array $responseData): void
    {
        try {
            $stmt = $this->pdo->prepare(
                "INSERT INTO {$this->tableName} (idempotency_key, response_data) VALUES (:key, :data)"
            );
            $stmt->execute([
                'key' => $key,
                'data' => json_encode($responseData),
            ]);

            $this->logger->debug('Stored idempotency key', ['key' => $key]);
        } catch (\PDOException $e) {
            // Ignore duplicate key errors (race condition)
            if ($e->getCode() !== '23000') {
                throw $e;
            }
            $this->logger->warning('Idempotency key already exists', ['key' => $key]);
        }
    }

    /**
     * Clean up old idempotency keys (older than specified days).
     *
     * Run this periodically via cron job.
     *
     * @param int $daysOld Keys older than this many days will be deleted
     * @return int Number of deleted keys
     */
    public function cleanup(int $daysOld = 30): int
    {
        $stmt = $this->pdo->prepare(
            "DELETE FROM {$this->tableName} WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)"
        );
        $stmt->execute(['days' => $daysOld]);

        $deleted = $stmt->rowCount();
        $this->logger->info('Cleaned up old idempotency keys', [
            'days_old' => $daysOld,
            'deleted' => $deleted,
        ]);

        return $deleted;
    }

    /**
     * Generate UUID v4.
     *
     * @return string UUID string without hyphens
     */
    private static function generateUuid(): string
    {
        $data = random_bytes(16);

        // Set version (4) and variant bits
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);

        return bin2hex($data);
    }
}
