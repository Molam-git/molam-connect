import express, { Request, Response } from 'express';
import { pool } from '../utils/db';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

export const formRouter = express.Router();

/**
 * Middleware to extract and validate API key from request
 */
async function authenticateApiKey(req: any, res: Response, next: Function) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_api_key', message: 'Authorization header required' });
  }

  const apiKey = authHeader.substring(7);

  // Validate key format
  if (!apiKey.startsWith('pk_') && !apiKey.startsWith('sk_')) {
    return res.status(401).json({ error: 'invalid_api_key', message: 'Invalid key format' });
  }

  try {
    const keyPrefix = apiKey.substring(0, 10);
    const keySuffix = apiKey.substring(apiKey.length - 6);
    const keyHash = await bcrypt.hash(apiKey, 10);

    // Find the key in database (in production, use hash comparison)
    const result = await pool.query(
      `SELECT ak.*, mp.merchant_id, mp.status as plugin_status
       FROM api_keys ak
       JOIN merchant_plugins mp ON ak.merchant_id = mp.merchant_id
       WHERE ak.key_prefix = $1
         AND ak.key_suffix = $2
         AND ak.status = 'active'
         AND mp.status = 'active'
       LIMIT 1`,
      [keyPrefix, keySuffix]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'invalid_api_key', message: 'API key not found or inactive' });
    }

    const keyRecord = result.rows[0];

    // Attach merchant info to request
    req.merchantId = keyRecord.merchant_id;
    req.apiKeyId = keyRecord.id;
    req.environment = keyRecord.environment;
    req.keyType = keyRecord.key_type;

    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    return res.status(500).json({ error: 'auth_failed', message: 'Authentication failed' });
  }
}

/**
 * Role-based access control middleware
 */
function requireRole(roles: string[]) {
  return (req: any, res: Response, next: Function) => {
    // In production, check req.user.role from session/JWT
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', message: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Generate API keys (test/live)
 * POST /form/api-keys
 */
formRouter.post('/api-keys', requireRole(['merchant_owner', 'admin']), async (req: any, res: Response) => {
  const { merchant_id, key_type, environment } = req.body;

  // Validation
  if (!merchant_id || !key_type || !environment) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'merchant_id, key_type, and environment are required'
    });
  }

  if (!['publishable', 'secret'].includes(key_type)) {
    return res.status(400).json({
      error: 'invalid_key_type',
      message: 'key_type must be "publishable" or "secret"'
    });
  }

  if (!['test', 'live'].includes(environment)) {
    return res.status(400).json({
      error: 'invalid_environment',
      message: 'environment must be "test" or "live"'
    });
  }

  try {
    // Check if merchant has active plugin
    const pluginCheck = await pool.query(
      `SELECT id FROM merchant_plugins
       WHERE merchant_id = $1 AND status = 'active' LIMIT 1`,
      [merchant_id]
    );

    if (pluginCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'plugin_not_found',
        message: 'No active plugin found for this merchant'
      });
    }

    // Generate API key using database function
    const result = await pool.query(
      `SELECT * FROM generate_api_key($1, $2, $3)`,
      [merchant_id, key_type, environment]
    );

    const apiKeyRecord = result.rows[0];

    // In production, return the full key only once (never stored in plaintext)
    // For development, we reconstruct it from prefix + random + suffix
    const fullKey = `${apiKeyRecord.key_prefix}${crypto.randomBytes(16).toString('hex')}${apiKeyRecord.key_suffix}`;

    return res.status(201).json({
      id: apiKeyRecord.id,
      key_type: apiKeyRecord.key_type,
      environment: apiKeyRecord.environment,
      api_key: fullKey, // ONLY returned on creation
      key_prefix: apiKeyRecord.key_prefix,
      created_at: apiKeyRecord.created_at,
      warning: 'Store this key securely. It will not be shown again.'
    });

  } catch (error: any) {
    console.error('API key generation error:', error);
    return res.status(500).json({
      error: 'generation_failed',
      message: error.message
    });
  }
});

/**
 * List API keys for a merchant (without full key)
 * GET /form/api-keys?merchant_id=xxx
 */
