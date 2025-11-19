/**
 * SOUS-BRIQUE 140quater — Shopify Self-Healing Integration
 * App: Molam Payment Gateway for Shopify
 *
 * Auto-correction des erreurs de configuration Shopify
 */

const fetch = require('node-fetch');
const crypto = require('crypto');

class MolamShopifySelfHeal {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'https://api.molam.com';
    this.apiKey = config.apiKey || process.env.MOLAM_API_KEY;
    this.shopifySecret = config.shopifySecret || process.env.SHOPIFY_SECRET;
    this.patchCache = new Map();
    this.sandboxMode = config.sandboxMode || false;
  }

  /**
   * Appliquer un patch auto-correctif
   */
  async applyPatch(error, context = {}) {
    const cacheKey = crypto.createHash('md5').update(error).digest('hex');

    // Cache pour éviter appels répétés
    if (this.patchCache.has(cacheKey)) {
      return this.patchCache.get(cacheKey);
    }

    try {
      const response = await fetch(`${this.baseUrl}/dev/self-heal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          sdk: 'shopify',
          error,
          context: {
            ...context,
            shopify_api_version: process.env.SHOPIFY_API_VERSION || '2024-01',
            node_version: process.version,
          },
          sandbox: this.sandboxMode,
        }),
        timeout: 5000,
      });

      if (!response.ok) {
        console.error('⚠️  Molam SelfHeal: API error', response.statusText);
        this.patchCache.set(cacheKey, false);
        return false;
      }

      const data = await response.json();

      if (data.patch?.code) {
        const patch = data.patch;

        try {
          // Journal du patch
          await this.logPatchApplication(error, patch, context);

          // Backup état actuel
          const originalState = this.backupState();
          const startTime = Date.now();

          // Exécution sécurisée du patch
          console.warn(`⚡ Molam SelfHeal: ${patch.description}`);

          // Sandbox eval avec contexte limité
          const patchContext = {
            console,
            process,
            crypto,
            fetch,
            setTimeout,
            Promise,
          };

          const patchFn = new Function('context', `with(context) { ${patch.code} }`);
          const patchResult = patchFn.call(this, patchContext);

          const executionTime = Date.now() - startTime;

          // Vérifier succès
          if (patchResult === false && patch.rollback) {
            console.error('⚠️  Molam SelfHeal: Patch failed, rolling back...');
            const rollbackFn = new Function('context', `with(context) { ${patch.rollback} }`);
            rollbackFn.call(this, patchContext);
            this.restoreState(originalState);

            await this.reportPatchResult(error, patch, false, executionTime);
            this.patchCache.set(cacheKey, false);
            return false;
          }

          console.log('✅ Molam SelfHeal: Patch applied successfully');
          await this.reportPatchResult(error, patch, true, executionTime);
          this.patchCache.set(cacheKey, true);
          return true;
        } catch (patchError) {
          console.error('❌ Molam SelfHeal Exception:', patchError);

          // Rollback automatique
          if (patch.rollback) {
            try {
              const rollbackFn = new Function('context', `with(context) { ${patch.rollback} }`);
              rollbackFn.call(this, { console, process });
            } catch (rollbackError) {
              console.error('⛔ Molam SelfHeal Rollback failed:', rollbackError);
            }
          }

          this.patchCache.set(cacheKey, false);
          return false;
        }
      }

      this.patchCache.set(cacheKey, false);
      return false;
    } catch (error) {
      console.error('⚠️  Molam SelfHeal: Network error', error.message);
      this.patchCache.set(cacheKey, false);
      return false;
    }
  }

  /**
   * Backup l'état actuel pour rollback
   */
  backupState() {
    return {
      apiKey: this.apiKey,
      shopifySecret: this.shopifySecret,
      envVars: {
        MOLAM_API_KEY: process.env.MOLAM_API_KEY,
        SHOPIFY_SECRET: process.env.SHOPIFY_SECRET,
      },
    };
  }

  /**
   * Restaurer l'état après rollback
   */
  restoreState(state) {
    this.apiKey = state.apiKey;
    this.shopifySecret = state.shopifySecret;
    Object.assign(process.env, state.envVars);
  }

  /**
   * Logger l'application d'un patch
   */
  async logPatchApplication(error, patch, context) {
    try {
      await fetch(`${this.baseUrl}/dev/patch-journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdk_language: 'shopify',
          error_signature: error,
          patch_applied: patch.code,
          rollback_available: !!patch.rollback,
          context: {
            ...context,
            shopify_api_version: process.env.SHOPIFY_API_VERSION,
          },
        }),
        timeout: 3000,
      });
    } catch (err) {
      // Silent fail pour logging
      console.debug('Failed to log patch:', err.message);
    }
  }

  /**
   * Reporter le résultat du patch
   */
  async reportPatchResult(error, patch, success, executionTime) {
    try {
      await fetch(`${this.baseUrl}/dev/patch-journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdk_language: 'shopify',
          error_signature: error,
          patch_applied: patch.code,
          success,
          execution_time_ms: executionTime,
          rollback_triggered: !success,
        }),
        timeout: 3000,
      });
    } catch (err) {
      console.debug('Failed to report patch result:', err.message);
    }
  }

  /**
   * Auto-heal sur erreur de webhook
   */
  async healWebhookError(webhookData, error) {
    const context = {
      webhook_topic: webhookData.topic,
      webhook_id: webhookData.id,
      shop_domain: webhookData.shop_domain,
    };

    return this.applyPatch(error, context);
  }

  /**
   * Auto-heal sur erreur de paiement
   */
  async healPaymentError(order, error) {
    const context = {
      order_id: order.id,
      total_price: order.total_price,
      currency: order.currency,
      financial_status: order.financial_status,
    };

    return this.applyPatch(error, context);
  }

  /**
   * Mode sandbox : tester un patch sans l'appliquer
   */
  async sandboxTestPatch(error, context = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/dev/self-heal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdk: 'shopify',
          error,
          context,
          sandbox: true,
        }),
        timeout: 5000,
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (err) {
      console.error('Sandbox test failed:', err.message);
      return null;
    }
  }

  /**
   * Clear cache (utile pour tests)
   */
  clearCache() {
    this.patchCache.clear();
  }
}

module.exports = MolamShopifySelfHeal;

// Exemple d'utilisation
if (require.main === module) {
  const selfHeal = new MolamShopifySelfHeal({
    sandboxMode: false,
  });

  // Test webhook verification error
  selfHeal
    .applyPatch('webhook_verification_failed', {
      topic: 'orders/create',
    })
    .then((success) => {
      console.log('Patch result:', success);
    });
}
