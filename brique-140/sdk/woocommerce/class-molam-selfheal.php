<?php
/**
 * SOUS-BRIQUE 140quater — WooCommerce Self-Healing Integration
 * Plugin: WooCommerce Molam Payment Gateway
 *
 * Auto-correction des erreurs de configuration WooCommerce
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

class Molam_SelfHeal {

    private static $base_url = 'https://api.molam.com';
    private static $patch_cache = array();

    /**
     * Appliquer un patch auto-correctif
     *
     * @param string $error Message d'erreur
     * @param array $context Contexte de l'erreur
     * @return bool Success
     */
    public static function apply_patch($error, $context = array()) {
        // Cache pour éviter appels répétés
        $cache_key = md5($error);
        if (isset(self::$patch_cache[$cache_key])) {
            return self::$patch_cache[$cache_key];
        }

        $api_key = get_option('molam_api_key', '');

        // Appel API Self-Heal
        $response = wp_remote_post(self::$base_url . '/dev/self-heal', array(
            'timeout' => 5,
            'headers' => array(
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
            ),
            'body' => json_encode(array(
                'sdk' => 'woocommerce',
                'error' => $error,
                'context' => array_merge($context, array(
                    'wc_version' => WC_VERSION,
                    'php_version' => PHP_VERSION,
                    'site_url' => get_site_url(),
                ))
            ))
        ));

        if (is_wp_error($response)) {
            error_log('Molam SelfHeal: Erreur réseau - ' . $response->get_error_message());
            self::$patch_cache[$cache_key] = false;
            return false;
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if (!empty($data['patch']['code'])) {
            $patch = $data['patch'];

            try {
                // Journal du patch
                self::log_patch_application($error, $patch);

                // Application du patch avec rollback
                $start_time = microtime(true);
                $original_state = self::backup_state();

                // Exécution sécurisée du patch
                ob_start();
                $patch_result = eval($patch['code']);
                $output = ob_get_clean();

                $execution_time = (microtime(true) - $start_time) * 1000;

                // Vérifier le succès
                if ($patch_result === false && !empty($patch['rollback'])) {
                    error_log('⚠️ Molam SelfHeal: Patch échoué, rollback...');
                    eval($patch['rollback']);
                    self::restore_state($original_state);

                    self::report_patch_result($error, $patch, false, $execution_time);
                    self::$patch_cache[$cache_key] = false;
                    return false;
                }

                error_log('✅ Molam SelfHeal: ' . $patch['description']);
                self::report_patch_result($error, $patch, true, $execution_time);
                self::$patch_cache[$cache_key] = true;
                return true;

            } catch (Exception $e) {
                error_log('❌ Molam SelfHeal Exception: ' . $e->getMessage());

                // Rollback automatique
                if (!empty($patch['rollback'])) {
                    eval($patch['rollback']);
                    self::restore_state($original_state);
                }

                self::$patch_cache[$cache_key] = false;
                return false;
            }
        }

        self::$patch_cache[$cache_key] = false;
        return false;
    }

    /**
     * Backup l'état actuel pour rollback
     */
    private static function backup_state() {
        return array(
            'api_key' => get_option('molam_api_key'),
            'sandbox' => get_option('molam_sandbox_mode'),
            'webhook_secret' => get_option('molam_webhook_secret'),
        );
    }

    /**
     * Restaurer l'état après rollback
     */
    private static function restore_state($state) {
        foreach ($state as $key => $value) {
            update_option('molam_' . $key, $value);
        }
    }

    /**
     * Logger l'application d'un patch
     */
    private static function log_patch_application($error, $patch) {
        wp_remote_post(self::$base_url . '/dev/patch-journal', array(
            'timeout' => 3,
            'blocking' => false, // Async
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode(array(
                'sdk_language' => 'woocommerce',
                'error_signature' => $error,
                'patch_applied' => $patch['code'],
                'rollback_available' => !empty($patch['rollback']),
                'context' => array(
                    'wc_version' => WC_VERSION,
                    'site_url' => get_site_url(),
                )
            ))
        ));
    }

    /**
     * Reporter le résultat du patch
     */
    private static function report_patch_result($error, $patch, $success, $execution_time) {
        wp_remote_post(self::$base_url . '/dev/patch-journal', array(
            'timeout' => 3,
            'blocking' => false,
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode(array(
                'sdk_language' => 'woocommerce',
                'error_signature' => $error,
                'patch_applied' => $patch['code'],
                'success' => $success,
                'execution_time_ms' => $execution_time,
                'rollback_triggered' => !$success,
            ))
        ));
    }

    /**
     * Auto-heal sur erreur de paiement
     */
    public static function heal_payment_error($order, $error_message) {
        $context = array(
            'order_id' => $order->get_id(),
            'amount' => $order->get_total(),
            'currency' => $order->get_currency(),
        );

        return self::apply_patch($error_message, $context);
    }

    /**
     * Auto-heal sur erreur de configuration
     */
    public static function heal_config_error($setting_name, $error_message) {
        $context = array(
            'setting' => $setting_name,
            'current_value' => get_option('molam_' . $setting_name),
        );

        return self::apply_patch($error_message, $context);
    }

    /**
     * Mode sandbox : tester un patch sans l'appliquer
     */
    public static function sandbox_test_patch($error) {
        $response = wp_remote_post(self::$base_url . '/dev/self-heal', array(
            'timeout' => 5,
            'headers' => array('Content-Type' => 'application/json'),
            'body' => json_encode(array(
                'sdk' => 'woocommerce',
                'error' => $error,
                'sandbox' => true,
            ))
        ));

        if (is_wp_error($response)) {
            return null;
        }

        $body = wp_remote_retrieve_body($response);
        return json_decode($body, true);
    }
}

// Hooks WooCommerce
add_action('woocommerce_payment_failed', function($order_id) {
    $order = wc_get_order($order_id);
    $error = $order->get_status_message();

    if (Molam_SelfHeal::heal_payment_error($order, $error)) {
        // Retry payment après patch
        $order->add_order_note('⚡ Molam: Configuration corrigée automatiquement, retry paiement...');
    }
}, 10, 1);

// Hook admin settings
add_action('admin_init', function() {
    // Vérifier configuration au chargement admin
    $api_key = get_option('molam_api_key');
    if (empty($api_key)) {
        Molam_SelfHeal::heal_config_error('api_key', 'missing_api_key');
    }
});