formRouter.get('/api-keys', requireRole(['merchant_owner', 'admin']), async (req: any, res: Response) => {
  const { merchant_id } = req.query;

  if (!merchant_id) {
    return res.status(400).json({ error: 'validation_failed', message: 'merchant_id required' });
  }

  try {
    const result = await pool.query(
      `SELECT id, key_type, environment, key_prefix, key_suffix, status, created_at, last_used_at
       FROM api_keys
       WHERE merchant_id = $1
       ORDER BY created_at DESC`,
      [merchant_id]
    );

    return res.json({ keys: result.rows });
  } catch (error: any) {
    console.error('API keys list error:', error);
    return res.status(500).json({ error: 'list_failed', message: error.message });
  }
});

/**
 * Revoke an API key
 * DELETE /form/api-keys/:key_id
 */
formRouter.delete('/api-keys/:key_id', requireRole(['merchant_owner', 'admin']), async (req: any, res: Response) => {
  const { key_id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE api_keys
       SET status = 'revoked', revoked_at = NOW()
       WHERE id = $1
       RETURNING id, status`,
      [key_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'key_not_found', message: 'API key not found' });
    }

    return res.json({ success: true, key_id, status: 'revoked' });
  } catch (error: any) {
    console.error('API key revocation error:', error);
    return res.status(500).json({ error: 'revocation_failed', message: error.message });
  }
});

/**
 * Create a payment intent
 * POST /form/payment-intents
 */
formRouter.post('/payment-intents', authenticateApiKey, async (req: any, res: Response) => {
  const {
    amount,
    currency,
    payment_method_type,
    metadata,
    customer_email,
    customer_name,
    description,
    return_url
  } = req.body;

  // Validation
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'invalid_amount', message: 'amount must be positive' });
  }

  if (!currency || currency.length !== 3) {
    return res.status(400).json({ error: 'invalid_currency', message: 'currency must be 3-letter ISO code' });
  }

  try {
    // Generate intent reference
    const intentRef = await pool.query(`SELECT generate_intent_reference() as ref`);
    const intent_reference = intentRef.rows[0].ref;

    // Create payment intent
    const result = await pool.query(
      `INSERT INTO payment_intents (
        intent_reference,
        merchant_id,
        amount,
        currency,
        payment_method_type,
        metadata,
        customer_email,
        customer_name,
        description,
        return_url,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'requires_payment_method')
      RETURNING *`,
      [
        intent_reference,
        req.merchantId,
        amount,
        currency,
        payment_method_type || 'card',
        JSON.stringify(metadata || {}),
        customer_email,
        customer_name,
        description,
        return_url
      ]
    );

    const intent = result.rows[0];

    // Log creation event
    await pool.query(
      `INSERT INTO plugin_logs (
        merchant_id,
        event_type,
        payload,
        intent_id
      ) VALUES ($1, 'intent_created', $2, $3)`,
      [req.merchantId, JSON.stringify({ intent_reference, amount, currency }), intent.id]
    );

    return res.status(201).json({
      id: intent.id,
      intent_reference: intent.intent_reference,
      amount: intent.amount,
      currency: intent.currency,
      status: intent.status,
      payment_method_type: intent.payment_method_type,
      customer_email: intent.customer_email,
      created_at: intent.created_at,
      client_secret: `${intent.intent_reference}_secret_${crypto.randomBytes(16).toString('hex')}`
    });

  } catch (error: any) {
    console.error('Payment intent creation error:', error);
    return res.status(500).json({ error: 'creation_failed', message: error.message });
  }
});

/**
 * Retrieve a payment intent
 * GET /form/payment-intents/:intent_id
 */
formRouter.get('/payment-intents/:intent_id', authenticateApiKey, async (req: any, res: Response) => {
  const { intent_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM payment_intents
       WHERE (id = $1 OR intent_reference = $1)
         AND merchant_id = $2`,
      [intent_id, req.merchantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'intent_not_found', message: 'Payment intent not found' });
    }

    const intent = result.rows[0];

    // Update last_used_at for API key
    await pool.query(
      `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
      [req.apiKeyId]
    );

    return res.json({
      id: intent.id,
      intent_reference: intent.intent_reference,
      amount: intent.amount,
      currency: intent.currency,
      status: intent.status,
      payment_method_type: intent.payment_method_type,
      customer_email: intent.customer_email,
      customer_name: intent.customer_name,
      description: intent.description,
      metadata: intent.metadata,
      captured_at: intent.captured_at,
      canceled_at: intent.canceled_at,
      created_at: intent.created_at
    });

  } catch (error: any) {
    console.error('Payment intent retrieval error:', error);
    return res.status(500).json({ error: 'retrieval_failed', message: error.message });
  }
});

/**
 * Update a payment intent (e.g., confirm, cancel)
 * PATCH /form/payment-intents/:intent_id
 */
formRouter.patch('/payment-intents/:intent_id', authenticateApiKey, async (req: any, res: Response) => {
  const { intent_id } = req.params;
  const { action, payment_method_token } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'missing_action', message: 'action is required (confirm, cancel)' });
  }

  try {
    // Fetch current intent
    const currentIntent = await pool.query(
      `SELECT * FROM payment_intents
       WHERE (id = $1 OR intent_reference = $1)
         AND merchant_id = $2`,
      [intent_id, req.merchantId]
    );

    if (currentIntent.rows.length === 0) {
      return res.status(404).json({ error: 'intent_not_found', message: 'Payment intent not found' });
    }

    const intent = currentIntent.rows[0];

    let newStatus = intent.status;
    let updateFields: any = {};

    switch (action) {
      case 'confirm':
        if (intent.status !== 'requires_payment_method' && intent.status !== 'requires_confirmation') {
          return res.status(400).json({
            error: 'invalid_status',
            message: `Cannot confirm intent with status ${intent.status}`
          });
        }

        if (!payment_method_token) {
          return res.status(400).json({
            error: 'missing_payment_method',
            message: 'payment_method_token required for confirmation'
          });
        }

        newStatus = 'processing';
        updateFields.payment_method_token = payment_method_token;
        break;

      case 'capture':
        if (intent.status !== 'processing') {
          return res.status(400).json({
            error: 'invalid_status',
            message: `Cannot capture intent with status ${intent.status}`
          });
        }
        newStatus = 'succeeded';
        updateFields.captured_at = new Date();
        break;

      case 'cancel':
        if (intent.status === 'succeeded' || intent.status === 'canceled') {
          return res.status(400).json({
            error: 'invalid_status',
            message: `Cannot cancel intent with status ${intent.status}`
          });
        }
        newStatus = 'canceled';
        updateFields.canceled_at = new Date();
        break;

      default:
        return res.status(400).json({
          error: 'invalid_action',
          message: 'action must be one of: confirm, capture, cancel'
        });
    }

    // Update intent
    const updateResult = await pool.query(
      `UPDATE payment_intents
       SET status = $1,
           payment_method_token = COALESCE($2, payment_method_token),
           captured_at = COALESCE($3, captured_at),
           canceled_at = COALESCE($4, canceled_at)
       WHERE id = $5
       RETURNING *`,
      [newStatus, updateFields.payment_method_token, updateFields.captured_at, updateFields.canceled_at, intent.id]
    );

    const updatedIntent = updateResult.rows[0];

    // Log action
    await pool.query(
      `INSERT INTO plugin_logs (
        merchant_id,
        event_type,
        payload,
        intent_id
      ) VALUES ($1, $2, $3, $4)`,
      [
        req.merchantId,
        `intent_${action}`,
        JSON.stringify({ intent_reference: updatedIntent.intent_reference, old_status: intent.status, new_status: newStatus }),
        intent.id
      ]
    );

    return res.json({
      id: updatedIntent.id,
      intent_reference: updatedIntent.intent_reference,
      status: updatedIntent.status,
      amount: updatedIntent.amount,
      currency: updatedIntent.currency,
      captured_at: updatedIntent.captured_at,
      canceled_at: updatedIntent.canceled_at
    });

  } catch (error: any) {
    console.error('Payment intent update error:', error);
    return res.status(500).json({ error: 'update_failed', message: error.message });
  }
});

/**
 * Plugin telemetry logging
 * POST /form/logs
 */
formRouter.post('/logs', authenticateApiKey, async (req: any, res: Response) => {
  const {
    event_type,
    sdk_version,
    platform,
    payload,
    intent_reference
  } = req.body;

  if (!event_type) {
    return res.status(400).json({ error: 'validation_failed', message: 'event_type is required' });
  }

  try {
    // Find intent_id if intent_reference provided
    let intent_id = null;
    if (intent_reference) {
      const intentResult = await pool.query(
        `SELECT id FROM payment_intents WHERE intent_reference = $1 LIMIT 1`,
        [intent_reference]
      );
      if (intentResult.rows.length > 0) {
        intent_id = intentResult.rows[0].id;
      }
    }

    // Insert log
    const result = await pool.query(
      `INSERT INTO plugin_logs (
        merchant_id,
        event_type,
        sdk_version,
        platform,
        payload,
        intent_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, logged_at`,
      [
        req.merchantId,
        event_type,
        sdk_version,
        platform,
        JSON.stringify(payload || {}),
        intent_id
      ]
    );

    const log = result.rows[0];

    return res.status(201).json({
      log_id: log.id,
      logged_at: log.logged_at,
      success: true
    });

  } catch (error: any) {
    console.error('Plugin logging error:', error);
    return res.status(500).json({ error: 'logging_failed', message: error.message });
  }
});

/**
 * Get plugin logs for a merchant
 * GET /form/logs?merchant_id=xxx&limit=100
 */
formRouter.get('/logs', requireRole(['merchant_owner', 'admin']), async (req: any, res: Response) => {
  const { merchant_id, limit = '100', offset = '0', event_type } = req.query;

  if (!merchant_id) {
    return res.status(400).json({ error: 'validation_failed', message: 'merchant_id required' });
  }

  try {
    let query = `
      SELECT pl.*, pi.intent_reference
      FROM plugin_logs pl
      LEFT JOIN payment_intents pi ON pl.intent_id = pi.id
      WHERE pl.merchant_id = $1
    `;
    const params: any[] = [merchant_id];

    if (event_type) {
      params.push(event_type);
      query += ` AND pl.event_type = $${params.length}`;
    }

    query += ` ORDER BY pl.logged_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string, 10));
    params.push(parseInt(offset as string, 10));

    const result = await pool.query(query, params);

    return res.json({
      logs: result.rows,
      count: result.rows.length,
      offset: parseInt(offset as string, 10),
      limit: parseInt(limit as string, 10)
    });

  } catch (error: any) {
    console.error('Plugin logs retrieval error:', error);
    return res.status(500).json({ error: 'retrieval_failed', message: error.message });
  }
});

