/**
 * Brique 97 — Charge with Token Service
 *
 * Creates charges using vaulted payment method tokens
 */

import { pool, transaction } from '../db';
import { decrypt } from '../utils/crypto';
import { checkSiraRisk, reportToSira } from './sira';

export interface ChargeRequest {
  payment_method_id: string;
  amount: number;
  currency: string;
  merchant_id: string;
  idempotency_key: string;
  metadata?: Record<string, any>;
}

export interface ChargeResult {
  success: boolean;
  charge_id?: string;
  provider_charge_id?: string;
  error?: string;
  error_code?: string;
}

/**
 * Create charge using vaulted token
 */
export async function chargeWithToken(params: ChargeRequest): Promise<ChargeResult> {
  const { payment_method_id, amount, currency, merchant_id, idempotency_key, metadata } = params;

  try {
    // Check idempotency
    const existing = await checkIdempotency(idempotency_key);
    if (existing) {
      console.log(`Idempotent charge request: ${idempotency_key}`);
      return existing;
    }

    // Fetch payment method
    const { rows: pmRows } = await pool.query(
      `SELECT * FROM payment_methods WHERE id = $1 AND is_active = true AND deleted_at IS NULL`,
      [payment_method_id]
    );

    if (pmRows.length === 0) {
      return {
        success: false,
        error: 'Payment method not found or inactive',
        error_code: 'invalid_payment_method',
      };
    }

    const pm = pmRows[0];

    // Validate usage policy
    const policy = pm.usage_policy || {};

    if (policy.max_amount && Number(amount) > Number(policy.max_amount)) {
      return {
        success: false,
        error: `Amount exceeds max_amount of ${policy.max_amount}`,
        error_code: 'exceeds_token_limit',
      };
    }

    if (policy.allowed_countries && policy.allowed_countries.length > 0) {
      // Country validation based on merchant/user location
      // TODO: Implement country check
    }

    // SIRA risk check
    const siraRisk = await checkSiraRisk({
      merchant_id,
      payment_method_id,
      amount,
      currency,
      action: 'charge',
    });

    if (siraRisk.block_charge) {
      console.warn(`Charge blocked by SIRA: ${siraRisk.reasons.join(', ')}`);

      return {
        success: false,
        error: 'Charge blocked due to risk policy',
        error_code: 'blocked_by_sira',
      };
    }

    // Decrypt provider_ref from KMS
    const providerRefBuffer = await decrypt(pm.token);
    const providerRef = providerRefBuffer.toString('utf8');

    // Call provider connector to charge
    const chargeResult = await providerCharge({
      provider_ref: providerRef,
      amount,
      currency,
      merchant_id,
      idempotency_key,
      metadata,
      require_3ds: siraRisk.require_3ds,
    });

    if (!chargeResult.success) {
      // Report failure to SIRA
      await reportToSira({
        payment_method_id,
        charge_id: chargeResult.charge_id || 'failed',
        success: false,
      });

      // Audit failed attempt
      await pool.query(
        `INSERT INTO payment_method_audit (
          payment_method_id,
          action,
          actor_type,
          details
        ) VALUES ($1, $2, $3, $4)`,
        [
          payment_method_id,
          'failed_use',
          'system',
          {
            error: chargeResult.error,
            error_code: chargeResult.error_code,
            amount,
            currency,
            merchant_id,
          },
        ]
      );

      return chargeResult;
    }

    // Success - record in transaction using database transaction
    await transaction(async (client) => {
      // TODO: Create wallet_transactions entry
      // await client.query(`INSERT INTO wallet_transactions...`);

      // Audit successful use
      await client.query(
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
            provider_charge_id: chargeResult.provider_charge_id,
            amount,
            currency,
            merchant_id,
          },
        ]
      );

      // Store idempotency result
      await client.query(
        `INSERT INTO idempotency_keys (key, result, created_at, expires_at)
         VALUES ($1, $2, now(), now() + interval '24 hours')
         ON CONFLICT (key) DO NOTHING`,
        [idempotency_key, JSON.stringify(chargeResult)]
      );

      // If one-time token, revoke after use
      if (policy.one_time) {
        await client.query(
          `UPDATE payment_methods
           SET is_active = false, revoked_at = now(), revoked_reason = 'one_time_use'
           WHERE id = $1`,
          [payment_method_id]
        );
      }
    });

    // Report success to SIRA
    await reportToSira({
      payment_method_id,
      charge_id: chargeResult.charge_id!,
      success: true,
    });

    return chargeResult;
  } catch (error: any) {
    console.error('Charge error:', error);

    return {
      success: false,
      error: 'Internal server error',
      error_code: 'charge_failed',
    };
  }
}

/**
 * Call provider to charge via token
 */
async function providerCharge(params: {
  provider_ref: string;
  amount: number;
  currency: string;
  merchant_id: string;
  idempotency_key: string;
  metadata?: Record<string, any>;
  require_3ds?: boolean;
}): Promise<ChargeResult> {
  const provider = process.env.VAULT_PROVIDER || 'mock';

  switch (provider) {
    case 'stripe':
      return await chargeWithStripe(params);

    case 'adyen':
      return await chargeWithAdyen(params);

    case 'mock':
    default:
      return await chargeMock(params);
  }
}

/**
 * Charge with Stripe
 */
async function chargeWithStripe(params: any): Promise<ChargeResult> {
  // TODO: Integrate with Stripe API
  // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  // const charge = await stripe.charges.create({
  //   amount: params.amount,
  //   currency: params.currency,
  //   source: params.provider_ref,
  //   metadata: params.metadata,
  // });
  // return { success: true, charge_id: charge.id, provider_charge_id: charge.id };

  throw new Error('Stripe integration not implemented');
}

/**
 * Charge with Adyen
 */
async function chargeWithAdyen(params: any): Promise<ChargeResult> {
  // TODO: Integrate with Adyen API
  throw new Error('Adyen integration not implemented');
}

/**
 * Mock charge (for development)
 */
async function chargeMock(params: any): Promise<ChargeResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Simulate occasional failures (10% failure rate)
  if (Math.random() < 0.1) {
    return {
      success: false,
      error: 'Insufficient funds',
      error_code: 'card_declined',
    };
  }

  const chargeId = `charge_${Date.now()}`;
  const providerChargeId = `provider_${Date.now()}`;

  return {
    success: true,
    charge_id: chargeId,
    provider_charge_id: providerChargeId,
  };
}

/**
 * Check for idempotent request
 */
async function checkIdempotency(key: string): Promise<ChargeResult | null> {
  try {
    const { rows } = await pool.query(
      `SELECT result FROM idempotency_keys WHERE key = $1 AND expires_at > now()`,
      [key]
    );

    if (rows.length > 0) {
      return rows[0].result as ChargeResult;
    }

    return null;
  } catch (error) {
    console.error('Idempotency check error:', error);
    return null;
  }
}

// Create idempotency_keys table if it doesn't exist
async function ensureIdempotencyTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      result JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
  `);
}

// Initialize on module load
ensureIdempotencyTable().catch(console.error);
