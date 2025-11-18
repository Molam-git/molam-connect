/**
 * Brique 98 — Offline API Routes
 *
 * Handles device bundle push, device registration, and policy management
 * for offline payment scenarios (QR/USSD).
 *
 * Routes:
 * - POST /offline/push - Device pushes encrypted bundle
 * - POST /offline/devices - Ops registers new device
 * - POST /offline/policies - Ops configures offline policies
 * - GET /offline/devices/:device_id - Get device details
 * - GET /offline/policies/:country - Get policy for country
 * - GET /offline/bundles/:bundle_id - Get bundle status
 */

import express, { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import {
  verifyDeviceSignature,
  decryptBundle,
  validateBundle,
  BundlePayload,
} from './security';

// =====================================================================
// Types & Interfaces
// =====================================================================

export interface OfflineRouterConfig {
  pool: Pool;
  jwtSecret: string;
  enableSiraScoring?: boolean;
}

interface AuthRequest extends Request {
  user?: {
    user_id: string;
    roles: string[];
    tenant_type?: string;
    tenant_id?: string;
  };
}

interface PushBundleRequest {
  device_id: string;
  bundle_id: string;
  encrypted_payload: string; // Base64-encoded encrypted bundle
  signature: string; // Base64-encoded device signature
  device_clock: string; // ISO timestamp
}

interface RegisterDeviceRequest {
  device_id: string;
  user_id?: string;
  tenant_type: 'merchant' | 'agent' | 'internal';
  tenant_id: string;
  pubkey_pem: string;
  country?: string;
  currency_default?: string;
}

interface ConfigurePolicyRequest {
  country: string;
  max_offline_amount: number;
  max_offline_per_device_per_day: number;
  require_agent_approval_above?: number;
  allowed_methods?: string[];
  max_bundle_age_hours?: number;
  enabled?: boolean;
}

// =====================================================================
// Middleware
// =====================================================================

/**
 * JWT Authentication Middleware
 *
 * Verifies JWT token and attaches user to request
 */
function authenticateJWT(jwtSecret: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);

    try {
      // In production, use proper JWT verification library (jsonwebtoken)
      // For now, we'll just decode (INSECURE - replace in production)
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

      req.user = {
        user_id: payload.user_id,
        roles: payload.roles || [],
        tenant_type: payload.tenant_type,
        tenant_id: payload.tenant_id,
      };

      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

/**
 * Role-Based Authorization Middleware
 *
 * Requires user to have specific role
 */
function requireRole(role: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    if (!req.user.roles.includes(role)) {
      return res.status(403).json({ error: `Requires ${role} role` });
    }

    next();
  };
}

// =====================================================================
// Audit Logging Helper
// =====================================================================

async function auditLog(
  pool: Pool,
  bundleId: string | null,
  actor: string,
  action: string,
  details: Record<string, any>
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO offline_audit_logs (bundle_id, actor, action, details)
       VALUES ($1, $2, $3, $4)`,
      [bundleId, actor, action, JSON.stringify(details)]
    );
  } catch (error) {
    console.error('Audit log failed:', error);
    // Don't throw - audit failure shouldn't block operation
  }
}

// =====================================================================
// SIRA Integration Helper
// =====================================================================

async function scoreBundle(
  bundlePayload: BundlePayload,
  enableSira: boolean = true
): Promise<{ score: number; action: 'accept' | 'review' | 'quarantine' }> {
  if (!enableSira) {
    return { score: 0.05, action: 'accept' };
  }

  // TODO: Call SIRA API (Brique 94) to score bundle
  // For now, return mock score
  const mockScore = Math.random() * 0.5; // 0-50% fraud probability

  let action: 'accept' | 'review' | 'quarantine';
  if (mockScore < 0.15) {
    action = 'accept';
  } else if (mockScore < 0.35) {
    action = 'review';
  } else {
    action = 'quarantine';
  }

  return { score: mockScore, action };
}

// =====================================================================
// Router Factory
// =====================================================================

export function createOfflineRouter(config: OfflineRouterConfig): express.Router {
  const router = express.Router();
  const { pool, jwtSecret, enableSiraScoring = true } = config;

  // Apply JSON body parser
  router.use(express.json({ limit: '2mb' }));

  // ===================================================================
  // POST /offline/push — Device pushes encrypted bundle
  // ===================================================================

  router.post('/push', async (req: Request, res: Response) => {
    try {
      const {
        device_id,
        bundle_id,
        encrypted_payload,
        signature,
        device_clock,
      }: PushBundleRequest = req.body;

      // Validate required fields
      if (!device_id || !bundle_id || !encrypted_payload || !signature || !device_clock) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // 1. Check idempotency (bundle already exists?)
      const existingBundle = await pool.query(
        'SELECT id, status FROM offline_tx_bundles WHERE bundle_id = $1',
        [bundle_id]
      );

      if (existingBundle.rows.length > 0) {
        const status = existingBundle.rows[0].status;
        return res.status(200).json({
          success: true,
          message: 'Bundle already processed',
          bundle_id,
          status,
        });
      }

      // 2. Retrieve device public key
      const deviceResult = await pool.query(
        'SELECT pubkey_pem, status, country FROM offline_devices WHERE device_id = $1',
        [device_id]
      );

      if (deviceResult.rows.length === 0) {
        await auditLog(pool, bundle_id, device_id, 'push_rejected', {
          reason: 'device_not_found',
        });
        return res.status(404).json({ error: 'Device not registered' });
      }

      const device = deviceResult.rows[0];

      if (device.status !== 'active') {
        await auditLog(pool, bundle_id, device_id, 'push_rejected', {
          reason: 'device_inactive',
          device_status: device.status,
        });
        return res.status(403).json({ error: 'Device is not active' });
      }

      // 3. Verify device signature
      const payloadBuffer = Buffer.from(encrypted_payload, 'base64');
      const signatureBuffer = Buffer.from(signature, 'base64');

      const isValidSignature = verifyDeviceSignature(
        device.pubkey_pem,
        payloadBuffer,
        signatureBuffer
      );

      if (!isValidSignature) {
        await auditLog(pool, bundle_id, device_id, 'push_rejected', {
          reason: 'invalid_signature',
        });
        return res.status(403).json({ error: 'Invalid device signature' });
      }

      // 4. Decrypt bundle
      let bundlePayload: BundlePayload;
      try {
        bundlePayload = await decryptBundle(payloadBuffer);
      } catch (error: any) {
        await auditLog(pool, bundle_id, device_id, 'push_rejected', {
          reason: 'decryption_failed',
          error: error.message,
        });
        return res.status(400).json({ error: 'Failed to decrypt bundle' });
      }

      // 5. Validate bundle structure and business rules
      const validation = validateBundle(bundlePayload, {
        maxClockSkewMinutes: 30,
        maxBundleAgeHours: 72,
      });

      if (!validation.valid) {
        await auditLog(pool, bundle_id, device_id, 'push_rejected', {
          reason: 'validation_failed',
          errors: validation.errors,
        });
        return res.status(400).json({ error: 'Bundle validation failed', errors: validation.errors });
      }

      // 6. Check offline policy limits
      const country = device.country || 'SN'; // Default to Senegal
      const policy = await pool.query(
        'SELECT * FROM get_offline_policy($1)',
        [country]
      );

      if (policy.rows.length === 0 || !policy.rows[0].enabled) {
        await auditLog(pool, bundle_id, device_id, 'push_rejected', {
          reason: 'offline_disabled_for_country',
          country,
        });
        return res.status(403).json({ error: `Offline payments disabled for ${country}` });
      }

      const policyData = policy.rows[0];

      // Check daily device limits
      const totalAmount = bundlePayload.transactions.reduce((sum, tx) => sum + tx.amount, 0);
      const txCount = bundlePayload.transactions.length;

      const today = new Date().toISOString().split('T')[0];
      const activityCheck = await pool.query(
        `SELECT check_device_daily_limits($1, $2, $3, $4) as exceeds_limit`,
        [device_id, country, totalAmount, txCount]
      );

      if (activityCheck.rows[0]?.exceeds_limit) {
        await auditLog(pool, bundle_id, device_id, 'push_rejected', {
          reason: 'daily_limit_exceeded',
          total_amount: totalAmount,
          tx_count: txCount,
        });
        return res.status(403).json({ error: 'Daily device limits exceeded' });
      }

      // Check max offline amount per transaction
      for (const tx of bundlePayload.transactions) {
        if (tx.amount > policyData.max_offline_amount) {
          await auditLog(pool, bundle_id, device_id, 'push_rejected', {
            reason: 'amount_exceeds_policy',
            tx_amount: tx.amount,
            max_allowed: policyData.max_offline_amount,
          });
          return res.status(403).json({
            error: `Transaction amount ${tx.amount} exceeds max offline amount ${policyData.max_offline_amount}`,
          });
        }
      }

      // 7. SIRA fraud scoring
      const siraResult = await scoreBundle(bundlePayload, enableSiraScoring);
      let bundleStatus: string;

      if (siraResult.action === 'quarantine') {
        bundleStatus = 'quarantined';
      } else if (siraResult.action === 'review') {
        bundleStatus = 'pending_review';
      } else {
        bundleStatus = 'accepted';
      }

      // 8. Store bundle in database
      const insertResult = await pool.query(
        `INSERT INTO offline_tx_bundles
         (bundle_id, device_id, encrypted_payload, signature, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [bundle_id, device_id, payloadBuffer, signatureBuffer, bundleStatus]
      );

      const bundleDbId = insertResult.rows[0].id;

      // 9. Store individual transactions
      for (const tx of bundlePayload.transactions) {
        await pool.query(
          `INSERT INTO offline_transactions
           (bundle_id, local_id, amount, currency, type, sender, receiver, merchant_id, initiated_at, sira_score, meta)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            bundle_id,
            tx.local_id,
            tx.amount,
            tx.currency,
            tx.type,
            tx.sender,
            tx.receiver,
            tx.merchant_id || null,
            tx.initiated_at,
            siraResult.score,
            JSON.stringify(tx.meta || {}),
          ]
        );
      }

      // 10. Record device activity
      await pool.query(
        'SELECT record_device_activity($1, $2, $3, $4)',
        [device_id, today, totalAmount, txCount]
      );

      // 11. Enqueue for reconciliation (if accepted)
      if (bundleStatus === 'accepted') {
        await pool.query(
          `INSERT INTO offline_sync_queue (bundle_id, priority)
           VALUES ($1, $2)`,
          [bundle_id, siraResult.score > 0.1 ? 1 : 5] // Higher risk = higher priority
        );
      }

      // 12. Audit log
      await auditLog(pool, bundle_id, device_id, 'bundle_pushed', {
        status: bundleStatus,
        sira_score: siraResult.score,
        tx_count: txCount,
        total_amount: totalAmount,
      });

      // 13. Update device last_seen_at
      await pool.query(
        'UPDATE offline_devices SET last_seen_at = now() WHERE device_id = $1',
        [device_id]
      );

      return res.status(200).json({
        success: true,
        bundle_id,
        status: bundleStatus,
        sira_score: siraResult.score,
        transactions_count: txCount,
        message:
          bundleStatus === 'quarantined'
            ? 'Bundle quarantined for review'
            : bundleStatus === 'pending_review'
            ? 'Bundle pending manual review'
            : 'Bundle accepted for reconciliation',
      });
    } catch (error: any) {
      console.error('Bundle push error:', error);
      return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  // ===================================================================
  // POST /offline/devices — Register new device (ops only)
  // ===================================================================

  router.post(
    '/devices',
    authenticateJWT(jwtSecret),
    requireRole('pay_admin'),
    async (req: AuthRequest, res: Response) => {
      try {
        const {
          device_id,
          user_id,
          tenant_type,
          tenant_id,
          pubkey_pem,
          country,
          currency_default,
        }: RegisterDeviceRequest = req.body;

        // Validate required fields
        if (!device_id || !tenant_type || !tenant_id || !pubkey_pem) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate tenant_type
        if (!['merchant', 'agent', 'internal'].includes(tenant_type)) {
          return res.status(400).json({ error: 'Invalid tenant_type' });
        }

        // Check if device already exists
        const existing = await pool.query(
          'SELECT id FROM offline_devices WHERE device_id = $1',
          [device_id]
        );

        if (existing.rows.length > 0) {
          return res.status(409).json({ error: 'Device already registered' });
        }

        // Insert device
        const result = await pool.query(
          `INSERT INTO offline_devices
           (device_id, user_id, tenant_type, tenant_id, pubkey_pem, country, currency_default, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
           RETURNING id, device_id, tenant_type, tenant_id, country, created_at`,
          [device_id, user_id || null, tenant_type, tenant_id, pubkey_pem, country || null, currency_default || null]
        );

        const device = result.rows[0];

        // Audit log
        await auditLog(pool, null, req.user!.user_id, 'device_registered', {
          device_id,
          tenant_type,
          tenant_id,
        });

        return res.status(201).json({
          success: true,
          device,
        });
      } catch (error: any) {
        console.error('Device registration error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  );

  // ===================================================================
  // POST /offline/policies — Configure offline policy (ops only)
  // ===================================================================

  router.post(
    '/policies',
    authenticateJWT(jwtSecret),
    requireRole('pay_admin'),
    async (req: AuthRequest, res: Response) => {
      try {
        const {
          country,
          max_offline_amount,
          max_offline_per_device_per_day,
          require_agent_approval_above,
          allowed_methods,
          max_bundle_age_hours,
          enabled,
        }: ConfigurePolicyRequest = req.body;

        // Validate required fields
        if (!country || max_offline_amount === undefined || max_offline_per_device_per_day === undefined) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // Upsert policy
        const result = await pool.query(
          `INSERT INTO offline_policies
           (country, max_offline_amount, max_offline_per_device_per_day, require_agent_approval_above,
            allowed_methods, max_bundle_age_hours, enabled)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (country) DO UPDATE SET
             max_offline_amount = EXCLUDED.max_offline_amount,
             max_offline_per_device_per_day = EXCLUDED.max_offline_per_device_per_day,
             require_agent_approval_above = EXCLUDED.require_agent_approval_above,
             allowed_methods = EXCLUDED.allowed_methods,
             max_bundle_age_hours = EXCLUDED.max_bundle_age_hours,
             enabled = EXCLUDED.enabled,
             updated_at = now()
           RETURNING *`,
          [
            country,
            max_offline_amount,
            max_offline_per_device_per_day,
            require_agent_approval_above || null,
            allowed_methods || ['wallet', 'qr', 'ussd'],
            max_bundle_age_hours || 72,
            enabled !== undefined ? enabled : true,
          ]
        );

        const policy = result.rows[0];

        // Audit log
        await auditLog(pool, null, req.user!.user_id, 'policy_configured', {
          country,
          max_offline_amount,
          enabled,
        });

        return res.status(200).json({
          success: true,
          policy,
        });
      } catch (error: any) {
        console.error('Policy configuration error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  );

  // ===================================================================
  // GET /offline/devices/:device_id — Get device details
  // ===================================================================

  router.get(
    '/devices/:device_id',
    authenticateJWT(jwtSecret),
    async (req: AuthRequest, res: Response) => {
      try {
        const { device_id } = req.params;

        const result = await pool.query(
          `SELECT id, device_id, user_id, tenant_type, tenant_id, status,
                  country, currency_default, created_at, last_seen_at
           FROM offline_devices
           WHERE device_id = $1`,
          [device_id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Device not found' });
        }

        return res.status(200).json({
          success: true,
          device: result.rows[0],
        });
      } catch (error: any) {
        console.error('Get device error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  );

  // ===================================================================
  // GET /offline/policies/:country — Get policy for country
  // ===================================================================

  router.get('/policies/:country', async (req: Request, res: Response) => {
    try {
      const { country } = req.params;

      const result = await pool.query('SELECT * FROM get_offline_policy($1)', [country]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No policy found for country' });
      }

      return res.status(200).json({
        success: true,
        policy: result.rows[0],
      });
    } catch (error: any) {
      console.error('Get policy error:', error);
      return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  // ===================================================================
  // GET /offline/bundles/:bundle_id — Get bundle status
  // ===================================================================

  router.get(
    '/bundles/:bundle_id',
    authenticateJWT(jwtSecret),
    async (req: AuthRequest, res: Response) => {
      try {
        const { bundle_id } = req.params;

        const bundleResult = await pool.query(
          `SELECT b.id, b.bundle_id, b.device_id, b.status, b.push_attempts,
                  b.created_at, b.accepted_at, b.rejected_reason,
                  COUNT(t.id) as tx_count,
                  SUM(t.amount) as total_amount
           FROM offline_tx_bundles b
           LEFT JOIN offline_transactions t ON t.bundle_id = b.bundle_id
           WHERE b.bundle_id = $1
           GROUP BY b.id`,
          [bundle_id]
        );

        if (bundleResult.rows.length === 0) {
          return res.status(404).json({ error: 'Bundle not found' });
        }

        const bundle = bundleResult.rows[0];

        // Get transactions
        const txResult = await pool.query(
          `SELECT id, local_id, amount, currency, type, sender, receiver,
                  status, sira_score, created_at
           FROM offline_transactions
           WHERE bundle_id = $1`,
          [bundle_id]
        );

        return res.status(200).json({
          success: true,
          bundle: {
            ...bundle,
            transactions: txResult.rows,
          },
        });
      } catch (error: any) {
        console.error('Get bundle error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  );

  return router;
}

// =====================================================================
// Default Export
// =====================================================================

export default createOfflineRouter;
