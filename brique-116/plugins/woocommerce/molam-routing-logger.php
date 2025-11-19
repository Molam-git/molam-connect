<?php
/**
 * Brique 116: Molam Routing Logger
 * Helper functions pour logger les tentatives de routing de paiement
 *
 * @package MolamForm
 * @version 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class Molam_Routing_Logger {

    /**
     * Log a payment routing attempt
     *
     * @param string $transaction_id Transaction UUID
     * @param string $merchant_id Merchant UUID
     * @param string|null $user_id User UUID
     * @param string $method Payment method: 'wallet' | 'card' | 'bank'
     * @param string $route Route identifier (e.g., 'VISA_US', 'MTN_SN', 'SEPA_FR')
     * @param float $amount Amount charged
     * @param string $currency Currency code (ISO 4217)
     * @param string $status Status: 'success' | 'failed' | 'retried'
     * @param int|null $latency_ms Latency in milliseconds
     * @param string|null $error_code Error code if failed
     * @param string|null $fallback_route Fallback route used if primary failed
     * @param string|null $country_code Country code (ISO 3166-1)
     * @param string|null $provider Payment provider name
     * @param array $metadata Additional metadata
     * @return bool Success status
     */
    public static function log(
        $transaction_id,
        $merchant_id,
        $user_id,
        $method,
        $route,
        $amount,
        $currency,
        $status,
        $latency_ms = null,
        $error_code = null,
        $fallback_route = null,
        $country_code = null,
        $provider = null,
        $metadata = []
    ) {
        $api_url = defined('MOLAM_API_URL') ? MOLAM_API_URL : 'https://api.molam.com';
        $api_key = get_option('molam_api_key');

        if (!$api_key) {
            error_log('Molam Routing Logger: API key not configured');
            return false;
        }

        // Validation
        $valid_methods = ['wallet', 'card', 'bank'];
        if (!in_array($method, $valid_methods)) {
            error_log("Molam Routing Logger: Invalid method '{$method}'");
            return false;
        }

        $valid_statuses = ['success', 'failed', 'retried'];
        if (!in_array($status, $valid_statuses)) {
            error_log("Molam Routing Logger: Invalid status '{$status}'");
            return false;
        }

        $payload = [
            'transaction_id' => $transaction_id,
            'merchant_id' => $merchant_id,
            'user_id' => $user_id,
            'method' => $method,
            'route' => $route,
            'amount' => floatval($amount),
            'currency' => $currency,
            'status' => $status,
            'latency_ms' => $latency_ms ? intval($latency_ms) : null,
            'error_code' => $error_code,
            'fallback_route' => $fallback_route,
            'country_code' => $country_code,
            'provider' => $provider,
            'metadata' => !empty($metadata) ? $metadata : null
        ];

        $response = wp_remote_post($api_url . '/api/charges/routing-log', [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-User-Role' => 'plugin_client'
            ],
            'body' => json_encode($payload),
            'timeout' => 5,
            'blocking' => false  // Non-blocking for performance
        ]);

        if (is_wp_error($response)) {
            error_log('Molam Routing Logger: ' . $response->get_error_message());
            return false;
        }

        return true;
    }

    /**
     * Log successful payment routing
     *
     * @param string $transaction_id Transaction UUID
     * @param string $route Route used
     * @param float $amount Amount
     * @param string $currency Currency code
     * @param int $latency_ms Latency in milliseconds
     * @return bool
     */
    public static function log_success($transaction_id, $route, $amount, $currency, $latency_ms = null) {
        $merchant_id = self::get_merchant_id();
        $user_id = self::get_user_id();
        $method = self::detect_method($route);

        return self::log(
            $transaction_id,
            $merchant_id,
            $user_id,
            $method,
            $route,
            $amount,
            $currency,
            'success',
            $latency_ms
        );
    }

    /**
     * Log failed payment routing
     *
     * @param string $transaction_id Transaction UUID
     * @param string $route Route attempted
     * @param float $amount Amount
     * @param string $currency Currency code
     * @param string $error_code Error code
     * @param int $latency_ms Latency in milliseconds
     * @param string|null $fallback_route Fallback route if used
     * @return bool
     */
    public static function log_failure($transaction_id, $route, $amount, $currency, $error_code, $latency_ms = null, $fallback_route = null) {
        $merchant_id = self::get_merchant_id();
        $user_id = self::get_user_id();
        $method = self::detect_method($route);

        return self::log(
            $transaction_id,
            $merchant_id,
            $user_id,
            $method,
            $route,
            $amount,
            $currency,
            'failed',
            $latency_ms,
            $error_code,
            $fallback_route
        );
    }

    /**
     * Log retried payment routing
     *
     * @param string $transaction_id Transaction UUID
     * @param string $route New route for retry
     * @param float $amount Amount
     * @param string $currency Currency code
     * @param string $original_route Original failed route
     * @return bool
     */
    public static function log_retry($transaction_id, $route, $amount, $currency, $original_route) {
        $merchant_id = self::get_merchant_id();
        $user_id = self::get_user_id();
        $method = self::detect_method($route);

        return self::log(
            $transaction_id,
            $merchant_id,
            $user_id,
            $method,
            $route,
            $amount,
            $currency,
            'retried',
            null,
            null,
            $original_route
        );
    }

    /**
     * Get merchant ID from WooCommerce settings
     *
     * @return string
     */
    private static function get_merchant_id() {
        $merchant_id = get_option('molam_merchant_id');

        if (!$merchant_id) {
            // Fallback: generate from site URL
            $merchant_id = md5(get_site_url());
        }

        return $merchant_id;
    }

    /**
     * Get current user ID
     *
     * @return string|null
     */
    private static function get_user_id() {
        $user_id = get_current_user_id();
        return $user_id ? (string) $user_id : null;
    }

    /**
     * Detect payment method from route name
     *
     * @param string $route Route identifier
     * @return string Method: 'wallet' | 'card' | 'bank'
     */
    private static function detect_method($route) {
        $route_upper = strtoupper($route);

        // Wallet routes
        if (strpos($route_upper, 'MTN') !== false ||
            strpos($route_upper, 'ORANGE') !== false ||
            strpos($route_upper, 'WAVE') !== false ||
            strpos($route_upper, 'MOOV') !== false ||
            strpos($route_upper, 'WALLET') !== false) {
            return 'wallet';
        }

        // Bank transfer routes
        if (strpos($route_upper, 'SEPA') !== false ||
            strpos($route_upper, 'ACH') !== false ||
            strpos($route_upper, 'WIRE') !== false ||
            strpos($route_upper, 'BANK') !== false) {
            return 'bank';
        }

        // Default to card
        return 'card';
    }

    /**
     * Measure execution time of a payment routing operation
     *
     * @param callable $operation Function to execute
     * @param string $transaction_id Transaction UUID
     * @param string $route Route being used
     * @param float $amount Amount
     * @param string $currency Currency code
     * @return mixed Result of the operation
     */
    public static function measure_routing($operation, $transaction_id, $route, $amount, $currency) {
        $start_time = microtime(true);

        try {
            $result = $operation();
            $latency_ms = intval((microtime(true) - $start_time) * 1000);

            // Determine success/failure from result
            $success = true;
            if (is_array($result) && isset($result['success'])) {
                $success = $result['success'];
            }

            if ($success) {
                self::log_success($transaction_id, $route, $amount, $currency, $latency_ms);
            } else {
                $error_code = is_array($result) && isset($result['error_code']) ? $result['error_code'] : 'unknown';
                self::log_failure($transaction_id, $route, $amount, $currency, $error_code, $latency_ms);
            }

            return $result;
        } catch (Exception $e) {
            $latency_ms = intval((microtime(true) - $start_time) * 1000);
            self::log_failure($transaction_id, $route, $amount, $currency, $e->getCode(), $latency_ms);
            throw $e;
        }
    }

    /**
     * Get automatic routing decision from Sira (116bis)
     *
     * @param string $transaction_id Transaction UUID
     * @param float $amount Amount
     * @param string $currency Currency code
     * @param string $method Payment method ('wallet' | 'card' | 'bank')
     * @return array Routing decision with route, confidence, fallback
     */
    public static function get_auto_route($transaction_id, $amount, $currency, $method = 'card') {
        $api_url = defined('MOLAM_API_URL') ? MOLAM_API_URL : 'https://api.molam.com';
        $api_key = get_option('molam_api_key');
        $merchant_id = self::get_merchant_id();
        $user_id = self::get_user_id();

        if (!$api_key) {
            error_log('Molam Auto-Routing: API key not configured');
            return [
                'success' => false,
                'error' => 'API key not configured'
            ];
        }

        $payload = [
            'transaction_id' => $transaction_id,
            'merchant_id' => $merchant_id,
            'user_id' => $user_id,
            'method' => $method,
            'amount' => floatval($amount),
            'currency' => $currency
        ];

        $response = wp_remote_post($api_url . '/api/charges/auto-route', [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-User-Role' => 'plugin_client'
            ],
            'body' => json_encode($payload),
            'timeout' => 10
        ]);

        if (is_wp_error($response)) {
            error_log('Molam Auto-Routing: ' . $response->get_error_message());
            return [
                'success' => false,
                'error' => $response->get_error_message()
            ];
        }

        $status_code = wp_remote_retrieve_response_code($response);
        if ($status_code !== 200) {
            error_log("Molam Auto-Routing: API returned status {$status_code}");
            return [
                'success' => false,
                'error' => "API error: {$status_code}"
            ];
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        return [
            'success' => true,
            'route' => $body['route'],
            'confidence' => $body['confidence'],
            'fallback' => $body['fallback'] ?? null,
            'candidates' => $body['candidates'] ?? [],
            'sira_version' => $body['sira_version']
        ];
    }

    /**
     * Simulate routing before execution (116ter)
     *
     * @param float $amount Amount
     * @param string $currency Currency code
     * @param string $method Payment method ('wallet' | 'card' | 'bank')
     * @param string|null $country_code Country code (optional)
     * @return array Simulation results with routes predictions
     */
    public static function simulate_routing($amount, $currency, $method = 'card', $country_code = null) {
        $api_url = defined('MOLAM_API_URL') ? MOLAM_API_URL : 'https://api.molam.com';
        $api_key = get_option('molam_api_key');
        $merchant_id = self::get_merchant_id();
        $user_id = self::get_user_id();

        if (!$api_key) {
            error_log('Molam Routing Simulator: API key not configured');
            return [
                'success' => false,
                'error' => 'API key not configured'
            ];
        }

        $payload = [
            'merchant_id' => $merchant_id,
            'user_id' => $user_id,
            'method' => $method,
            'amount' => floatval($amount),
            'currency' => $currency,
            'country_code' => $country_code
        ];

        $response = wp_remote_post($api_url . '/api/charges/simulate-routing', [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-User-Role' => 'plugin_client'
            ],
            'body' => json_encode($payload),
            'timeout' => 10
        ]);

        if (is_wp_error($response)) {
            error_log('Molam Routing Simulator: ' . $response->get_error_message());
            return [
                'success' => false,
                'error' => $response->get_error_message()
            ];
        }

        $status_code = wp_remote_retrieve_response_code($response);
        if ($status_code !== 200) {
            error_log("Molam Routing Simulator: API returned status {$status_code}");
            return [
                'success' => false,
                'error' => "API error: {$status_code}"
            ];
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        return [
            'success' => true,
            'simulation_id' => $body['simulation_id'],
            'routes' => $body['routes'],
            'recommendation' => $body['recommendation'],
            'sira_version' => $body['sira_version']
        ];
    }

    /**
     * Record simulation outcome after execution (116ter)
     *
     * @param string $simulation_id Simulation UUID
     * @param string $chosen_route Route that was chosen
     * @param string $actual_outcome 'success' or 'failed'
     * @return bool Success status
     */
    public static function record_simulation_outcome($simulation_id, $chosen_route, $actual_outcome) {
        $api_url = defined('MOLAM_API_URL') ? MOLAM_API_URL : 'https://api.molam.com';
        $api_key = get_option('molam_api_key');

        if (!$api_key) {
            error_log('Molam Routing Simulator: API key not configured');
            return false;
        }

        $payload = [
            'chosen_route' => $chosen_route,
            'actual_outcome' => $actual_outcome
        ];

        $response = wp_remote_post($api_url . "/api/routing/simulations/{$simulation_id}/execute", [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-User-Role' => 'plugin_client'
            ],
            'body' => json_encode($payload),
            'timeout' => 5
        ]);

        if (is_wp_error($response)) {
            error_log('Molam Routing Simulator: ' . $response->get_error_message());
            return false;
        }

        $status_code = wp_remote_retrieve_response_code($response);
        if ($status_code !== 200) {
            error_log("Molam Routing Simulator: Failed to record outcome - status {$status_code}");
            return false;
        }

        return true;
    }
}

