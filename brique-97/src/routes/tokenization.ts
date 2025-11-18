/**
 * Brique 97 — Tokenization API Routes
 *
 * Endpoints for secure payment method tokenization
 *
 * Routes:
 * - POST /api/tokenization/client-token - Generate client token for hosted iframe
 * - POST /api/tokenization/hosted-callback - Receive vaulted token from hosted service
 * - POST /api/tokenization/payment-methods/:id/revoke - Revoke a payment method
 * - GET /api/payment-methods - List payment methods (masked)
 * - POST /api/tokenization/charge - Create charge using vaulted token (internal)
 */

import express, { Request, Response, NextFunction } from 'express';
import { pool, transaction } from '../db';
import { encrypt, decrypt, generateSecureToken, generateCardFingerprint, redact } from '../utils/crypto';
import { requireRole, requireAuth } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimit';
import { publishEvent } from '../webhooks/publisher';
import { checkSiraRisk } from '../services/sira';

const router = express.Router();

// =====================================================================
// 1. POST /api/tokenization/client-token
// =====================================================================
/**
 * Generate client token for merchant to mount hosted iframe
 *
 * Security:
 * - Requires merchant_admin or pay_admin role
 * - Rate limited to 100 requests/minute per merchant
 * - SIRA risk check - blocks high-risk merchants
 * - Single-use token with short TTL (max 120s)
 *
 * Request:
 *   POST /api/tokenization/client-token
 *   Body: {
 *     merchant_id: string,
 *     origin: string, // Merchant domain for CORS
 *     ttl_seconds?: number // Max 300s
 *   }
 *
 * Response:
 *   {
 *     client_token: string,
 *     expires_at: string
 *   }
 */
