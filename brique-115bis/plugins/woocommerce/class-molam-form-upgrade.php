<?php
/**
 * Sous-Brique 115bis: Molam Form Upgrade & Rollback
 * Classe pour gérer les upgrades sécurisés avec rollback automatique
 *
 * @package MolamForm
 * @version 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class Molam_Form_Upgrade {

    const BACKUP_DIR = WP_CONTENT_DIR . '/molam-backups/';
    const PLUGIN_DIR = WP_PLUGIN_DIR . '/molam-form/';

    /**
     * Safe upgrade with automatic rollback on failure
     *
     * @param string $current_version Current plugin version
     * @param bool $force_upgrade Force upgrade even if not in rollout (default: false)
     * @return array Upgrade result
     */
    public static function safe_upgrade($current_version, $force_upgrade = false) {
        $start_time = microtime(true);
        $rollback_id = null;

        try {
            // Get latest version from API
            $latest = self::get_latest_version();

            if (version_compare($latest['version'], $current_version, '<=')) {
                return [
                    'status' => 'up_to_date',
                    'current_version' => $current_version,
                    'latest_version' => $latest['version']
                ];
            }

            // Check progressive rollout eligibility (unless forced)
            if (!$force_upgrade && class_exists('Molam_Form_Rollout')) {
                $merchant_id = get_current_user_id();
                $rollout_decision = Molam_Form_Rollout::should_upgrade(
                    $merchant_id,
                    'woocommerce',
                    $latest['version']
                );

                // Log decision for analytics
                Molam_Form_Rollout::log_rollout_decision($merchant_id, 'woocommerce', $rollout_decision);

                if (!$rollout_decision['should_upgrade']) {
                    error_log("Molam Form: Upgrade skipped - not in rollout cohort: " . $rollout_decision['reason']);

                    return [
                        'status' => 'skipped',
                        'reason' => $rollout_decision['reason'],
                        'current_version' => $current_version,
                        'latest_version' => $latest['version'],
                        'rollout_info' => $rollout_decision
                    ];
                }

                error_log("Molam Form: Merchant selected for upgrade: " . $rollout_decision['reason']);
            }

            error_log("Molam Form: Starting upgrade from {$current_version} to {$latest['version']}");

            // Step 1: Create backup
            $backup_result = self::backup($current_version);
            if (!$backup_result['success']) {
                throw new Exception('Backup failed: ' . $backup_result['error']);
            }

            // Step 2: Initiate rollback tracking
            $rollback_id = self::initiate_rollback_tracking(
                $current_version,
                $latest['version'],
                'automatic'
            );

            // Step 3: Download new version
            $download_path = self::download_version($latest['download_url'], $latest['checksum']);

            // Step 4: Apply upgrade (migrations, file replacement)
            self::apply_upgrade($current_version, $latest['version'], $download_path);

            // Step 5: Verify upgrade success
            self::verify_upgrade($latest['version']);

            $duration_ms = (microtime(true) - $start_time) * 1000;

            // Mark rollback as not required
            if ($rollback_id) {
                self::complete_rollback($rollback_id, [
                    'success' => true,
                    'duration_ms' => $duration_ms,
                    'error_message' => 'Upgrade successful, rollback not required'
                ]);
            }

            // Update API
            self::log_to_api([
                'merchant_id' => get_current_user_id(),
                'plugin_name' => 'woocommerce',
                'rollback_version' => $current_version,
                'status' => 'not_required'
            ]);

            error_log("Molam Form: Upgrade successful in {$duration_ms}ms");

            return [
                'status' => 'success',
                'from_version' => $current_version,
                'to_version' => $latest['version'],
                'duration_ms' => $duration_ms
            ];

        } catch (Exception $e) {
            $duration_ms = (microtime(true) - $start_time) * 1000;

            error_log("Molam Form: Upgrade failed: " . $e->getMessage());

            // Automatic rollback
            $rollback_result = self::rollback($current_version, [
                'rollback_id' => $rollback_id,
                'reason' => $e->getMessage(),
                'duration_ms' => $duration_ms
            ]);

            return [
                'status' => 'failed',
                'error' => $e->getMessage(),
                'rollback_status' => $rollback_result['status'],
                'current_version' => $current_version
            ];
        }
    }

    /**
     * Create backup of current plugin and database
     *
     * @param string $version Version to backup
     * @return array Backup result
     */
    private static function backup($version) {
        try {
            $backup_timestamp = date('Y-m-d_H-i-s');
            $backup_name = "molam-form-{$version}-{$backup_timestamp}";

            // Create backup directory
            if (!file_exists(self::BACKUP_DIR)) {
                mkdir(self::BACKUP_DIR, 0755, true);
            }

            // Backup files (plugin directory)
            $file_backup_path = self::BACKUP_DIR . $backup_name . '/';

            if (!self::copy_directory(self::PLUGIN_DIR, $file_backup_path)) {
                throw new Exception('Failed to backup plugin files');
            }

            // Backup database tables
            global $wpdb;
            $tables = [
                $wpdb->prefix . 'molam_orders',
                $wpdb->prefix . 'molam_transactions',
                $wpdb->prefix . 'molam_webhooks'
            ];

            $db_backup_name = $backup_name . '_db';

            foreach ($tables as $table) {
                $backup_table = $table . '_backup_' . str_replace(['-', '_'], '', $version);

                // Drop existing backup table
                $wpdb->query("DROP TABLE IF EXISTS {$backup_table}");

                // Create backup
                $wpdb->query("CREATE TABLE {$backup_table} LIKE {$table}");
                $wpdb->query("INSERT INTO {$backup_table} SELECT * FROM {$table}");
            }

            // Calculate backup size
            $backup_size = self::get_directory_size($file_backup_path);

            // Log backup to API
            self::log_backup_to_api([
                'merchant_id' => get_current_user_id(),
                'plugin_name' => 'woocommerce',
                'version' => $version,
                'backup_path' => $file_backup_path,
                'db_snapshot_name' => $db_backup_name,
                'backup_size_bytes' => $backup_size
            ]);

            error_log("Molam Form: Backup created successfully at {$file_backup_path}");

            return [
                'success' => true,
                'backup_path' => $file_backup_path,
                'db_backup_name' => $db_backup_name,
                'size_bytes' => $backup_size
            ];

        } catch (Exception $e) {
            error_log("Molam Form: Backup failed: " . $e->getMessage());

            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }

    /**
     * Download and verify new version
     *
     * @param string $download_url Download URL
     * @param string $expected_checksum Expected checksum
     * @return string Downloaded file path
     * @throws Exception
     */
    private static function download_version($download_url, $expected_checksum) {
        $temp_file = self::BACKUP_DIR . 'temp-' . basename($download_url);

        // Download file
        $response = wp_remote_get($download_url, [
            'timeout' => 300,
            'stream' => true,
            'filename' => $temp_file
        ]);

        if (is_wp_error($response)) {
            throw new Exception('Download failed: ' . $response->get_error_message());
        }

        // Verify checksum
        $actual_checksum = hash_file('sha256', $temp_file);

        if ($actual_checksum !== $expected_checksum) {
            unlink($temp_file);
            throw new Exception('Checksum verification failed');
        }

        error_log("Molam Form: Downloaded and verified new version");

        return $temp_file;
    }

    /**
     * Apply upgrade (extract files, run migrations)
     *
     * @param string $from_version Current version
     * @param string $to_version Target version
     * @param string $download_path Path to downloaded file
     * @throws Exception
     */
    private static function apply_upgrade($from_version, $to_version, $download_path) {
        // Extract archive
        $extract_path = self::BACKUP_DIR . 'extract-temp/';

        WP_Filesystem();
        $result = unzip_file($download_path, $extract_path);

        if (is_wp_error($result)) {
            throw new Exception('Extraction failed: ' . $result->get_error_message());
        }

        // Replace plugin files
        if (!self::copy_directory($extract_path, self::PLUGIN_DIR)) {
            throw new Exception('Failed to replace plugin files');
        }

        // Run database migrations
        self::run_migrations($from_version, $to_version);

        // Cleanup
        unlink($download_path);
        self::delete_directory($extract_path);

        error_log("Molam Form: Upgrade applied successfully");
    }

    /**
     * Run database migrations
     *
     * @param string $from_version
     * @param string $to_version
     * @throws Exception
     */
    private static function run_migrations($from_version, $to_version) {
        global $wpdb;

        $migrations_dir = self::PLUGIN_DIR . 'migrations/';

        if (!file_exists($migrations_dir)) {
            return; // No migrations
        }

        $migration_files = glob($migrations_dir . '*.sql');
        sort($migration_files);

        foreach ($migration_files as $migration_file) {
            $sql = file_get_contents($migration_file);

            $result = $wpdb->query($sql);

            if ($result === false) {
                throw new Exception('Migration failed: ' . $migration_file);
            }

            error_log("Molam Form: Ran migration: " . basename($migration_file));
        }
    }

    /**
     * Verify upgrade success
     *
     * @param string $expected_version
     * @throws Exception
     */
    private static function verify_upgrade($expected_version) {
        // Check plugin version file
        $version_file = self::PLUGIN_DIR . 'molam-form.php';

        if (!file_exists($version_file)) {
            throw new Exception('Plugin file missing after upgrade');
        }

        $plugin_data = get_file_data($version_file, ['Version' => 'Version']);

        if ($plugin_data['Version'] !== $expected_version) {
            throw new Exception('Version mismatch after upgrade');
        }

        // Test payment processing (smoke test)
        $test_result = self::test_payment_processing();

        if (!$test_result) {
            throw new Exception('Payment processing test failed');
        }

        error_log("Molam Form: Upgrade verification passed");
    }

    /**
     * Rollback to previous version
     *
     * @param string $version Version to rollback to
     * @param array $options Rollback options
     * @return array Rollback result
     */
    private static function rollback($version, $options = []) {
        $start_time = microtime(true);
        $rollback_id = $options['rollback_id'] ?? null;

        try {
            error_log("Molam Form: Starting rollback to version {$version}");

            // Find latest backup for this version
            $backup = self::find_latest_backup($version);

            if (!$backup) {
                throw new Exception('No backup found for version ' . $version);
            }

            // Restore files
            $files_restored = self::restore_files($backup['path']);

            // Restore database
            $db_restored = self::restore_database($version);

            $duration_ms = (microtime(true) - $start_time) * 1000;

            // Complete rollback tracking
            if ($rollback_id) {
                self::complete_rollback($rollback_id, [
                    'success' => true,
                    'duration_ms' => $duration_ms,
                    'files_restored' => $files_restored,
                    'db_restored' => $db_restored
                ]);
            }

            // Update API
            self::log_to_api([
                'merchant_id' => get_current_user_id(),
                'plugin_name' => 'woocommerce',
                'rollback_version' => $version,
                'status' => 'success',
                'reason' => $options['reason'] ?? 'Automatic rollback'
            ]);

            error_log("Molam Form: Rollback completed successfully in {$duration_ms}ms");

            return [
                'status' => 'success',
                'version' => $version,
                'duration_ms' => $duration_ms,
                'files_restored' => $files_restored,
                'db_restored' => $db_restored
            ];

        } catch (Exception $e) {
            $duration_ms = (microtime(true) - $start_time) * 1000;

            error_log("Molam Form: Rollback failed: " . $e->getMessage());

            if ($rollback_id) {
                self::complete_rollback($rollback_id, [
                    'success' => false,
                    'duration_ms' => $duration_ms,
                    'error_message' => $e->getMessage()
                ]);
            }

            // Update API
            self::log_to_api([
                'merchant_id' => get_current_user_id(),
                'plugin_name' => 'woocommerce',
                'rollback_version' => $version,
                'status' => 'failed',
                'reason' => $e->getMessage()
            ]);

            return [
                'status' => 'failed',
                'error' => $e->getMessage()
            ];
        }
    }

    /**
     * Restore plugin files from backup
     *
     * @param string $backup_path
     * @return int Number of files restored
     */
    private static function restore_files($backup_path) {
        // Delete current plugin directory
        self::delete_directory(self::PLUGIN_DIR);

        // Restore from backup
        $files_count = self::copy_directory($backup_path, self::PLUGIN_DIR, true);

        error_log("Molam Form: Restored {$files_count} files from backup");

        return $files_count;
    }

    /**
     * Restore database from backup
     *
     * @param string $version
     * @return bool Success status
     */
    private static function restore_database($version) {
        global $wpdb;

        $tables = [
            $wpdb->prefix . 'molam_orders',
            $wpdb->prefix . 'molam_transactions',
            $wpdb->prefix . 'molam_webhooks'
        ];

        $version_clean = str_replace(['-', '_'], '', $version);

        foreach ($tables as $table) {
            $backup_table = $table . '_backup_' . $version_clean;

            // Check if backup exists
            $table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$backup_table}'");

            if (!$table_exists) {
                error_log("Molam Form: Backup table {$backup_table} not found");
                continue;
            }

            // Drop current table
            $wpdb->query("DROP TABLE IF EXISTS {$table}");

            // Restore from backup
            $wpdb->query("CREATE TABLE {$table} LIKE {$backup_table}");
            $wpdb->query("INSERT INTO {$table} SELECT * FROM {$backup_table}");

            error_log("Molam Form: Restored table {$table} from backup");
        }

        return true;
    }

    // ... Helper methods continued in next section ...

    /**
     * Get latest version info from API
     */
    private static function get_latest_version() {
        $response = wp_remote_get(MOLAM_API_URL . '/plugins/latest/woocommerce', [
            'headers' => [
                'Authorization' => 'Bearer ' . get_option('molam_api_key')
            ]
        ]);

        if (is_wp_error($response)) {
            throw new Exception('API request failed: ' . $response->get_error_message());
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        return $body;
    }

    /**
     * Find latest backup for version
     */
    private static function find_latest_backup($version) {
        $backups = glob(self::BACKUP_DIR . "molam-form-{$version}-*/");

        if (empty($backups)) {
            return null;
        }

        // Sort by modification time (newest first)
        usort($backups, function($a, $b) {
            return filemtime($b) - filemtime($a);
        });

        return [
            'path' => $backups[0],
            'created_at' => filemtime($backups[0])
        ];
    }

    /**
     * Copy directory recursively
     */
    private static function copy_directory($source, $dest, $count_files = false) {
        $files_copied = 0;

        if (!file_exists($dest)) {
            mkdir($dest, 0755, true);
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($source, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $item) {
            $target = $dest . DIRECTORY_SEPARATOR . $iterator->getSubPathName();

            if ($item->isDir()) {
                mkdir($target, 0755, true);
            } else {
                copy($item, $target);
                $files_copied++;
            }
        }

        return $count_files ? $files_copied : true;
    }

    /**
     * Delete directory recursively
     */
    private static function delete_directory($dir) {
        if (!file_exists($dir)) {
            return true;
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($iterator as $item) {
            if ($item->isDir()) {
                rmdir($item);
            } else {
                unlink($item);
            }
        }

        return rmdir($dir);
    }

    /**
     * Get directory size in bytes
     */
    private static function get_directory_size($path) {
        $size = 0;

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, RecursiveDirectoryIterator::SKIP_DOTS)
        );

        foreach ($iterator as $file) {
            $size += $file->getSize();
        }

        return $size;
    }

    /**
     * Test payment processing (smoke test)
     */
    private static function test_payment_processing() {
        // Simple smoke test: check if key classes are loaded
        return class_exists('Molam_Payment_Gateway') &&
               class_exists('Molam_Webhook_Handler') &&
               function_exists('molam_process_payment');
    }

    /**
     * Initiate rollback tracking via API
     */
    private static function initiate_rollback_tracking($from_version, $to_version, $trigger) {
        $response = wp_remote_post(MOLAM_API_URL . '/plugins/rollback/initiate', [
            'headers' => [
                'Authorization' => 'Bearer ' . get_option('molam_api_key'),
                'Content-Type' => 'application/json'
            ],
            'body' => json_encode([
                'merchant_id' => get_current_user_id(),
                'plugin_name' => 'woocommerce',
                'from_version' => $from_version,
                'to_version' => $to_version,
                'trigger' => $trigger,
                'reason' => 'Automatic upgrade initiated'
            ])
        ]);

        if (!is_wp_error($response)) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            return $body['rollback_id'] ?? null;
        }

        return null;
    }

    /**
     * Complete rollback tracking via API
     */
    private static function complete_rollback($rollback_id, $data) {
        wp_remote_post(MOLAM_API_URL . "/plugins/rollback/{$rollback_id}/complete", [
            'headers' => [
                'Authorization' => 'Bearer ' . get_option('molam_api_key'),
                'Content-Type' => 'application/json'
            ],
            'body' => json_encode($data)
        ]);
    }

    /**
     * Log to API
     */
    private static function log_to_api($data) {
        wp_remote_post(MOLAM_API_URL . '/plugins/rollback', [
            'headers' => [
                'Authorization' => 'Bearer ' . get_option('molam_api_key'),
                'Content-Type' => 'application/json'
            ],
            'body' => json_encode($data)
        ]);
    }

    /**
     * Log backup to API
     */
    private static function log_backup_to_api($data) {
        wp_remote_post(MOLAM_API_URL . '/plugins/backup', [
            'headers' => [
                'Authorization' => 'Bearer ' . get_option('molam_api_key'),
                'Content-Type' => 'application/json'
            ],
            'body' => json_encode($data)
        ]);
    }
}
