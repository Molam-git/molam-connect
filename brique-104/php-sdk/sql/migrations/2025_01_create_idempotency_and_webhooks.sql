-- Molam SDK Database Schema
-- Tables for idempotency and webhook management
-- Compatible with MySQL 5.7+ / MariaDB 10.2+ / PostgreSQL 10+

-- ============================================================================
-- Idempotency Keys Table
-- ============================================================================
-- Stores idempotency keys to prevent duplicate payment operations
-- Recommended TTL: 30 days (cleanup via cron)

CREATE TABLE IF NOT EXISTS molam_idempotency_keys (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    response_data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Webhook Events Table
-- ============================================================================
-- Stores incoming webhook events for processing
-- Supports retry logic and event deduplication

CREATE TABLE IF NOT EXISTS molam_webhook_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload TEXT NOT NULL,
    signature VARCHAR(500) NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    processed BOOLEAN DEFAULT FALSE,
    retry_count INT DEFAULT 0,
    last_error TEXT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    INDEX idx_event_type (event_type),
    INDEX idx_processed (processed),
    INDEX idx_received_at (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Webhook Subscriptions Table (optional)
-- ============================================================================
-- Stores webhook endpoint configurations for multi-tenant applications

CREATE TABLE IF NOT EXISTS molam_webhook_subscriptions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    merchant_id VARCHAR(255) NOT NULL,
    endpoint_url VARCHAR(500) NOT NULL,
    secret VARCHAR(255) NOT NULL,
    event_types JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Payment Cache Table (optional)
-- ============================================================================
-- Caches payment intent data to reduce API calls

CREATE TABLE IF NOT EXISTS molam_payment_cache (
    payment_id VARCHAR(255) PRIMARY KEY,
    payment_data TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    INDEX idx_status (status),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Cleanup Procedures
-- ============================================================================
-- Run these periodically via cron to prevent table bloat

-- Clean up old idempotency keys (older than 30 days)
-- DELIMITER $$
-- CREATE EVENT IF NOT EXISTS cleanup_idempotency_keys
-- ON SCHEDULE EVERY 1 DAY
-- DO
-- BEGIN
--     DELETE FROM molam_idempotency_keys
--     WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
-- END$$
-- DELIMITER ;

-- Clean up processed webhook events (older than 90 days)
-- DELIMITER $$
-- CREATE EVENT IF NOT EXISTS cleanup_webhook_events
-- ON SCHEDULE EVERY 1 DAY
-- DO
-- BEGIN
--     DELETE FROM molam_webhook_events
--     WHERE processed = TRUE
--     AND received_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
-- END$$
-- DELIMITER ;

-- ============================================================================
-- PostgreSQL Compatibility Notes
-- ============================================================================
-- For PostgreSQL, use these adjustments:
--
-- 1. Replace AUTO_INCREMENT with SERIAL or BIGSERIAL
-- 2. Replace TEXT with JSONB for JSON columns
-- 3. Replace TIMESTAMP with TIMESTAMPTZ
-- 4. Replace ENGINE=InnoDB with storage parameters
-- 5. Use CREATE INDEX instead of inline INDEX definitions
--
-- Example for PostgreSQL:
-- CREATE TABLE molam_idempotency_keys (
--     idempotency_key VARCHAR(255) PRIMARY KEY,
--     response_data JSONB NOT NULL,
--     created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
-- );
-- CREATE INDEX idx_idempotency_created_at ON molam_idempotency_keys(created_at);

-- ============================================================================
-- Usage Examples
-- ============================================================================

-- Insert idempotency key
-- INSERT INTO molam_idempotency_keys (idempotency_key, response_data)
-- VALUES ('molam-abc123', '{"payment_intent_id": "pi_xyz789", "status": "succeeded"}')
-- ON DUPLICATE KEY UPDATE response_data = VALUES(response_data);

-- Check if idempotency key exists
-- SELECT response_data FROM molam_idempotency_keys WHERE idempotency_key = 'molam-abc123';

-- Insert webhook event
-- INSERT INTO molam_webhook_events (event_id, event_type, payload, signature)
-- VALUES ('evt_123', 'payment_intent.succeeded', '{"data": {...}}', 't=123,v1=abc...');

-- Mark webhook as processed
-- UPDATE molam_webhook_events
-- SET processed = TRUE, processed_at = NOW()
-- WHERE event_id = 'evt_123';
