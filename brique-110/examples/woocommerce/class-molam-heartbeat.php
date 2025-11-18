<?php
/**
 * Molam Heartbeat Class
 *
 * Sends telemetry data to Molam API for plugin monitoring
 *
 * @package Molam_Form
 * @since 1.0.0
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

class Molam_Heartbeat {

    /**
     * Plugin version
     */
    const PLUGIN_VERSION = '1.3.5';

    /**
     * API endpoint
     */
    private $api_url = 'https://api.molam.com/v1/plugins/heartbeat';

    /**
     * Merchant ID
     */
    private $merchant_id;

    /**
     * API Key
     */
    private $api_key;

    /**
     * Error counter
     */
    private $error_count = 0;

    /**
     * Constructor
     */
    public function __construct() {
        $this->merchant_id = get_option('molam_merchant_id');
        $this->api_key = get_option('molam_api_key');

        // Send heartbeat every hour
        add_action('molam_send_heartbeat', array($this, 'send_heartbeat'));

        if (!wp_next_scheduled('molam_send_heartbeat')) {
            wp_schedule_event(time(), 'hourly', 'molam_send_heartbeat');
        }

        // Track errors
        add_action('molam_payment_error', array($this, 'track_error'));
        add_action('molam_payment_success', array($this, 'track_success'));

        // Log telemetry events
        add_action('molam_log_event', array($this, 'log_event'), 10, 3);
    }

    /**
     * Send heartbeat to Molam API
     *
     * @return bool Success status
     */
    public function send_heartbeat() {
        if (empty($this->merchant_id) || empty($this->api_key)) {
            error_log('Molam: Merchant ID or API Key not configured');
            return false;
        }

        // Calculate error rate (last hour)
        $error_rate = $this->calculate_error_rate();

        // Get server info
        $server_info = array(
            'php_version' => PHP_VERSION,
            'wordpress_version' => get_bloginfo('version'),
            'woocommerce_version' => defined('WC_VERSION') ? WC_VERSION : 'N/A',
            'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
            'max_execution_time' => ini_get('max_execution_time'),
            'memory_limit' => ini_get('memory_limit')
        );

        // Build payload
        $body = array(
            'merchant_id' => $this->merchant_id,
            'cms' => 'woocommerce',
            'plugin_version' => self::PLUGIN_VERSION,
            'sdk_language' => 'php',
            'errors_last_hour' => $error_rate,
            'environment' => $this->get_environment(),
            'php_version' => PHP_VERSION,
            'wordpress_version' => get_bloginfo('version'),
            'server_info' => $server_info,
            'metadata' => array(
                'site_url' => get_site_url(),
                'admin_email' => get_option('admin_email'),
                'timezone' => get_option('timezone_string')
            )
        );

        // Send request
        $response = wp_remote_post($this->api_url, array(
            'headers' => array(
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $this->api_key
            ),
            'body' => json_encode($body),
            'timeout' => 15
        ));

        if (is_wp_error($response)) {
            error_log('Molam Heartbeat Error: ' . $response->get_error_message());
            return false;
        }

        $response_code = wp_remote_retrieve_response_code($response);
        $response_body = json_decode(wp_remote_retrieve_body($response), true);

        if ($response_code === 200) {
            // Check for Ops toggles
            if (isset($response_body['toggles'])) {
                $this->process_toggles($response_body['toggles']);
            }

            update_option('molam_last_heartbeat', current_time('timestamp'));
            return true;
        }

        error_log('Molam Heartbeat Failed: ' . $response_code);
        return false;
    }

    /**
     * Process Ops toggles from API response
     *
     * @param array $toggles Toggles from API
     */
    private function process_toggles($toggles) {
        // Handle block_plugin toggle
        if (isset($toggles['block_plugin']) && $toggles['block_plugin'] === true) {
            // Deactivate plugin
            deactivate_plugins(plugin_basename(__FILE__));
            wp_die('This plugin has been disabled by Molam Ops. Please contact support@molam.com');
        }

        // Handle force_update toggle
        if (isset($toggles['force_update']) && $toggles['force_update'] === true) {
            // Set admin notice for forced update
            set_transient('molam_force_update_notice', true, DAY_IN_SECONDS);
        }

        // Handle enable_debug toggle
        if (isset($toggles['enable_debug']) && $toggles['enable_debug'] === true) {
            update_option('molam_debug_mode', true);
        }
    }

    /**
     * Track payment error
     *
     * @param array $error Error details
     */
    public function track_error($error) {
        $this->error_count++;
        update_option('molam_error_count', get_option('molam_error_count', 0) + 1);

        // Log error event
        $this->log_event('payment_failed', $error, 'error');
    }

    /**
     * Track payment success
     *
     * @param array $payment Payment details
     */
    public function track_success($payment) {
        update_option('molam_success_count', get_option('molam_success_count', 0) + 1);

        // Log success event
        $this->log_event('payment_success', $payment, 'info');
    }

    /**
     * Log telemetry event
     *
     * @param string $event_type Event type
     * @param array $event_data Event data
     * @param string $severity Severity level
     */
    public function log_event($event_type, $event_data, $severity = 'info') {
        if (empty($this->merchant_id) || empty($this->api_key)) {
            return;
        }

        $payload = array(
            'merchant_id' => $this->merchant_id,
            'cms' => 'woocommerce',
            'event_type' => $event_type,
            'event_data' => $event_data,
            'severity' => $severity,
            'stack_trace' => $severity === 'error' ? $this->get_stack_trace() : null
        );

        wp_remote_post('https://api.molam.com/v1/plugins/event', array(
            'headers' => array(
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $this->api_key
            ),
            'body' => json_encode($payload),
            'timeout' => 10,
            'blocking' => false // Non-blocking request
        ));
    }

    /**
     * Calculate error rate (last hour)
     *
     * @return float Error rate percentage
     */
    private function calculate_error_rate() {
        $errors = get_option('molam_error_count', 0);
        $successes = get_option('molam_success_count', 0);
        $total = $errors + $successes;

        if ($total === 0) {
            return 0;
        }

        return round(($errors / $total) * 100, 2);
    }

    /**
     * Get environment (production/staging/development)
     *
     * @return string Environment
     */
    private function get_environment() {
        if (defined('WP_ENVIRONMENT_TYPE')) {
            return WP_ENVIRONMENT_TYPE;
        }

        if (strpos(get_site_url(), 'localhost') !== false || strpos(get_site_url(), '127.0.0.1') !== false) {
            return 'development';
        }

        if (strpos(get_site_url(), 'staging') !== false || strpos(get_site_url(), 'dev') !== false) {
            return 'staging';
        }

        return 'production';
    }

    /**
     * Get stack trace for error logging
     *
     * @return string Stack trace
     */
    private function get_stack_trace() {
        $trace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS);
        $stack = array();

        foreach ($trace as $frame) {
            if (isset($frame['file']) && isset($frame['line'])) {
                $stack[] = $frame['file'] . ':' . $frame['line'];
            }
        }

        return implode("\n", $stack);
    }

    /**
     * Deactivation hook
     */
    public static function deactivate() {
        wp_clear_scheduled_hook('molam_send_heartbeat');
    }
}

// Initialize heartbeat
new Molam_Heartbeat();

// Register deactivation hook
register_deactivation_hook(__FILE__, array('Molam_Heartbeat', 'deactivate'));