/**
 * Helper function: Log routing attempt
 *
 * @param string $transaction_id Transaction UUID
 * @param string $route Route identifier
 * @param float $amount Amount
 * @param string $currency Currency code
 * @param string $status Status ('success' | 'failed' | 'retried')
 * @param array $options Additional options
 */
function molam_log_routing($transaction_id, $route, $amount, $currency, $status, $options = []) {
    return Molam_Routing_Logger::log(
        $transaction_id,
        $options['merchant_id'] ?? Molam_Routing_Logger::get_merchant_id(),
        $options['user_id'] ?? Molam_Routing_Logger::get_user_id(),
        $options['method'] ?? Molam_Routing_Logger::detect_method($route),
        $route,
        $amount,
        $currency,
        $status,
        $options['latency_ms'] ?? null,
        $options['error_code'] ?? null,
        $options['fallback_route'] ?? null,
        $options['country_code'] ?? null,
        $options['provider'] ?? null,
        $options['metadata'] ?? []
    );
}

/**
 * Helper function: Measure and log routing operation
 *
 * @param callable $operation Operation to measure
 * @param string $transaction_id Transaction UUID
 * @param string $route Route identifier
 * @param float $amount Amount
 * @param string $currency Currency code
 * @return mixed Result of operation
 */
function molam_measure_routing($operation, $transaction_id, $route, $amount, $currency) {
    return Molam_Routing_Logger::measure_routing($operation, $transaction_id, $route, $amount, $currency);
}

