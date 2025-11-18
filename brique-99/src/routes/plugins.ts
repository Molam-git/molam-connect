/**
 * Brique 99 — Plugin Management API Routes
 *
 * Handles OAuth flows, plugin registration, and management
 * for e-commerce platform integrations (WooCommerce, Shopify, etc.)
 *
 * Routes:
 * - POST /plugins/oauth/start - Initiate OAuth flow
 * - POST /plugins/oauth/callback - Complete OAuth flow
 * - POST /plugins/:id/set-mode - Switch test/live mode
 * - GET /plugins - List merchant's plugins
 * - GET /plugins/:id - Get plugin details
 * - DELETE /plugins/:id - Revoke plugin access
 * - POST /plugins/:id/sync - Sync configuration
 */

import express, { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { encryptWithKMS, decryptWithKMS } from '../utils/kms';
import { generateRandomId } from '../utils/id';
import { requireRole } from '../middleware/authz';

// =====================================================================
// Types & Interfaces
// =====================================================================

export interface PluginsRouterConfig {
  pool: Pool;
  oauthBaseUrl: string;
  webhookBaseUrl: string;
  enableMock?: boolean;
}

interface AuthRequest extends Request {
  user?: {
    id: string;
    merchant_id: string;
    roles: string[];
  };
}

interface StartOAuthRequest {
  cms_type: string;
  site_url: string;
  site_name?: string;
  redirect_uri: string;
  plugin_version?: string;
}

interface OAuthCallbackRequest {
  integration_id: string;
  code: string;
}

interface SetModeRequest {
  mode: 'test' | 'live';
}

interface SyncRequest {
  sync_type: 'config' | 'payment_methods' | 'branding' | 'webhooks';
  force?: boolean;
}

// =====================================================================
// Router Factory
// =====================================================================

export function createPluginsRouter(config: PluginsRouterConfig): express.Router {
  const router = express.Router();
  const { pool, oauthBaseUrl, webhookBaseUrl, enableMock = false } = config;

  // Apply JSON body parser
  router.use(express.json());

  // ===================================================================
  // POST /plugins/oauth/start — Initiate OAuth flow
  // ===================================================================

  router.post(
    '/oauth/start',
    requireRole(['merchant_admin', 'pay_admin']),
    async (req: AuthRequest, res: Response) => {
      try {
        const {
          cms_type,
          site_url,
          site_name,
          redirect_uri,
          plugin_version,
        }: StartOAuthRequest = req.body;

        // Validate required fields
        if (!cms_type || !site_url || !redirect_uri) {
          return res.status(400).json({ error: 'missing_required_fields' });
        }

        // Validate CMS type
        const validCmsTypes = [
          'woocommerce',
          'shopify',
          'magento',
          'prestashop',
          'wix',
          'squarespace',
          'bigcommerce',
          'opencart',
          'generic',
        ];

        if (!validCmsTypes.includes(cms_type)) {
          return res.status(400).json({ error: 'invalid_cms_type' });
        }

        const merchantId = req.user!.merchant_id;

        // Generate OAuth credentials
        const oauthClientId = `molam_${cms_type}_${generateRandomId(16)}`;
        const oauthClientSecret = generateRandomId(48);

        // Encrypt client secret
        const secretCipher = await encryptWithKMS(
          Buffer.from(oauthClientSecret, 'utf8')
        );

        // Check if integration already exists
        const existing = await pool.query(
          'SELECT id, status FROM plugin_integrations WHERE merchant_id=$1 AND cms_type=$2 AND site_url=$3',
          [merchantId, cms_type, site_url]
        );

        let integrationId: string;

        if (existing.rows.length > 0) {
          // Update existing integration
          integrationId = existing.rows[0].id;

          await pool.query(
            `UPDATE plugin_integrations
             SET oauth_client_id=$1,
                 oauth_client_secret_cipher=$2,
                 site_name=$3,
                 plugin_version=$4,
                 status='pending',
                 updated_at=now()
             WHERE id=$5`,
            [
              oauthClientId,
              secretCipher,
              site_name || null,
              plugin_version || null,
              integrationId,
            ]
          );
        } else {
          // Create new integration
          const insertResult = await pool.query(
            `INSERT INTO plugin_integrations
             (merchant_id, cms_type, site_url, site_name, oauth_client_id, oauth_client_secret_cipher, plugin_version, created_by, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
              merchantId,
              cms_type,
              site_url,
              site_name || null,
              oauthClientId,
              secretCipher,
              plugin_version || null,
              req.user!.id,
              JSON.stringify({ created_by: req.user!.id }),
            ]
          );

          integrationId = insertResult.rows[0].id;
        }

        // Create webhook endpoint
        const webhookUrl = `${webhookBaseUrl}/plugins/${integrationId}/webhook`;

        const webhookResult = await pool.query(
          `INSERT INTO webhook_endpoints (tenant_type, tenant_id, url, api_version, created_by, status)
           VALUES ($1, $2, $3, $4, $5, 'active')
           RETURNING id`,
          ['merchant', merchantId, webhookUrl, '2025-01', req.user!.id]
        );

        const webhookEndpointId = webhookResult.rows[0].id;

        // Generate webhook secret
        const webhookSecret = generateRandomId(32);
        const webhookSecretCipher = await encryptWithKMS(
          Buffer.from(webhookSecret, 'utf8')
        );

        // Link webhook to integration
        await pool.query(
          `UPDATE plugin_integrations
           SET webhook_endpoint_id=$1, webhook_secret_cipher=$2
           WHERE id=$3`,
          [webhookEndpointId, webhookSecretCipher, integrationId]
        );

        // Subscribe to default events for this CMS type
        const eventsResult = await pool.query(
          'SELECT events FROM plugin_default_webhook_events WHERE cms_type=$1',
          [cms_type]
        );

        const events = eventsResult.rows[0]?.events || [
          'payment.succeeded',
          'payment.failed',
        ];

        for (const eventType of events) {
          await pool.query(
            `INSERT INTO webhook_subscriptions (endpoint_id, event_type)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [webhookEndpointId, eventType]
          );
        }

        // Log installation
        await pool.query(
          `INSERT INTO plugin_installation_logs (integration_id, merchant_id, action, cms_type, plugin_version, site_url, metadata)
           VALUES ($1, $2, 'install', $3, $4, $5, $6)`,
          [
            integrationId,
            merchantId,
            cms_type,
            plugin_version || null,
            site_url,
            JSON.stringify({ initiated_by: req.user!.id }),
          ]
        );

        // Build OAuth authorization URL
        const authUrl = `${oauthBaseUrl}/authorize?` +
          `client_id=${encodeURIComponent(oauthClientId)}&` +
          `redirect_uri=${encodeURIComponent(redirect_uri)}&` +
          `response_type=code&` +
          `state=${integrationId}&` +
          `scope=read_payments write_payments read_refunds write_refunds`;

        return res.json({
          success: true,
          integration_id: integrationId,
          auth_url: authUrl,
          client_id: oauthClientId,
          webhook_url: webhookUrl,
          webhook_secret: webhookSecret, // Return once for plugin to store
        });
      } catch (error: any) {
        console.error('OAuth start error:', error);
        return res.status(500).json({ error: 'internal_error', message: error.message });
      }
    }
  );

  // ===================================================================
  // POST /plugins/oauth/callback — Complete OAuth flow
  // ===================================================================

  router.post('/oauth/callback', async (req: Request, res: Response) => {
    try {
      const { integration_id, code }: OAuthCallbackRequest = req.body;

      if (!integration_id || !code) {
        return res.status(400).json({ error: 'missing_required_fields' });
      }

      // Validate integration exists
      const integrationResult = await pool.query(
        'SELECT * FROM plugin_integrations WHERE id=$1',
        [integration_id]
      );

      if (integrationResult.rows.length === 0) {
        return res.status(404).json({ error: 'integration_not_found' });
      }

      const integration = integrationResult.rows[0];

      // Exchange code for access token (simplified - in production use proper OAuth server)
      const accessToken = `access_${generateRandomId(32)}`;
      const refreshToken = `refresh_${generateRandomId(32)}`;
      const expiresIn = 3600; // 1 hour

      // Store tokens in metadata (encrypted in production)
      const tokens = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Date.now() + expiresIn * 1000,
        token_type: 'Bearer',
      };

      await pool.query(
        `UPDATE plugin_integrations
         SET metadata = metadata || $1::jsonb,
             status = 'active',
             updated_at = now()
         WHERE id = $2`,
        [JSON.stringify({ oauth_tokens: tokens }), integration_id]
      );

      // Record sync log
      await pool.query(
        'SELECT record_plugin_sync($1, $2, $3, $4, $5)',
        [
          integration_id,
          'config',
          'pull',
          'success',
          JSON.stringify({ oauth_completed: true }),
        ]
      );

      return res.json({
        success: true,
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
      });
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      return res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  // ===================================================================
  // GET /plugins — List merchant's plugins
  // ===================================================================

  router.get(
    '/',
    requireRole(['merchant_admin', 'pay_admin', 'merchant_viewer']),
    async (req: AuthRequest, res: Response) => {
      try {
        const merchantId = req.user!.merchant_id;

        const result = await pool.query(
          `SELECT
             id,
             cms_type,
             site_url,
             site_name,
             oauth_client_id,
             mode,
             status,
             plugin_version,
             last_sync_at,
             created_at,
             updated_at
           FROM plugin_integrations
           WHERE merchant_id = $1
           ORDER BY created_at DESC`,
          [merchantId]
        );

        return res.json({
          success: true,
          integrations: result.rows,
        });
      } catch (error: any) {
        console.error('List plugins error:', error);
        return res.status(500).json({ error: 'internal_error', message: error.message });
      }
    }
  );

  // ===================================================================
  // GET /plugins/:id — Get plugin details
  // ===================================================================

  router.get(
    '/:id',
    requireRole(['merchant_admin', 'pay_admin', 'merchant_viewer']),
    async (req: AuthRequest, res: Response) => {
      try {
        const { id } = req.params;
        const merchantId = req.user!.merchant_id;

        const result = await pool.query(
          `SELECT
             pi.*,
             we.url as webhook_url,
             we.status as webhook_status
           FROM plugin_integrations pi
           LEFT JOIN webhook_endpoints we ON we.id = pi.webhook_endpoint_id
           WHERE pi.id = $1 AND pi.merchant_id = $2`,
          [id, merchantId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'integration_not_found' });
        }

        const integration = result.rows[0];

        // Get recent sync logs
        const syncLogsResult = await pool.query(
          `SELECT * FROM plugin_sync_logs
           WHERE integration_id = $1
           ORDER BY created_at DESC
           LIMIT 10`,
          [id]
        );

        return res.json({
          success: true,
          integration: {
            ...integration,
            // Don't expose encrypted secrets
            oauth_client_secret_cipher: undefined,
            webhook_secret_cipher: undefined,
          },
          recent_syncs: syncLogsResult.rows,
        });
      } catch (error: any) {
        console.error('Get plugin error:', error);
        return res.status(500).json({ error: 'internal_error', message: error.message });
      }
    }
  );

  // ===================================================================
  // POST /plugins/:id/set-mode — Switch test/live mode
  // ===================================================================

  router.post(
    '/:id/set-mode',
    requireRole(['merchant_admin', 'pay_admin']),
    async (req: AuthRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { mode }: SetModeRequest = req.body;
        const merchantId = req.user!.merchant_id;

        if (!['test', 'live'].includes(mode)) {
          return res.status(400).json({ error: 'invalid_mode' });
        }

        // Check if merchant can activate live mode
        if (mode === 'live') {
          const canActivateResult = await pool.query(
            'SELECT can_activate_live_mode($1) as can_activate',
            [merchantId]
          );

          if (!canActivateResult.rows[0].can_activate) {
            return res.status(403).json({
              error: 'merchant_not_verified',
              message: 'Complete KYC verification to activate live mode',
            });
          }
        }

        const result = await pool.query(
          `UPDATE plugin_integrations
           SET mode = $1, updated_at = now()
           WHERE id = $2 AND merchant_id = $3
           RETURNING *`,
          [mode, id, merchantId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'integration_not_found' });
        }

        // Log mode change
        await pool.query(
          'SELECT record_plugin_sync($1, $2, $3, $4, $5)',
          [
            id,
            'config',
            'push',
            'success',
            JSON.stringify({ mode_changed: mode }),
          ]
        );

        return res.json({
          success: true,
          integration: result.rows[0],
        });
      } catch (error: any) {
        console.error('Set mode error:', error);
        return res.status(500).json({ error: 'internal_error', message: error.message });
      }
    }
  );

  // ===================================================================
  // DELETE /plugins/:id — Revoke plugin access
  // ===================================================================

  router.delete(
    '/:id',
    requireRole(['merchant_admin', 'pay_admin']),
    async (req: AuthRequest, res: Response) => {
      try {
        const { id } = req.params;
        const merchantId = req.user!.merchant_id;

        const result = await pool.query(
          `UPDATE plugin_integrations
           SET status = 'revoked', updated_at = now()
           WHERE id = $1 AND merchant_id = $2
           RETURNING *`,
          [id, merchantId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'integration_not_found' });
        }

        // Log uninstall
        await pool.query(
          `INSERT INTO plugin_installation_logs (integration_id, merchant_id, action, cms_type, site_url, metadata)
           VALUES ($1, $2, 'uninstall', $3, $4, $5)`,
          [
            id,
            merchantId,
            result.rows[0].cms_type,
            result.rows[0].site_url,
            JSON.stringify({ revoked_by: req.user!.id }),
          ]
        );

        return res.json({
          success: true,
          message: 'Plugin access revoked successfully',
        });
      } catch (error: any) {
        console.error('Revoke plugin error:', error);
        return res.status(500).json({ error: 'internal_error', message: error.message });
      }
    }
  );

  // ===================================================================
  // POST /plugins/:id/sync — Sync configuration
  // ===================================================================

  router.post(
    '/:id/sync',
    requireRole(['merchant_admin', 'pay_admin']),
    async (req: AuthRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { sync_type, force }: SyncRequest = req.body;
        const merchantId = req.user!.merchant_id;

        if (!['config', 'payment_methods', 'branding', 'webhooks'].includes(sync_type)) {
          return res.status(400).json({ error: 'invalid_sync_type' });
        }

        // Get integration
        const integrationResult = await pool.query(
          'SELECT * FROM plugin_integrations WHERE id=$1 AND merchant_id=$2',
          [id, merchantId]
        );

        if (integrationResult.rows.length === 0) {
          return res.status(404).json({ error: 'integration_not_found' });
        }

        const integration = integrationResult.rows[0];

        // Simulate sync (in production, call plugin's API endpoint)
        const changes = {
          sync_type,
          timestamp: new Date().toISOString(),
          force: Boolean(force),
        };

        // Record sync
        await pool.query(
          'SELECT record_plugin_sync($1, $2, $3, $4, $5)',
          [id, sync_type, 'push', 'success', JSON.stringify(changes)]
        );

        return res.json({
          success: true,
          message: `${sync_type} synced successfully`,
          changes,
        });
      } catch (error: any) {
        console.error('Sync plugin error:', error);
        return res.status(500).json({ error: 'internal_error', message: error.message });
      }
    }
  );

  return router;
}

// =====================================================================
// Default Export
// =====================================================================

export default createPluginsRouter;
