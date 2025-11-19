<?php
/**
 * Sous-Brique 115ter: Molam Form Progressive Rollout
 * Classe pour gérer les déploiements progressifs (canary release)
 *
 * @package MolamForm
 * @version 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class Molam_Form_Rollout {

    /**
     * Check if a merchant should receive an upgrade based on active rollout
     *
     * @param string $merchant_id Merchant UUID
     * @param string $plugin_name Plugin name (e.g., 'woocommerce')
     * @param string $version Target version
     * @return array Rollout decision with details
     */
    public static function should_upgrade($merchant_id, $plugin_name, $version) {
        try {
            // Get active rollout from API
            $rollout = self::get_active_rollout($plugin_name);

            if (!$rollout) {
                return [
                    'should_upgrade' => false,
                    'reason' => 'No active rollout configured',
                    'rollout_status' => null
                ];
            }

            // Check rollout status
            if ($rollout['status'] !== 'active') {
                return [
                    'should_upgrade' => false,
                    'reason' => "Rollout status is '{$rollout['status']}', not active",
                    'rollout_status' => $rollout['status']
                ];
            }

            // Check version match
            if ($rollout['version'] !== $version) {
                return [
                    'should_upgrade' => false,
                    'reason' => "Rollout is for version {$rollout['version']}, not {$version}",
                    'rollout_version' => $rollout['version']
                ];
            }

            // Determine upgrade eligibility based on strategy
            $eligible = self::is_merchant_eligible(
                $merchant_id,
                $rollout['rollout_strategy'],
                $rollout['rollout_percentage'],
                $rollout['target_countries'] ?? null,
                $rollout['target_tiers'] ?? null
            );

            return [
                'should_upgrade' => $eligible,
                'reason' => $eligible
                    ? "Merchant selected for {$rollout['rollout_percentage']}% rollout ({$rollout['rollout_strategy']} strategy)"
                    : "Merchant not in {$rollout['rollout_percentage']}% rollout cohort",
                'rollout_id' => $rollout['id'],
                'rollout_percentage' => $rollout['rollout_percentage'],
                'rollout_strategy' => $rollout['rollout_strategy'],
                'version' => $rollout['version']
            ];

        } catch (Exception $e) {
            error_log("Molam Form Rollout: Error checking upgrade eligibility: " . $e->getMessage());

            return [
                'should_upgrade' => false,
                'reason' => 'Error checking rollout: ' . $e->getMessage(),
                'error' => true
            ];
        }
    }

    /**
     * Determine if merchant is eligible based on rollout strategy
     *
     * @param string $merchant_id Merchant UUID
     * @param string $strategy Rollout strategy ('random', 'geo', 'merchant_tier')
     * @param int $percentage Rollout percentage (0-100)
     * @param array|null $target_countries Target countries for 'geo' strategy
     * @param array|null $target_tiers Target tiers for 'merchant_tier' strategy
     * @return bool Eligibility status
     */
    private static function is_merchant_eligible($merchant_id, $strategy, $percentage, $target_countries, $target_tiers) {
        // Generate deterministic random value based on merchant_id
        // This ensures consistent selection across multiple checks
        $hash_value = self::merchant_hash($merchant_id);

        switch ($strategy) {
            case 'geo':
                return self::check_geo_eligibility($merchant_id, $hash_value, $percentage, $target_countries);

            case 'merchant_tier':
                return self::check_tier_eligibility($merchant_id, $hash_value, $percentage, $target_tiers);

            case 'random':
            default:
                return self::check_random_eligibility($hash_value, $percentage);
        }
    }

    /**
     * Check random strategy eligibility
     *
     * @param int $hash_value Deterministic hash value (1-100)
     * @param int $percentage Rollout percentage
     * @return bool
     */
    private static function check_random_eligibility($hash_value, $percentage) {
        return $hash_value <= $percentage;
    }

    /**
     * Check geo strategy eligibility
     *
     * @param string $merchant_id Merchant UUID
     * @param int $hash_value Deterministic hash value
     * @param int $percentage Rollout percentage
     * @param array|null $target_countries Target countries (e.g., ['US', 'FR', 'SN'])
     * @return bool
     */
    private static function check_geo_eligibility($merchant_id, $hash_value, $percentage, $target_countries) {
        if (empty($target_countries)) {
            // No country restriction, fall back to random
            return $hash_value <= $percentage;
        }

        $merchant_country = self::get_merchant_country($merchant_id);

        if (!$merchant_country) {
            return false; // Cannot determine country, exclude from rollout
        }

        // Check if merchant's country is in target list
        if (!in_array($merchant_country, $target_countries)) {
            return false; // Country not targeted
        }

        // Country matches, now check percentage
        return $hash_value <= $percentage;
    }

    /**
     * Check merchant tier strategy eligibility
     *
     * @param string $merchant_id Merchant UUID
     * @param int $hash_value Deterministic hash value
     * @param int $percentage Rollout percentage
     * @param array|null $target_tiers Target tiers (e.g., ['enterprise', 'pro'])
     * @return bool
     */
    private static function check_tier_eligibility($merchant_id, $hash_value, $percentage, $target_tiers) {
        $merchant_tier = self::get_merchant_tier($merchant_id);

        if (!$merchant_tier) {
            // Cannot determine tier, fall back to random percentage
            return $hash_value <= $percentage;
        }

        if (!empty($target_tiers) && in_array($merchant_tier, $target_tiers)) {
            // High-priority tier, always included (or use percentage if specified)
            return true; // Could also use: $hash_value <= $percentage for gradual within tier
        }

        // Other tiers use random percentage selection
        return $hash_value <= $percentage;
    }

    /**
     * Generate deterministic hash value for merchant (1-100)
     * Ensures same merchant always gets same value for consistent selection
     *
     * @param string $merchant_id Merchant UUID
     * @return int Value between 1 and 100
     */
    private static function merchant_hash($merchant_id) {
        // Use crc32 for deterministic hash (same input = same output)
        $hash = crc32($merchant_id);

        // Convert to positive value between 1 and 100
        return (abs($hash) % 100) + 1;
    }

    /**
     * Get merchant's country code
     *
     * @param string $merchant_id Merchant UUID
     * @return string|null Country code (e.g., 'US', 'FR', 'SN')
     */
    private static function get_merchant_country($merchant_id) {
        // Option 1: Get from WooCommerce store settings
        $store_country = get_option('woocommerce_default_country');

        if ($store_country) {
            // WooCommerce stores country as "US:CA" (country:state)
            $parts = explode(':', $store_country);
            return $parts[0];
        }

        // Option 2: Get from merchant metadata (if stored)
        $country = get_user_meta($merchant_id, 'molam_merchant_country', true);

        if ($country) {
            return $country;
        }

        // Option 3: Fallback - could call API
        try {
            $merchant_data = self::get_merchant_data($merchant_id);
            return $merchant_data['country'] ?? null;
        } catch (Exception $e) {
            error_log("Molam Form Rollout: Could not determine merchant country: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Get merchant's tier/plan level
     *
     * @param string $merchant_id Merchant UUID
     * @return string|null Tier (e.g., 'enterprise', 'pro', 'standard', 'free')
     */
    private static function get_merchant_tier($merchant_id) {
        // Option 1: Get from user metadata
        $tier = get_user_meta($merchant_id, 'molam_merchant_tier', true);

        if ($tier) {
            return $tier;
        }

        // Option 2: Call API to get merchant plan
        try {
            $merchant_data = self::get_merchant_data($merchant_id);
            return $merchant_data['tier'] ?? null;
        } catch (Exception $e) {
            error_log("Molam Form Rollout: Could not determine merchant tier: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Get active rollout configuration from API
     *
     * @param string $plugin_name Plugin name
     * @return array|null Rollout configuration or null if none active
     */
    private static function get_active_rollout($plugin_name) {
        $response = wp_remote_get(
            MOLAM_API_URL . "/plugins/rollouts/{$plugin_name}",
            [
                'headers' => [
                    'Authorization' => 'Bearer ' . get_option('molam_api_key'),
                    'Content-Type' => 'application/json'
                ],
                'timeout' => 10
            ]
        );

        if (is_wp_error($response)) {
            error_log("Molam Form Rollout: API request failed: " . $response->get_error_message());
            return null;
        }

        $status_code = wp_remote_retrieve_response_code($response);

        if ($status_code === 404) {
            // No active rollout
            return null;
        }

        if ($status_code !== 200) {
            error_log("Molam Form Rollout: API returned status {$status_code}");
            return null;
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        return $body['rollout'] ?? null;
    }

    /**
     * Get merchant data from API
     *
     * @param string $merchant_id Merchant UUID
     * @return array Merchant data
     * @throws Exception
     */
    private static function get_merchant_data($merchant_id) {
        $response = wp_remote_get(
            MOLAM_API_URL . "/merchants/{$merchant_id}",
            [
                'headers' => [
                    'Authorization' => 'Bearer ' . get_option('molam_api_key')
                ],
                'timeout' => 10
            ]
        );

        if (is_wp_error($response)) {
            throw new Exception('API request failed: ' . $response->get_error_message());
        }

        $status_code = wp_remote_retrieve_response_code($response);

        if ($status_code !== 200) {
            throw new Exception("API returned status {$status_code}");
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        return $body['merchant'] ?? [];
    }

    /**
     * Log rollout decision to API for analytics
     *
     * @param string $merchant_id Merchant UUID
     * @param string $plugin_name Plugin name
     * @param array $decision Decision details from should_upgrade()
     */
    public static function log_rollout_decision($merchant_id, $plugin_name, $decision) {
        wp_remote_post(
            MOLAM_API_URL . '/plugins/rollouts/decisions',
            [
                'headers' => [
                    'Authorization' => 'Bearer ' . get_option('molam_api_key'),
                    'Content-Type' => 'application/json'
                ],
                'body' => json_encode([
                    'merchant_id' => $merchant_id,
                    'plugin_name' => $plugin_name,
                    'should_upgrade' => $decision['should_upgrade'],
                    'reason' => $decision['reason'],
                    'rollout_id' => $decision['rollout_id'] ?? null,
                    'rollout_strategy' => $decision['rollout_strategy'] ?? null,
                    'rollout_percentage' => $decision['rollout_percentage'] ?? null,
                    'timestamp' => current_time('mysql', true)
                ]),
                'blocking' => false // Don't wait for response (fire and forget)
            ]
        );
    }

    /**
     * Check if merchant has already been upgraded to a version
     *
     * @param string $merchant_id Merchant UUID
     * @param string $plugin_name Plugin name
     * @param string $version Version to check
     * @return bool True if already upgraded
     */
    public static function is_already_upgraded($merchant_id, $plugin_name, $version) {
        $current_version = self::get_installed_version($plugin_name);

        return version_compare($current_version, $version, '>=');
    }

    /**
     * Get currently installed plugin version
     *
     * @param string $plugin_name Plugin name
     * @return string Version number
     */
    private static function get_installed_version($plugin_name) {
        $plugin_file = WP_PLUGIN_DIR . '/molam-form/molam-form.php';

        if (!file_exists($plugin_file)) {
            return '0.0.0';
        }

        $plugin_data = get_file_data($plugin_file, ['Version' => 'Version']);

        return $plugin_data['Version'] ?? '0.0.0';
    }
}