/**
 * Get or create plugin configuration
 * GET /form/config?merchant_id=xxx
 */
formRouter.get('/config', requireRole(['merchant_owner', 'admin']), async (req: any, res: Response) => {
  const { merchant_id } = req.query;

  if (!merchant_id) {
    return res.status(400).json({ error: 'validation_failed', message: 'merchant_id required' });
  }

  try {
    let result = await pool.query(
      `SELECT * FROM plugin_configs WHERE merchant_id = $1 LIMIT 1`,
      [merchant_id]
    );

    // Create default config if none exists
    if (result.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO plugin_configs (merchant_id, branding, checkout_settings)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [
          merchant_id,
          JSON.stringify({ primary_color: '#5469d4', logo_url: null }),
          JSON.stringify({ show_molam_branding: true, payment_methods: ['card'], locale: 'en' })
        ]
      );
    }

    return res.json(result.rows[0]);

  } catch (error: any) {
    console.error('Plugin config retrieval error:', error);
    return res.status(500).json({ error: 'retrieval_failed', message: error.message });
  }
});

/**
 * Update plugin configuration
 * PATCH /form/config
 */
formRouter.patch('/config', requireRole(['merchant_owner', 'admin']), async (req: any, res: Response) => {
  const { merchant_id, branding, checkout_settings } = req.body;

  if (!merchant_id) {
    return res.status(400).json({ error: 'validation_failed', message: 'merchant_id required' });
  }

  try {
    const result = await pool.query(
      `UPDATE plugin_configs
       SET branding = COALESCE($2, branding),
           checkout_settings = COALESCE($3, checkout_settings)
       WHERE merchant_id = $1
       RETURNING *`,
      [merchant_id, JSON.stringify(branding), JSON.stringify(checkout_settings)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'config_not_found', message: 'Plugin config not found' });
    }

    return res.json(result.rows[0]);

  } catch (error: any) {
    console.error('Plugin config update error:', error);
    return res.status(500).json({ error: 'update_failed', message: error.message });
  }
});

export default formRouter;
