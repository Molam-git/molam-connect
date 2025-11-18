<?php
/**
 * Molam Auto-Healing Plugin Integration for WooCommerce
 *
 * This class handles:
 * - Receiving auto-healing commands from Molam API
 * - Applying patches automatically
 * - Sending interop events to Molam
 * - Creating snapshots before patches
 *
 * @package Molam_Form
 * @version 1.0.0
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

class Molam_AutoHeal {

    /**
     * Plugin version
     */
    const PLUGIN_VERSION = '1.3.5';

    /**
     * Molam API base URL
     */
    private $api_url = 'https://api.molam.com';

    /**
     * Constructor
     */
    public function __construct() {
        // Register REST endpoint for receiving commands
        add_action('rest_api_init', array($this, 'register_rest_routes'));

        // Schedule command polling (every 5 minutes)
        add_action('molam_poll_commands', array($this, 'poll_commands'));
        if (!wp_next_scheduled('molam_poll_commands')) {
            wp_schedule_event(time(), 'molam_5min', 'molam_poll_commands');
        }

        // Hook into WooCommerce events for interop layer
        add_action('woocommerce_checkout_order_processed', array($this, 'send_checkout_event'), 10, 1);
        add_action('woocommerce_payment_complete', array($this, 'send_payment_success_event'), 10, 1);
        add_action('woocommerce_order_refunded', array($this, 'send_refund_event'), 10, 1);

        // Error handler for auto-healing
        add_action('shutdown', array($this, 'check_for_errors'));
    }

    /**
     * Register custom cron schedule (5 minutes)
     */
    public static function add_cron_schedule($schedules) {
        $schedules['molam_5min'] = array(
            'interval' => 300,
            'display'  => __('Every 5 Minutes')
        );
        return $schedules;
    }

    /**
     * Register REST routes for receiving commands
     */
    public function register_rest_routes() {
        register_rest_route('molam/v1', '/command', array(
            'methods'  => 'POST',
            'callback' => array($this, 'receive_command'),
            'permission_callback' => array($this, 'validate_command_auth')
        ));
    }

    /**
     * Validate command authentication
     */
    public function validate_command_auth($request) {
        // TODO: Verify signature or API key from Molam
        $auth_header = $request->get_header('Authorization');
        $expected_key = get_option('molam_api_key');

        return ($auth_header === "Bearer {$expected_key}");
    }

    /**
     * Receive command from Molam API
     */
    public function receive_command($request) {
        $body = $request->get_json_params();

        if (!isset($body['type'])) {
            return new WP_Error('missing_type', 'Command type required', array('status' => 400));
        }

        $command_type = $body['type'];

        switch ($command_type) {
            case 'apply_patch':
                return $this->apply_patch($body);

            case 'rollback':
                return $this->rollback_to_snapshot($body);

            case 'force_update':
                return $this->force_update($body);

            case 'enable_debug':
                return $this->enable_debug($body);

            case 'restart':
                return $this->restart_plugin($body);

            default:
                return new WP_Error('unknown_command', 'Unknown command type', array('status' => 400));
        }
    }

    /**
     * Apply patch
     */
    private function apply_patch($command) {
        try {
            $patch = $command['patch'];
            $healing_log_id = $command['healing_log_id'] ?? null;

            // Create snapshot before applying
            $snapshot = $this->create_snapshot($healing_log_id);

            // Apply patch based on type
            if (isset($patch['type'])) {
                switch ($patch['type']) {
                    case 'dependency_update':
                        $this->update_dependency($patch);
                        break;

                    case 'database_patch':
                        $this->apply_database_patch($patch);
                        break;

                    case 'config_update':
                        $this->update_config($patch);
                        break;

                    case 'code_patch':
                        $this->apply_code_patch($patch);
                        break;

                    default:
                        throw new Exception("Unknown patch type: {$patch['type']}");
                }
            }

            // Acknowledge command
            $this->acknowledge_command($command['id'] ?? null, true, 'Patch applied successfully');

            return array(
                'status' => 'patch_applied',
                'snapshot_id' => $snapshot
            );

        } catch (Exception $e) {
            // Acknowledge failure
            $this->acknowledge_command($command['id'] ?? null, false, $e->getMessage());

            return new WP_Error('patch_failed', $e->getMessage(), array('status' => 500));
        }
    }

    /**
     * Create snapshot before patch
     */
    private function create_snapshot($healing_log_id = null) {
        $snapshot = array(
            'timestamp' => time(),
            'plugin_version' => self::PLUGIN_VERSION,
            'wordpress_version' => get_bloginfo('version'),
            'woocommerce_version' => WC()->version,
            'options' => array(
                'molam_api_key' => get_option('molam_api_key'),
                'molam_merchant_id' => get_option('molam_merchant_id'),
                'molam_debug_mode' => get_option('molam_debug_mode')
            )
        );

        $snapshot_id = uniqid('snapshot_');
        update_option("molam_snapshot_{$snapshot_id}", $snapshot);

        return $snapshot_id;
    }

    /**
     * Rollback to snapshot
     */
    private function rollback_to_snapshot($command) {
        try {
            $snapshot_id = $command['snapshot_id'];
            $snapshot = get_option("molam_snapshot_{$snapshot_id}");

            if (!$snapshot) {
                throw new Exception("Snapshot not found: {$snapshot_id}");
            }

            // Restore options
            foreach ($snapshot['options'] as $key => $value) {
                update_option($key, $value);
            }

            // Note: In production, this would also restore code files from backup

            $this->acknowledge_command($command['id'] ?? null, true, 'Rolled back successfully');

            return array('status' => 'rolled_back', 'snapshot' => $snapshot);

        } catch (Exception $e) {
            $this->acknowledge_command($command['id'] ?? null, false, $e->getMessage());
            return new WP_Error('rollback_failed', $e->getMessage(), array('status' => 500));
        }
    }

    /**
     * Apply database patch
     */
    private function apply_database_patch($patch) {
        global $wpdb;

        if ($patch['action'] === 'add_missing_column') {
            // Example: Add missing column
            $table = $wpdb->prefix . 'molam_transactions';
            $column = $patch['column'] ?? 'new_column';
            $type = $patch['column_type'] ?? 'VARCHAR(255)';

            $wpdb->query("ALTER TABLE {$table} ADD COLUMN {$column} {$type}");
        }
    }

    /**
     * Update config
     */
    private function update_config($patch) {
        if ($patch['target'] === 'memory_limit') {
            // Note: This would typically require php.ini modification
            ini_set('memory_limit', $patch['value']);
        }
    }

    /**
     * Apply code patch
     */
    private function apply_code_patch($patch) {
        // Write patch file
        $patch_dir = plugin_dir_path(__FILE__) . 'patches/';
        if (!file_exists($patch_dir)) {
            mkdir($patch_dir, 0755, true);
        }

        $patch_file = $patch_dir . 'auto_patch_' . time() . '.php';
        file_put_contents($patch_file, $patch['code']);

        // Include patch
        require_once $patch_file;

        update_option('molam_last_patch', $patch_file);
    }

    /**
     * Update dependency
     */
    private function update_dependency($patch) {
        // Notify merchant to update PHP version or dependencies
        update_option('molam_dependency_alert', array(
            'target' => $patch['target'],
            'action' => $patch['action'],
            'timestamp' => time()
        ));
    }

    /**
     * Force update
     */
    private function force_update($command) {
        set_transient('molam_force_update_notice', true, DAY_IN_SECONDS);
        return array('status' => 'update_notice_set');
    }

    /**
     * Enable debug mode
     */
    private function enable_debug($command) {
        update_option('molam_debug_mode', true);
        return array('status' => 'debug_enabled');
    }

    /**
     * Restart plugin (deactivate/reactivate)
     */
    private function restart_plugin($command) {
        // Note: This is a mock - actual restart requires WP-CLI or manual action
        return array('status' => 'restart_requested');
    }

    /**
     * Poll for pending commands
     */
    public function poll_commands() {
        $plugin_id = get_option('molam_plugin_id');
        if (!$plugin_id) {
            return;
        }

        $response = wp_remote_get(
            "{$this->api_url}/v1/plugins/autoheal/commands/{$plugin_id}",
            array(
                'headers' => array(
                    'Authorization' => 'Bearer ' . get_option('molam_api_key')
                )
            )
        );

        if (is_wp_error($response)) {
            return;
        }

        $commands = json_decode(wp_remote_retrieve_body($response), true);

        foreach ($commands as $command) {
            // Execute command
            $this->receive_command(new WP_REST_Request('POST', '/molam/v1/command', $command));
        }
    }

    /**
     * Acknowledge command execution
     */
    private function acknowledge_command($command_id, $success, $message = '') {
        if (!$command_id) {
            return;
        }

        wp_remote_post(
            "{$this->api_url}/v1/plugins/autoheal/commands/{$command_id}/ack",
            array(
                'headers' => array(
                    'Authorization' => 'Bearer ' . get_option('molam_api_key'),
                    'Content-Type' => 'application/json'
                ),
                'body' => json_encode(array(
                    'success' => $success,
                    'error' => $success ? null : $message,
                    'result' => array(
                        'timestamp' => time(),
                        'plugin_version' => self::PLUGIN_VERSION
                    )
                ))
            )
        );
    }

    /**
     * Send interop event - Checkout Created
     */
    public function send_checkout_event($order_id) {
        $order = wc_get_order($order_id);

        $this->send_interop_event('checkout.created', array(
            'order_id' => $order_id,
            'amount' => $order->get_total(),
            'currency' => $order->get_currency(),
            'customer_id' => $order->get_customer_id(),
            'payment_method' => $order->get_payment_method()
        ));
    }

    /**
     * Send interop event - Payment Success
     */
    public function send_payment_success_event($order_id) {
        $order = wc_get_order($order_id);

        $this->send_interop_event('payment.succeeded', array(
            'order_id' => $order_id,
            'amount' => $order->get_total(),
            'currency' => $order->get_currency(),
            'payment_method' => $order->get_payment_method()
        ));
    }

    /**
     * Send interop event - Refund
     */
    public function send_refund_event($order_id) {
        $order = wc_get_order($order_id);

        $this->send_interop_event('refund.issued', array(
            'order_id' => $order_id,
            'amount' => $order->get_total_refunded(),
            'currency' => $order->get_currency()
        ));
    }

    /**
     * Send interop event to Molam API
     */
    private function send_interop_event($event_type, $payload) {
        $plugin_id = get_option('molam_plugin_id');
        if (!$plugin_id) {
            return;
        }

        wp_remote_post(
            "{$this->api_url}/v1/plugins/interop/event",
            array(
                'headers' => array(
                    'Authorization' => 'Bearer ' . get_option('molam_api_key'),
                    'Content-Type' => 'application/json'
                ),
                'body' => json_encode(array(
                    'plugin_id' => $plugin_id,
                    'event_type' => $event_type,
                    'payload' => $payload
                ))
            )
        );
    }

    /**
     * Check for errors (for auto-healing detection)
     */
    public function check_for_errors() {
        $error = error_get_last();

        if ($error && in_array($error['type'], array(E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR, E_PARSE))) {
            // Send error event to Molam
            $this->send_interop_event('plugin.error', array(
                'error_type' => $error['type'],
                'error_message' => $error['message'],
                'error_file' => $error['file'],
                'error_line' => $error['line']
            ));
        }
    }
}

// Initialize
add_filter('cron_schedules', array('Molam_AutoHeal', 'add_cron_schedule'));
new Molam_AutoHeal();
