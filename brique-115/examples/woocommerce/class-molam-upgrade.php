<?php
/**
 * Brique 115 - Plugin Versioning & Migration Strategy
 * WooCommerce Plugin - Auto-Upgrade Class
 * 
 * Handles automatic plugin updates, version checking, and migrations
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

class Molam_Form_Upgrade {
    
    const PLUGIN_NAME = 'woocommerce';
    const API_BASE_URL = 'https://api.molam.com';
    const MANIFEST_FILE = 'manifest.json';
    
    private $current_version;
    private $merchant_id;
    private $api_key;
    
    public function __construct() {
        $this->current_version = get_option('molam_plugin_version', '1.0.0');
        $this->merchant_id = get_option('molam_merchant_id');
        $this->api_key = get_option('molam_api_key');
        
        // Hook into WordPress update system
        add_action('admin_init', array($this, 'maybe_check_updates'));
        add_action('wp_loaded', array($this, 'maybe_auto_upgrade'));
    }
    
    /**
     * Check for updates periodically
     */
    public function maybe_check_updates() {
        // Check once per day
        $last_check = get_option('molam_last_update_check', 0);
        if (time() - $last_check < 86400) {
            return;
        }
        
        $this->check_for_updates();
        update_option('molam_last_update_check', time());
    }
    
    /**
     * Check registry for available updates
     */
    public function check_for_updates() {
        try {
            $response = wp_remote_get(
                self::API_BASE_URL . '/api/plugins/check-update/' . self::PLUGIN_NAME,
                array(
                    'headers' => array(
                        'Authorization' => 'Bearer ' . $this->api_key
                    ),
                    'body' => array(
                        'current_version' => $this->current_version,
                        'api_version' => $this->get_api_version()
                    )
                )
            );
            
            if (is_wp_error($response)) {
                error_log('Molam: Failed to check updates: ' . $response->get_error_message());
                return;
            }
            
            $body = json_decode(wp_remote_retrieve_body($response), true);
            
            if ($body['update_available']) {
                // Store update info
                update_option('molam_update_available', $body);
                
                // Show admin notice
                add_action('admin_notices', function() use ($body) {
                    echo '<div class="notice notice-info is-dismissible">';
                    echo '<p><strong>Molam Form:</strong> A new version (' . esc_html($body['latest_version']) . ') is available. ';
                    echo '<a href="' . admin_url('admin.php?page=molam-upgrade') . '">Update now</a></p>';
                    echo '</div>';
                });
            }
            
        } catch (Exception $e) {
            error_log('Molam: Update check error: ' . $e->getMessage());
        }
    }
    
    /**
     * Auto-upgrade if enabled
     */
    public function maybe_auto_upgrade() {
        $auto_update_enabled = get_option('molam_auto_update_enabled', false);
        
        if (!$auto_update_enabled) {
            return;
        }
        
        $update_info = get_option('molam_update_available');
        if (!$update_info || !$update_info['update_available']) {
            return;
        }
        
        // Check if compatible
        if (!$update_info['compatible']) {
            error_log('Molam: Update not compatible: ' . $update_info['compatibility_reason']);
            return;
        }
        
        // Perform upgrade
        $this->perform_upgrade($update_info['latest_version']);
    }
    
    /**
     * Perform plugin upgrade
     */
    public function perform_upgrade($target_version) {
        global $wpdb;
        
        $from_version = $this->current_version;
        $upgrade_log_id = null;
        
        try {
            // 1. Log upgrade start
            $log_response = wp_remote_post(
                self::API_BASE_URL . '/api/plugins/logs',
                array(
                    'headers' => array(
                        'Authorization' => 'Bearer ' . $this->api_key,
                        'Content-Type' => 'application/json'
                    ),
                    'body' => json_encode(array(
                        'merchant_id' => $this->merchant_id,
                        'plugin_name' => self::PLUGIN_NAME,
                        'from_version' => $from_version,
                        'to_version' => $target_version,
                        'status' => 'in_progress',
                        'execution_method' => 'auto_update'
                    ))
                )
            );
            
            if (!is_wp_error($log_response)) {
                $log_body = json_decode(wp_remote_retrieve_body($log_response), true);
                $upgrade_log_id = $log_body['log_id'] ?? null;
            }
            
            // 2. Get registry info for target version
            $registry_response = wp_remote_get(
                self::API_BASE_URL . '/api/plugins/registry/' . self::PLUGIN_NAME . '/latest',
                array(
                    'headers' => array(
                        'Authorization' => 'Bearer ' . $this->api_key
                    )
                )
            );
            
            if (is_wp_error($registry_response)) {
                throw new Exception('Failed to get registry info');
            }
            
            $registry = json_decode(wp_remote_retrieve_body($registry_response), true);
            
            // 3. Download new version
            $package_path = $this->download_plugin($registry);
            
            // 4. Verify checksum
            $checksum = hash_file('sha256', $package_path);
            if ($checksum !== str_replace('sha256-', '', $registry['checksum'])) {
                throw new Exception('Checksum mismatch');
            }
            
            // 5. Create backup
            $backup_path = $this->create_backup();
            
            // 6. Apply migrations
            $migrations_applied = $this->apply_migrations($from_version, $target_version);
            
            // 7. Install new version
            $this->install_plugin($package_path);
            
            // 8. Update version
            update_option('molam_plugin_version', $target_version);
            $this->current_version = $target_version;
            
            // 9. Log success
            wp_remote_post(
                self::API_BASE_URL . '/api/plugins/logs',
                array(
                    'headers' => array(
                        'Authorization' => 'Bearer ' . $this->api_key,
                        'Content-Type' => 'application/json'
                    ),
                    'body' => json_encode(array(
                        'merchant_id' => $this->merchant_id,
                        'plugin_name' => self::PLUGIN_NAME,
                        'from_version' => $from_version,
                        'to_version' => $target_version,
                        'status' => 'success',
                        'details' => array(
                            'backup_created' => !empty($backup_path),
                            'migrations_applied' => $migrations_applied
                        ),
                        'migrations_applied' => $migrations_applied
                    ))
                )
            );
            
            // Clear update cache
            delete_option('molam_update_available');
            
            error_log("Molam: Successfully upgraded from {$from_version} to {$target_version}");
            
        } catch (Exception $e) {
            error_log('Molam: Upgrade failed: ' . $e->getMessage());
            
            // Log failure
            wp_remote_post(
                self::API_BASE_URL . '/api/plugins/logs',
                array(
                    'headers' => array(
                        'Authorization' => 'Bearer ' . $this->api_key,
                        'Content-Type' => 'application/json'
                    ),
                    'body' => json_encode(array(
                        'merchant_id' => $this->merchant_id,
                        'plugin_name' => self::PLUGIN_NAME,
                        'from_version' => $from_version,
                        'to_version' => $target_version,
                        'status' => 'failed',
                        'error_message' => $e->getMessage()
                    ))
                )
            );
            
            // Rollback if backup exists
            if (!empty($backup_path)) {
                $this->rollback($backup_path);
            }
        }
    }
    
    /**
     * Apply migrations between versions
     */
    private function apply_migrations($from_version, $to_version) {
        global $wpdb;
        $migrations_applied = array();
        
        // Migration 1.1.0: Add fx_rate column
        if (version_compare($from_version, '1.1.0', '<') && version_compare($to_version, '1.1.0', '>=')) {
            $table_name = $wpdb->prefix . 'molam_orders';
            $wpdb->query("ALTER TABLE {$table_name} ADD COLUMN IF NOT EXISTS fx_rate DECIMAL(18,6)");
            $migrations_applied[] = '1.1.0';
        }
        
        // Migration 1.2.0: Update checkout style option
        if (version_compare($from_version, '1.2.0', '<') && version_compare($to_version, '1.2.0', '>=')) {
            update_option('molam_checkout_style', 'minimal');
            $migrations_applied[] = '1.2.0';
        }
        
        // Migration 1.3.0: Add webhook retry table
        if (version_compare($from_version, '1.3.0', '<') && version_compare($to_version, '1.3.0', '>=')) {
            $table_name = $wpdb->prefix . 'molam_webhook_retries';
            $wpdb->query("
                CREATE TABLE IF NOT EXISTS {$table_name} (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    webhook_id VARCHAR(255),
                    retry_count INT DEFAULT 0,
                    last_retry_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ");
            $migrations_applied[] = '1.3.0';
        }
        
        return $migrations_applied;
    }
    
    /**
     * Download plugin package
     */
    private function download_plugin($registry) {
        $download_url = $registry['download_url'];
        if (!$download_url) {
            throw new Exception('Download URL not available');
        }
        
        $upload_dir = wp_upload_dir();
        $package_path = $upload_dir['path'] . '/molam-plugin-' . $registry['version'] . '.zip';
        
        $response = wp_remote_get($download_url, array(
            'timeout' => 300,
            'stream' => true,
            'filename' => $package_path
        ));
        
        if (is_wp_error($response)) {
            throw new Exception('Download failed: ' . $response->get_error_message());
        }
        
        return $package_path;
    }
    
    /**
     * Create backup before upgrade
     */
    private function create_backup() {
        $backup_dir = WP_CONTENT_DIR . '/backups/molam';
        if (!file_exists($backup_dir)) {
            wp_mkdir_p($backup_dir);
        }
        
        $backup_file = $backup_dir . '/backup-' . date('Y-m-d-His') . '.zip';
        
        // Backup plugin files
        $plugin_dir = WP_PLUGIN_DIR . '/molam-form';
        if (file_exists($plugin_dir)) {
            // Use WordPress zip functionality or system zip
            // Simplified - in production use proper backup
            copy($plugin_dir, $backup_file);
        }
        
        return $backup_file;
    }
    
    /**
     * Install plugin from package
     */
    private function install_plugin($package_path) {
        // Use WordPress plugin installation API
        require_once(ABSPATH . 'wp-admin/includes/class-wp-upgrader.php');
        require_once(ABSPATH . 'wp-admin/includes/plugin-install.php');
        require_once(ABSPATH . 'wp-admin/includes/file.php');
        require_once(ABSPATH . 'wp-admin/includes/misc.php');
        
        $upgrader = new Plugin_Upgrader();
        $result = $upgrader->install($package_path);
        
        if (is_wp_error($result)) {
            throw new Exception('Installation failed: ' . $result->get_error_message());
        }
    }
    
    /**
     * Rollback to backup
     */
    private function rollback($backup_path) {
        // Restore from backup
        // Implementation depends on backup format
        error_log('Molam: Rolling back from backup: ' . $backup_path);
    }
    
    /**
     * Get current API version
     */
    private function get_api_version() {
        // Return current API version being used
        return '2025-01'; // Format: YYYY-MM
    }
    
    /**
     * Get manifest.json content
     */
    public function get_manifest() {
        $manifest_path = plugin_dir_path(__FILE__) . self::MANIFEST_FILE;
        
        if (!file_exists($manifest_path)) {
            return null;
        }
        
        return json_decode(file_get_contents($manifest_path), true);
    }
}

// Initialize upgrade handler
new Molam_Form_Upgrade();