/**
 * Helper function: Get Sira auto-routing decision (116bis)
 *
 * @param string $transaction_id Transaction UUID
 * @param float $amount Amount
 * @param string $currency Currency code
 * @param string $method Payment method (default: 'card')
 * @return array Routing decision ['success', 'route', 'confidence', 'fallback']
 */
function molam_get_auto_route($transaction_id, $amount, $currency, $method = 'card') {
    return Molam_Routing_Logger::get_auto_route($transaction_id, $amount, $currency, $method);
}

/**
 * Helper function: Simulate routing before execution (116ter)
 *
 * @param float $amount Amount
 * @param string $currency Currency code
 * @param string $method Payment method (default: 'card')
 * @param string|null $country_code Country code
 * @return array Simulation results with route predictions
 */
function molam_simulate_routing($amount, $currency, $method = 'card', $country_code = null) {
    return Molam_Routing_Logger::simulate_routing($amount, $currency, $method, $country_code);
}

/**
 * Helper function: Record simulation outcome after execution (116ter)
 *
 * @param string $simulation_id Simulation UUID
 * @param string $chosen_route Route chosen
 * @param string $actual_outcome 'success' or 'failed'
 * @return bool Success status
 */
function molam_record_simulation_outcome($simulation_id, $chosen_route, $actual_outcome) {
    return Molam_Routing_Logger::record_simulation_outcome($simulation_id, $chosen_route, $actual_outcome);
}