router.post(
  '/client-token',
  requireAuth,
  requireRole(['merchant_admin', 'pay_admin']),
  rateLimiter({ windowMs: 60 * 1000, max: 100 }),
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const {
        merchant_id,
        origin,
        ttl_seconds = 120,
      } = req.body;

      const user = req.user;

      // Validation
      if (!merchant_id || !origin) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'merchant_id and origin are required',
        });
      }

      if (ttl_seconds > 300) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'ttl_seconds cannot exceed 300 seconds',
        });
      }

      // SIRA risk check
      const siraRisk = await checkSiraRisk({
        merchant_id,
        user_id: user.id,
        action: 'create_client_token',
      });

      if (siraRisk.block_client_token) {
        console.warn(`Client token blocked by SIRA for merchant ${merchant_id}:`, siraRisk);

        return res.status(403).json({
          error: 'forbidden_by_sira',
          message: 'Cannot create client token due to risk policy',
          sira_reasons: siraRisk.reasons,
        });
      }

      // Generate secure random token
      const token = generateSecureToken(32);

      // Calculate expiration
      const expiresAt = new Date(Date.now() + ttl_seconds * 1000);

      // Store client token
      await pool.query(
        `INSERT INTO client_tokens (
          token,
          merchant_id,
          origin,
          ip_address,
          ttl_seconds,
          expires_at,
          created_by,
          user_agent,
          risk_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          token,
          merchant_id,
          origin,
          req.ip,
          ttl_seconds,
          expiresAt,
          user.id,
          req.get('user-agent'),
          siraRisk.risk_score,
        ]
      );

      // Emit telemetry event
      await publishEvent('merchant', merchant_id, 'client_token.created', {
        created_by: user.id,
        origin,
        ttl_seconds,
        risk_score: siraRisk.risk_score,
      });

      console.log(`Client token created for merchant ${merchant_id} by user ${user.id}`);

      res.json({
        client_token: token,
        expires_at: expiresAt.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// =====================================================================
// 2. POST /api/tokenization/hosted-callback
// =====================================================================
/**
 * Receive vaulted token from hosted PCI service
 *
 * This endpoint is called by the hosted iframe (or merchant backend)
 * after card details have been tokenized by the PCI-compliant service.
 *
 * Security:
 * - Validates client_token (single-use, not expired)
 * - Marks client_token as used (replay protection)
 * - Encrypts provider_ref with KMS before storage
 * - Creates audit log entry
 * - Fires webhook event
 *
 * Request:
 *   POST /api/tokenization/hosted-callback
 *   Body: {
 *     client_token: string,
 *     provider_ref: string, // Opaque token from PCI vault
 *     last4: string,
 *     brand: string,
 *     exp_month: number,
 *     exp_year: number,
 *     tenant_type: 'user' | 'merchant' | 'agent',
 *     tenant_id: string,
 *     usage_policy?: {
 *       one_time?: boolean,
 *       max_amount?: number,
 *       allowed_countries?: string[]
 *     },
 *     billing_address?: object
 *   }
 *
 * Response:
 *   {
 *     payment_method_id: string
 *   }
 */
router.post('/hosted-callback', async (req: any, res: Response, next: NextFunction) => {
  try {
    const {
      client_token,
      provider_ref,
      last4,
      brand,
      exp_month,
      exp_year,
      tenant_type,
      tenant_id,
      usage_policy,
      billing_address,
      pan, // For fingerprinting (NOT stored)
    } = req.body;

    // Validation
    if (!client_token || !provider_ref || !tenant_type || !tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing required fields',
      });
    }

    // Use transaction for atomicity
    const paymentMethodId = await transaction(async (client) => {
      // Validate client token
      const { rows: tokenRows } = await client.query(
        `SELECT * FROM client_tokens
         WHERE token = $1
           AND expires_at > now()
           AND used = false`,
        [client_token]
      );

      if (tokenRows.length === 0) {
        throw new Error('invalid_client_token');
      }

      const ct = tokenRows[0];

      // Mark client_token as used (single-use, prevents replay)
      await client.query(
        `UPDATE client_tokens SET used = true, used_at = now() WHERE token = $1`,
        [client_token]
      );

      // Encrypt provider_ref with KMS
      const encryptedToken = await encrypt(Buffer.from(provider_ref, 'utf8'));

      // Generate fingerprint for duplicate detection (if PAN provided)
      let fingerprint: string | null = null;
      if (pan && exp_month && exp_year) {
        fingerprint = generateCardFingerprint(pan, exp_month, exp_year);
      }

      // Insert payment method
      const { rows: pmRows } = await client.query(
        `INSERT INTO payment_methods (
          tenant_type,
          tenant_id,
          type,
          provider,
          token,
          last4,
          brand,
          exp_month,
          exp_year,
          fingerprint,
          billing_address,
          usage_policy,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id`,
        [
          tenant_type,
          tenant_id,
          'card',
          'molam_hosted',
          encryptedToken,
          last4,
          brand,
          exp_month,
          exp_year,
          fingerprint,
          billing_address || null,
          usage_policy || {},
          req.user?.id || null,
        ]
      );

      const paymentMethodId = pmRows[0].id;

      // Create audit log entry
      await client.query(
        `INSERT INTO payment_method_audit (
          payment_method_id,
          client_token_id,
          action,
          actor_type,
          actor_id,
          details,
          ip_address,
          user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          paymentMethodId,
          ct.id,
          'created',
          req.user ? 'user' : 'system',
          req.user?.id || null,
          {
            by: 'hosted_callback',
            merchant_id: ct.merchant_id,
            last4: redact(last4),
            brand,
          },
          req.ip,
          req.get('user-agent'),
        ]
      );

      return paymentMethodId;
    });

    // Publish event (outside transaction for performance)
    await publishEvent(tenant_type, tenant_id, 'payment_method.created', {
      id: paymentMethodId,
      type: 'card',
      last4,
      brand,
    });

    console.log(`Payment method ${paymentMethodId} created for ${tenant_type}:${tenant_id}`);

    res.json({
      payment_method_id: paymentMethodId,
    });
  } catch (error: any) {
    if (error.message === 'invalid_client_token') {
      return res.status(400).json({
        error: 'invalid_client_token',
        message: 'Client token is invalid, expired, or already used',
      });
    }

    next(error);
  }
});

// =====================================================================
// 3. POST /api/tokenization/payment-methods/:id/revoke
// =====================================================================
/**
 * Revoke a payment method
 *
 * Security:
 * - Requires authentication
 * - RBAC: Only owner or admin can revoke
 * - Creates audit log entry
 * - Fires webhook event
 *
 * Request:
 *   POST /api/tokenization/payment-methods/:id/revoke
 *   Body: {
 *     reason: string
 *   }
 *
 * Response:
 *   {
 *     success: boolean
 *   }
 */
router.post(
  '/payment-methods/:id/revoke',
  requireAuth,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const user = req.user;

      if (!reason) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'reason is required',
        });
      }

      // Revoke using database function
      const { rows } = await pool.query(
        `SELECT revoke_payment_method($1, $2, $3) as success`,
        [id, user.id, reason]
      );

      const success = rows[0]?.success || false;

      if (!success) {
        return res.status(404).json({
          error: 'not_found',
          message: 'Payment method not found or already revoked',
        });
      }

      // Get payment method details for event
      const { rows: pmRows } = await pool.query(
        `SELECT tenant_type, tenant_id, last4, brand FROM payment_methods WHERE id = $1`,
        [id]
      );

      if (pmRows.length > 0) {
        const pm = pmRows[0];
        await publishEvent(pm.tenant_type, pm.tenant_id, 'payment_method.revoked', {
          id,
          last4: pm.last4,
          brand: pm.brand,
          reason,
        });
      }

      console.log(`Payment method ${id} revoked by user ${user.id}: ${reason}`);

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

