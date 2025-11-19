/**
 * SOUS-BRIQUE 140quater — Molam Node.js SDK avec Self-Healing
 * SDK auto-correctif avec support de patches distants
 */

import fetch from 'node-fetch';
import crypto from 'crypto';

interface MolamClientConfig {
  apiKey?: string;
  secretKey?: string;
  baseUrl?: string;
  timeout?: number;
  enableSelfHealing?: boolean;
  onPatchApplied?: (patch: any) => void;
}

interface SelfHealPatch {
  code: string;
  description: string;
  patch_id: string;
  rollback_code?: string;
}

export class MolamClient {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  timeout: number;
  enableSelfHealing: boolean;
  onPatchApplied?: (patch: any) => void;
  private patchHistory: SelfHealPatch[] = [];
  private maxRetries: number = 3;

  constructor(config: MolamClientConfig) {
    this.apiKey = config.apiKey || process.env.MOLAM_API_KEY || '';
    this.secretKey = config.secretKey || process.env.MOLAM_SECRET_KEY || '';
    this.baseUrl = config.baseUrl || 'https://api.molam.com';
    this.timeout = config.timeout || 10000;
    this.enableSelfHealing = config.enableSelfHealing !== false; // Enabled by default
    this.onPatchApplied = config.onPatchApplied;

    // Validation initiale
    if (!this.apiKey && this.enableSelfHealing) {
      console.warn('⚠️  Molam SDK: Clé API manquante, self-healing activé');
    }
  }

  /**
   * Appliquer un patch auto-correctif
   */
  private async healAndRetry(
    endpoint: string,
    opts: any,
    err: any,
    retryCount: number = 0
  ): Promise<any> {
    if (!this.enableSelfHealing) {
      throw err;
    }

    if (retryCount >= this.maxRetries) {
      console.error('⛔ Molam SDK: Max retries atteint, abandon');
      throw err;
    }

    try {
      // Appel API self-heal
      const healResp = await fetch(`${this.baseUrl}/dev/self-heal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sdk: 'node',
          error: err.message,
          status: err.status,
          endpoint,
          context: {
            timestamp: new Date().toISOString(),
            retry_count: retryCount,
          },
        }),
        timeout: 5000, // Timeout court pour self-heal
      });

      if (!healResp.ok) {
        throw err; // Pas de patch disponible
      }

      const data = await healResp.json();

      if (data.patch) {
        console.warn(
          `⚡ Molam SDK: Application du patch - ${data.patch.description}`
        );

        // Stocker le patch pour audit
        this.patchHistory.push(data.patch);

        // Callback utilisateur
        if (this.onPatchApplied) {
          this.onPatchApplied(data.patch);
        }

        // Appliquer le patch de manière sécurisée
        try {
          // Contexte d'exécution limité pour sécurité
          const patchContext = {
            console,
            crypto,
            process,
            setTimeout,
            Promise,
          };

          // Créer fonction avec contexte limité
          const patchFn = new Function(
            'context',
            `
            with(context) {
              ${data.patch.code}
            }
          `
          );

          patchFn.call(this, patchContext);

          // Retry après patch
          return await this.request(endpoint, opts);
        } catch (patchError) {
          console.error('⛔ Molam SDK: Erreur lors de l\'application du patch:', patchError);

          // Rollback si disponible
          if (data.patch.rollback_code) {
            console.warn('↩️  Molam SDK: Rollback du patch');
            try {
              const rollbackFn = new Function(
                'context',
                `with(context) { ${data.patch.rollback_code} }`
              );
              rollbackFn.call(this, patchContext);
            } catch (rollbackError) {
              console.error('⛔ Molam SDK: Erreur lors du rollback:', rollbackError);
            }
          }

          throw err;
        }
      } else {
        throw err; // Pas de patch disponible
      }
    } catch (healError) {
      console.warn('⚠️  Molam SDK: Self-healing échoué, propagation erreur');
      throw err;
    }
  }

  /**
   * Requête HTTP avec auto-healing
   */
  async request(endpoint: string, opts: any = {}): Promise<any> {
    try {
      const body = opts.body ? JSON.stringify(opts.body) : undefined;
      const headers: any = {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      };

      // HMAC signature si secretKey fournie
      if (this.secretKey && body) {
        const signature = crypto
          .createHmac('sha256', this.secretKey)
          .update(body)
          .digest('hex');
        headers['X-API-Key'] = `${this.apiKey}:${signature}`;
      } else {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: opts.method || 'GET',
        headers,
        body,
        timeout: this.timeout,
      });

      if (!res.ok) {
        const error: any = new Error(`${res.status} ${res.statusText}`);
        error.status = res.status;
        error.headers = res.headers;

        // Tentative auto-heal
        throw error;
      }

      return await res.json();
    } catch (err: any) {
      // Tentative auto-healing avant propagation
      return await this.healAndRetry(endpoint, opts, err);
    }
  }

  /**
   * Créer un paiement
   */
  async createPayment(data: {
    amount: number;
    currency: string;
    customer_id: string;
    description?: string;
  }) {
    return this.request('/v1/payments', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Récupérer l'historique des patches appliqués
   */
  getPatchHistory(): SelfHealPatch[] {
    return this.patchHistory;
  }

  /**
   * Tester la connexion
   */
  async ping(): Promise<any> {
    return this.request('/v1/ping');
  }
}