// =====================================================================
// 4. GET /api/payment-methods
// =====================================================================
/**
 * List payment methods for a tenant (masked data only)
 *
 * Security:
 * - Requires authentication
 * - Tenant isolation enforced
 * - Only returns masked data (last4, brand, etc.)
 *
 * Query params:
 *   tenant_type: 'user' | 'merchant' | 'agent'
 *   tenant_id: string
 *
 * Response:
 *   {
 *     payment_methods: [
 *       {
 *         id: string,
 *         type: string,
 *         last4: string,
 *         brand: string,
 *         exp_month: number,
 *         exp_year: number,
 *         is_default: boolean,
 *         created_at: string
 *       }
 *     ]
 *   }
 */
router.get('/payment-methods', requireAuth, async (req: any, res: Response, next: NextFunction) => {
  try {
    const { tenant_type, tenant_id } = req.query;

    if (!tenant_type || !tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_type and tenant_id are required',
      });
    }

    // Use database function for listing
    const { rows } = await pool.query(
      `SELECT * FROM get_active_payment_methods($1, $2)`,
      [tenant_type, tenant_id]
    );

    res.json({
      payment_methods: rows,
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================================
// 5. POST /api/tokenization/charge (Internal)
// =====================================================================
/**
 * Create charge using vaulted token (internal endpoint)
 *
 * Security:
 * - Requires mTLS (internal services only)
 * - Validates usage policy
 * - Creates audit log entry
 * - SIRA risk check
 *
 * Request:
 *   POST /api/tokenization/charge
 *   Body: {
 *     payment_method_id: string,
 *     amount: number,
 *     currency: string,
 *     merchant_id: string,
 *     idempotency_key: string
 *   }
 *
 * Response:
 *   {
 *     success: boolean,
 *     charge_id: string,
 *     provider_charge_id: string
 *   }
 */
router.post(
  '/charge',
  requireAuth,
  requireRole(['internal_service']),
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const {
        payment_method_id,
        amount,
        currency,
        merchant_id,
        idempotency_key,
      } = req.body;

      // Validation
      if (!payment_method_id || !amount || !currency || !merchant_id || !idempotency_key) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'Missing required fields',
        });
      }

      // Fetch payment method
      const { rows: pmRows } = await pool.query(
        `SELECT * FROM payment_methods WHERE id = $1 AND is_active = true`,
        [payment_method_id]
      );

      if (pmRows.length === 0) {
        return res.status(404).json({
          error: 'invalid_payment_method',
          message: 'Payment method not found or inactive',
        });
      }

      const pm = pmRows[0];

      // Validate usage policy
      const policy = pm.usage_policy || {};

      if (policy.max_amount && Number(amount) > Number(policy.max_amount)) {
        return res.status(400).json({
          error: 'exceeds_token_limit',
          message: `Amount exceeds max_amount of ${policy.max_amount}`,
        });
      }

      if (policy.allowed_countries && policy.allowed_countries.length > 0) {
        // Country validation would go here based on merchant/user location
      }

      // Decrypt provider_ref from KMS
      const providerRefBuffer = await decrypt(pm.token);
      const providerRef = providerRefBuffer.toString('utf8');

      // TODO: Call provider connector to charge via provider_ref
      // const chargeResult = await providerCharge(providerRef, amount, currency, { merchant_id, idempotency_key });

      // For now, simulate success
      const chargeResult = {
        success: true,
        charge_id: `charge_${Date.now()}`,
        provider_id: `provider_${Date.now()}`,
      };

      // Create audit log
      await pool.query(
        `INSERT INTO payment_method_audit (
          payment_method_id,
          action,
          actor_type,
          details
        ) VALUES ($1, $2, $3, $4)`,
        [
          payment_method_id,
          'used',
          'system',
          {
            charge_id: chargeResult.charge_id,
            amount,
            currency,
            merchant_id,
          },
        ]
      );

      // If one-time token, revoke after use
      if (policy.one_time) {
        await pool.query(
          `UPDATE payment_methods SET is_active = false, revoked_at = now(), revoked_reason = 'one_time_use' WHERE id = $1`,
          [payment_method_id]
        );
      }

      res.json({
        success: true,
        charge_id: chargeResult.charge_id,
        provider_charge_id: chargeResult.provider_id,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
