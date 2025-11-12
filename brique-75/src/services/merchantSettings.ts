/**
 * Brique 75 - Merchant Settings Service
 *
 * Comprehensive merchant configuration service with:
 * - Settings management with automatic versioning
 * - Branding configuration
 * - Payment methods management
 * - Sales zones and tax configuration
 * - Refund policies
 * - Subscription configuration
 * - Commission override workflow
 * - Immutable audit trail
 *
 * @module merchantSettings
 */

import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface MerchantSettings {
  id: string;
  merchant_id: string;
  default_currency: string;
  default_language: string;
  supported_currencies: string[];
  supported_languages: string[];
  timezone: string;
  active_payment_methods: string[];
  payment_method_priority: string[];
  branding_id?: string;
  sales_zones_id?: string;
  refund_policy_id?: string;
  subscription_config_id?: string;
  commission_override?: number;
  commission_override_approved_by?: string;
  commission_override_expires_at?: Date;
  checkout_config: Record<string, any>;
  features: Record<string, any>;
  version: number;
  last_modified_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface MerchantBranding {
  id: string;
  merchant_id: string;
  business_name: string;
  logo_url?: string;
  logo_square_url?: string;
  favicon_url?: string;
  cover_image_url?: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  font_url?: string;
  button_style: 'square' | 'rounded' | 'pill';
  button_border_radius?: number;
  checkout_theme: 'light' | 'dark' | 'auto';
  checkout_layout: 'embedded' | 'redirect' | 'popup';
  custom_css?: string;
  support_email?: string;
  support_phone?: string;
  website_url?: string;
  social_links: Record<string, string>;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentMethodConfig {
  id: string;
  merchant_id: string;
  method_type: string;
  provider?: string;
  is_enabled: boolean;
  display_name?: string;
  display_order: number;
  min_amount?: number;
  max_amount?: number;
  daily_limit?: number;
  monthly_limit?: number;
  fee_type?: 'percentage' | 'fixed' | 'hybrid';
  fee_percentage?: number;
  fee_fixed?: number;
  supported_currencies?: string[];
  allowed_countries?: string[];
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface SalesZone {
  id: string;
  merchant_id: string;
  allowed_countries: string[];
  blocked_countries: string[];
  allowed_regions?: string[];
  blocked_regions?: string[];
  tax_config: Record<string, any>;
  currency_mapping: Record<string, string>;
  shipping_zones: Array<{
    zone_name: string;
    countries: string[];
    base_rate: number;
    per_item_rate?: number;
    free_shipping_threshold?: number;
  }>;
  created_at: Date;
  updated_at: Date;
}

export interface RefundPolicy {
  id: string;
  merchant_id: string;
  policy_name: string;
  auto_refund_enabled: boolean;
  auto_refund_window_days: number;
  auto_refund_conditions?: Record<string, any>;
  manual_refund_requires_approval: boolean;
  approval_threshold_amount?: number;
  partial_refund_enabled: boolean;
  refund_fee_type: 'none' | 'percentage' | 'fixed';
  refund_fee_percentage?: number;
  refund_fee_fixed?: number;
  refund_fee_paid_by: 'merchant' | 'customer' | 'split';
  max_refund_days: number;
  reasons_required: boolean;
  allowed_reasons?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionConfig {
  id: string;
  merchant_id: string;
  subscriptions_enabled: boolean;
  allowed_intervals: string[];
  trial_enabled: boolean;
  default_trial_days: number;
  retry_failed_payments: boolean;
  retry_schedule: number[];
  max_retry_attempts: number;
  dunning_enabled: boolean;
  dunning_email_schedule: number[];
  allow_customer_cancellation: boolean;
  cancellation_requires_reason: boolean;
  cancellation_refund_policy?: string;
  proration_enabled: boolean;
  allow_plan_changes: boolean;
  plan_change_timing: 'immediate' | 'next_billing_cycle';
  created_at: Date;
  updated_at: Date;
}

export interface CommissionOverride {
  id: string;
  merchant_id: string;
  commission_rate: number;
  reason: string;
  justification?: string;
  requested_by: string;
  approved_by?: string;
  approved_at?: Date;
  rejected_by?: string;
  rejected_at?: Date;
  rejection_reason?: string;
  effective_from: Date;
  effective_until?: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked';
  conditions?: Record<string, any>;
  created_at: Date;
}

export interface SettingsHistory {
  id: string;
  settings_id: string;
  merchant_id: string;
  version: number;
  settings_snapshot: Record<string, any>;
  changed_fields: string[];
  changed_by: string;
  created_at: Date;
}

export interface AuditEntry {
  id: string;
  merchant_id: string;
  action: string;
  actor_id: string;
  actor_type: 'merchant_user' | 'ops_admin' | 'system';
  ip_address?: string;
  user_agent?: string;
  changes: Record<string, any>;
  previous_values?: Record<string, any>;
  new_values?: Record<string, any>;
  hash: string;
  prev_hash?: string;
  created_at: Date;
}

// Update request types
export interface UpdateSettingsRequest {
  default_currency?: string;
  default_language?: string;
  supported_currencies?: string[];
  supported_languages?: string[];
  timezone?: string;
  active_payment_methods?: string[];
  payment_method_priority?: string[];
  checkout_config?: Record<string, any>;
  features?: Record<string, any>;
}

export interface UpdateBrandingRequest {
  business_name?: string;
  logo_url?: string;
  logo_square_url?: string;
  favicon_url?: string;
  cover_image_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  background_color?: string;
  text_color?: string;
  font_family?: string;
  font_url?: string;
  button_style?: 'square' | 'rounded' | 'pill';
  button_border_radius?: number;
  checkout_theme?: 'light' | 'dark' | 'auto';
  checkout_layout?: 'embedded' | 'redirect' | 'popup';
  custom_css?: string;
  support_email?: string;
  support_phone?: string;
  website_url?: string;
  social_links?: Record<string, string>;
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

/**
 * Get complete merchant settings with all related configurations
 */
export async function getMerchantSettings(merchantId: string): Promise<{
  settings: MerchantSettings;
  branding?: MerchantBranding;
  payment_methods: PaymentMethodConfig[];
  sales_zones?: SalesZone;
  refund_policy?: RefundPolicy;
  subscription_config?: SubscriptionConfig;
  active_commission_rate: number;
}> {
  const client = await pool.connect();
  try {
    // Get base settings
    const settingsResult = await client.query<MerchantSettings>(
      `SELECT * FROM merchant_settings WHERE merchant_id = $1`,
      [merchantId]
    );

    if (settingsResult.rows.length === 0) {
      throw new Error(`Merchant settings not found for merchant ${merchantId}`);
    }

    const settings = settingsResult.rows[0];

    // Get branding if configured
    let branding: MerchantBranding | undefined;
    if (settings.branding_id) {
      const brandingResult = await client.query<MerchantBranding>(
        `SELECT * FROM merchant_branding WHERE id = $1`,
        [settings.branding_id]
      );
      branding = brandingResult.rows[0];
    }

    // Get payment methods
    const paymentMethodsResult = await client.query<PaymentMethodConfig>(
      `SELECT * FROM merchant_payment_methods
       WHERE merchant_id = $1
       ORDER BY display_order ASC`,
      [merchantId]
    );

    // Get sales zones
    let salesZones: SalesZone | undefined;
    if (settings.sales_zones_id) {
      const salesZonesResult = await client.query<SalesZone>(
        `SELECT * FROM merchant_sales_zones WHERE id = $1`,
        [settings.sales_zones_id]
      );
      salesZones = salesZonesResult.rows[0];
    }

    // Get refund policy
    let refundPolicy: RefundPolicy | undefined;
    if (settings.refund_policy_id) {
      const refundPolicyResult = await client.query<RefundPolicy>(
        `SELECT * FROM merchant_refund_policies WHERE id = $1`,
        [settings.refund_policy_id]
      );
      refundPolicy = refundPolicyResult.rows[0];
    }

    // Get subscription config
    let subscriptionConfig: SubscriptionConfig | undefined;
    if (settings.subscription_config_id) {
      const subscriptionConfigResult = await client.query<SubscriptionConfig>(
        `SELECT * FROM merchant_subscription_config WHERE id = $1`,
        [settings.subscription_config_id]
      );
      subscriptionConfig = subscriptionConfigResult.rows[0];
    }

    // Get active commission rate using SQL function
    const commissionResult = await client.query<{ get_merchant_commission_rate: number }>(
      `SELECT get_merchant_commission_rate($1) as rate`,
      [merchantId]
    );
    const activeCommissionRate = commissionResult.rows[0].rate;

    return {
      settings,
      branding,
      payment_methods: paymentMethodsResult.rows,
      sales_zones: salesZones,
      refund_policy: refundPolicy,
      subscription_config: subscriptionConfig,
      active_commission_rate: activeCommissionRate,
    };
  } finally {
    client.release();
  }
}

/**
 * Update merchant settings with automatic versioning
 */
export async function updateMerchantSettings(
  merchantId: string,
  updates: UpdateSettingsRequest,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<MerchantSettings> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current settings for audit
    const currentResult = await client.query<MerchantSettings>(
      `SELECT * FROM merchant_settings WHERE merchant_id = $1 FOR UPDATE`,
      [merchantId]
    );

    if (currentResult.rows.length === 0) {
      throw new Error(`Merchant settings not found for merchant ${merchantId}`);
    }

    const currentSettings = currentResult.rows[0];

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    const updatableFields: (keyof UpdateSettingsRequest)[] = [
      'default_currency',
      'default_language',
      'supported_currencies',
      'supported_languages',
      'timezone',
      'active_payment_methods',
      'payment_method_priority',
      'checkout_config',
      'features',
    ];

    for (const field of updatableFields) {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = $${paramIndex}`);
        updateValues.push(updates[field]);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      return currentSettings;
    }

    // Add metadata fields
    updateFields.push(`last_modified_by = $${paramIndex}`);
    updateValues.push(userId);
    paramIndex++;

    updateFields.push(`updated_at = now()`);

    // Execute update (trigger will handle versioning)
    const updateQuery = `
      UPDATE merchant_settings
      SET ${updateFields.join(', ')}
      WHERE merchant_id = $${paramIndex}
      RETURNING *
    `;
    updateValues.push(merchantId);

    const updatedResult = await client.query<MerchantSettings>(updateQuery, updateValues);
    const updatedSettings = updatedResult.rows[0];

    // Create audit entry
    await createAuditEntry(client, {
      merchant_id: merchantId,
      action: 'settings_updated',
      actor_id: userId,
      actor_type: 'merchant_user',
      ip_address: ipAddress,
      user_agent: userAgent,
      changes: { updated_fields: Object.keys(updates) },
      previous_values: currentSettings,
      new_values: updatedSettings,
    });

    await client.query('COMMIT');
    return updatedSettings;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get settings version history
 */
export async function getMerchantSettingsHistory(
  merchantId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ history: SettingsHistory[]; total: number }> {
  const client = await pool.connect();
  try {
    const historyResult = await client.query<SettingsHistory>(
      `SELECT * FROM merchant_settings_history
       WHERE merchant_id = $1
       ORDER BY version DESC
       LIMIT $2 OFFSET $3`,
      [merchantId, limit, offset]
    );

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM merchant_settings_history WHERE merchant_id = $1`,
      [merchantId]
    );

    return {
      history: historyResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  } finally {
    client.release();
  }
}

/**
 * Rollback settings to a previous version
 */
export async function rollbackMerchantSettings(
  merchantId: string,
  targetVersion: number,
  userId: string,
  ipAddress?: string
): Promise<MerchantSettings> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get target version snapshot
    const snapshotResult = await client.query<SettingsHistory>(
      `SELECT * FROM merchant_settings_history
       WHERE merchant_id = $1 AND version = $2`,
      [merchantId, targetVersion]
    );

    if (snapshotResult.rows.length === 0) {
      throw new Error(`Version ${targetVersion} not found for merchant ${merchantId}`);
    }

    const snapshot = snapshotResult.rows[0].settings_snapshot as any;

    // Apply snapshot (will create new version via trigger)
    const updateQuery = `
      UPDATE merchant_settings
      SET
        default_currency = $1,
        default_language = $2,
        supported_currencies = $3,
        supported_languages = $4,
        timezone = $5,
        active_payment_methods = $6,
        payment_method_priority = $7,
        checkout_config = $8,
        features = $9,
        last_modified_by = $10,
        updated_at = now()
      WHERE merchant_id = $11
      RETURNING *
    `;

    const updatedResult = await client.query<MerchantSettings>(updateQuery, [
      snapshot.default_currency,
      snapshot.default_language,
      snapshot.supported_currencies,
      snapshot.supported_languages,
      snapshot.timezone,
      snapshot.active_payment_methods,
      snapshot.payment_method_priority,
      snapshot.checkout_config,
      snapshot.features,
      userId,
      merchantId,
    ]);

    // Audit entry
    await createAuditEntry(client, {
      merchant_id: merchantId,
      action: 'settings_rollback',
      actor_id: userId,
      actor_type: 'merchant_user',
      ip_address: ipAddress,
      changes: { rolled_back_to_version: targetVersion },
      previous_values: {},
      new_values: updatedResult.rows[0],
    });

    await client.query('COMMIT');
    return updatedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// BRANDING MANAGEMENT
// ============================================================================

/**
 * Validate color hex codes
 */
function validateHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * Update merchant branding
 */
export async function updateMerchantBranding(
  merchantId: string,
  updates: UpdateBrandingRequest,
  userId: string,
  ipAddress?: string
): Promise<MerchantBranding> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validate colors if provided
    const colorFields = ['primary_color', 'secondary_color', 'accent_color', 'background_color', 'text_color'];
    for (const field of colorFields) {
      if (updates[field as keyof UpdateBrandingRequest] && !validateHexColor(updates[field as keyof UpdateBrandingRequest] as string)) {
        throw new Error(`Invalid hex color for ${field}: ${updates[field as keyof UpdateBrandingRequest]}`);
      }
    }

    // Check if branding exists
    const existingResult = await client.query(
      `SELECT id FROM merchant_branding WHERE merchant_id = $1`,
      [merchantId]
    );

    let branding: MerchantBranding;

    if (existingResult.rows.length === 0) {
      // Create new branding
      const insertQuery = `
        INSERT INTO merchant_branding (
          merchant_id, business_name, primary_color, secondary_color, accent_color,
          background_color, text_color, font_family, button_style, checkout_theme, checkout_layout
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;
      const result = await client.query<MerchantBranding>(insertQuery, [
        merchantId,
        updates.business_name || 'My Business',
        updates.primary_color || '#0066CC',
        updates.secondary_color || '#333333',
        updates.accent_color || '#FF6B35',
        updates.background_color || '#FFFFFF',
        updates.text_color || '#000000',
        updates.font_family || 'Inter',
        updates.button_style || 'rounded',
        updates.checkout_theme || 'light',
        updates.checkout_layout || 'embedded',
      ]);
      branding = result.rows[0];

      // Link to settings
      await client.query(
        `UPDATE merchant_settings SET branding_id = $1 WHERE merchant_id = $2`,
        [branding.id, merchantId]
      );
    } else {
      // Update existing branding
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          updateFields.push(`${key} = $${paramIndex}`);
          updateValues.push(value);
          paramIndex++;
        }
      }

      if (updateFields.length > 0) {
        updateFields.push(`updated_at = now()`);

        const updateQuery = `
          UPDATE merchant_branding
          SET ${updateFields.join(', ')}
          WHERE merchant_id = $${paramIndex}
          RETURNING *
        `;
        updateValues.push(merchantId);

        const result = await client.query<MerchantBranding>(updateQuery, updateValues);
        branding = result.rows[0];
      } else {
        branding = existingResult.rows[0];
      }
    }

    // Audit entry
    await createAuditEntry(client, {
      merchant_id: merchantId,
      action: 'branding_updated',
      actor_id: userId,
      actor_type: 'merchant_user',
      ip_address: ipAddress,
      changes: updates,
      new_values: branding,
    });

    await client.query('COMMIT');
    return branding;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Generate branding preview CSS
 */
export function generateBrandingCSS(branding: MerchantBranding): string {
  return `
:root {
  --primary-color: ${branding.primary_color};
  --secondary-color: ${branding.secondary_color};
  --accent-color: ${branding.accent_color};
  --background-color: ${branding.background_color};
  --text-color: ${branding.text_color};
  --font-family: ${branding.font_family}, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --button-border-radius: ${branding.button_border_radius || (branding.button_style === 'pill' ? '9999px' : branding.button_style === 'rounded' ? '8px' : '0px')};
}

body {
  font-family: var(--font-family);
  background-color: var(--background-color);
  color: var(--text-color);
}

.btn-primary {
  background-color: var(--primary-color);
  border-radius: var(--button-border-radius);
  color: white;
}

.btn-secondary {
  background-color: var(--secondary-color);
  border-radius: var(--button-border-radius);
  color: white;
}

${branding.custom_css || ''}
  `.trim();
}

// ============================================================================
// PAYMENT METHODS MANAGEMENT
// ============================================================================

/**
 * Get payment methods for merchant
 */
export async function getPaymentMethods(merchantId: string): Promise<PaymentMethodConfig[]> {
  const result = await pool.query<PaymentMethodConfig>(
    `SELECT * FROM merchant_payment_methods
     WHERE merchant_id = $1
     ORDER BY display_order ASC`,
    [merchantId]
  );
  return result.rows;
}

/**
 * Update payment method configuration
 */
export async function updatePaymentMethod(
  merchantId: string,
  methodType: string,
  provider: string | null,
  updates: Partial<PaymentMethodConfig>,
  userId: string,
  ipAddress?: string
): Promise<PaymentMethodConfig> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if method exists
    const existingResult = await client.query(
      `SELECT id FROM merchant_payment_methods
       WHERE merchant_id = $1 AND method_type = $2 AND ($3::text IS NULL OR provider = $3)`,
      [merchantId, methodType, provider]
    );

    let paymentMethod: PaymentMethodConfig;

    if (existingResult.rows.length === 0) {
      // Create new method
      const insertQuery = `
        INSERT INTO merchant_payment_methods (
          merchant_id, method_type, provider, is_enabled, display_order, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const result = await client.query<PaymentMethodConfig>(insertQuery, [
        merchantId,
        methodType,
        provider,
        updates.is_enabled !== undefined ? updates.is_enabled : true,
        updates.display_order || 0,
        updates.metadata || {},
      ]);
      paymentMethod = result.rows[0];
    } else {
      // Update existing method
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      const updatableFields: (keyof PaymentMethodConfig)[] = [
        'is_enabled',
        'display_name',
        'display_order',
        'min_amount',
        'max_amount',
        'daily_limit',
        'monthly_limit',
        'fee_type',
        'fee_percentage',
        'fee_fixed',
        'supported_currencies',
        'allowed_countries',
        'metadata',
      ];

      for (const field of updatableFields) {
        if (updates[field] !== undefined) {
          updateFields.push(`${field} = $${paramIndex}`);
          updateValues.push(updates[field]);
          paramIndex++;
        }
      }

      if (updateFields.length > 0) {
        updateFields.push(`updated_at = now()`);

        const updateQuery = `
          UPDATE merchant_payment_methods
          SET ${updateFields.join(', ')}
          WHERE merchant_id = $${paramIndex}
            AND method_type = $${paramIndex + 1}
            AND ($${paramIndex + 2}::text IS NULL OR provider = $${paramIndex + 2})
          RETURNING *
        `;
        updateValues.push(merchantId, methodType, provider);

        const result = await client.query<PaymentMethodConfig>(updateQuery, updateValues);
        paymentMethod = result.rows[0];
      } else {
        paymentMethod = existingResult.rows[0];
      }
    }

    // Audit entry
    await createAuditEntry(client, {
      merchant_id: merchantId,
      action: 'payment_method_updated',
      actor_id: userId,
      actor_type: 'merchant_user',
      ip_address: ipAddress,
      changes: { method_type: methodType, provider, ...updates },
      new_values: paymentMethod,
    });

    await client.query('COMMIT');
    return paymentMethod;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Toggle payment method on/off
 */
export async function togglePaymentMethod(
  merchantId: string,
  methodType: string,
  provider: string | null,
  enabled: boolean,
  userId: string,
  ipAddress?: string
): Promise<PaymentMethodConfig> {
  return updatePaymentMethod(merchantId, methodType, provider, { is_enabled: enabled }, userId, ipAddress);
}

// ============================================================================
// COMMISSION OVERRIDE MANAGEMENT
// ============================================================================

/**
 * Request commission override
 */
export async function requestCommissionOverride(
  merchantId: string,
  commissionRate: number,
  reason: string,
  justification: string,
  requestedBy: string,
  effectiveFrom?: Date,
  effectiveUntil?: Date,
  conditions?: Record<string, any>,
  ipAddress?: string
): Promise<CommissionOverride> {
  if (commissionRate < 0 || commissionRate > 100) {
    throw new Error('Commission rate must be between 0 and 100');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertQuery = `
      INSERT INTO merchant_commission_overrides (
        merchant_id, commission_rate, reason, justification, requested_by,
        effective_from, effective_until, status, conditions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await client.query<CommissionOverride>(insertQuery, [
      merchantId,
      commissionRate,
      reason,
      justification,
      requestedBy,
      effectiveFrom || new Date(),
      effectiveUntil,
      'pending',
      conditions || {},
    ]);

    const override = result.rows[0];

    // Audit entry
    await createAuditEntry(client, {
      merchant_id: merchantId,
      action: 'commission_override_requested',
      actor_id: requestedBy,
      actor_type: 'merchant_user',
      ip_address: ipAddress,
      changes: {
        override_id: override.id,
        commission_rate: commissionRate,
        reason,
      },
      new_values: override,
    });

    await client.query('COMMIT');
    return override;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Approve commission override (Ops only)
 */
export async function approveCommissionOverride(
  overrideId: string,
  approvedBy: string,
  ipAddress?: string
): Promise<CommissionOverride> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateQuery = `
      UPDATE merchant_commission_overrides
      SET
        status = 'approved',
        approved_by = $1,
        approved_at = now()
      WHERE id = $2 AND status = 'pending'
      RETURNING *
    `;

    const result = await client.query<CommissionOverride>(updateQuery, [approvedBy, overrideId]);

    if (result.rows.length === 0) {
      throw new Error(`Override ${overrideId} not found or not in pending status`);
    }

    const override = result.rows[0];

    // Audit entry
    await createAuditEntry(client, {
      merchant_id: override.merchant_id,
      action: 'commission_override_approved',
      actor_id: approvedBy,
      actor_type: 'ops_admin',
      ip_address: ipAddress,
      changes: { override_id: overrideId },
      new_values: override,
    });

    await client.query('COMMIT');
    return override;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reject commission override
 */
export async function rejectCommissionOverride(
  overrideId: string,
  rejectedBy: string,
  rejectionReason: string,
  ipAddress?: string
): Promise<CommissionOverride> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateQuery = `
      UPDATE merchant_commission_overrides
      SET
        status = 'rejected',
        rejected_by = $1,
        rejected_at = now(),
        rejection_reason = $2
      WHERE id = $3 AND status = 'pending'
      RETURNING *
    `;

    const result = await client.query<CommissionOverride>(updateQuery, [
      rejectedBy,
      rejectionReason,
      overrideId,
    ]);

    if (result.rows.length === 0) {
      throw new Error(`Override ${overrideId} not found or not in pending status`);
    }

    const override = result.rows[0];

    // Audit entry
    await createAuditEntry(client, {
      merchant_id: override.merchant_id,
      action: 'commission_override_rejected',
      actor_id: rejectedBy,
      actor_type: 'ops_admin',
      ip_address: ipAddress,
      changes: { override_id: overrideId, rejection_reason: rejectionReason },
      new_values: override,
    });

    await client.query('COMMIT');
    return override;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get active commission rate for merchant
 */
export async function getActiveCommissionRate(merchantId: string): Promise<number> {
  const result = await pool.query<{ rate: number }>(
    `SELECT get_merchant_commission_rate($1) as rate`,
    [merchantId]
  );
  return result.rows[0].rate;
}

/**
 * Get commission override history
 */
export async function getCommissionOverrideHistory(
  merchantId: string,
  limit: number = 20
): Promise<CommissionOverride[]> {
  const result = await pool.query<CommissionOverride>(
    `SELECT * FROM merchant_commission_overrides
     WHERE merchant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [merchantId, limit]
  );
  return result.rows;
}

// ============================================================================
// AUDIT TRAIL
// ============================================================================

/**
 * Create audit entry with hash chain
 */
async function createAuditEntry(
  client: PoolClient,
  params: {
    merchant_id: string;
    action: string;
    actor_id: string;
    actor_type: 'merchant_user' | 'ops_admin' | 'system';
    ip_address?: string;
    user_agent?: string;
    changes: Record<string, any>;
    previous_values?: Record<string, any>;
    new_values?: Record<string, any>;
  }
): Promise<AuditEntry> {
  // Get previous hash for chain
  const prevHashResult = await client.query<{ hash: string }>(
    `SELECT hash FROM merchant_settings_audit
     WHERE merchant_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [params.merchant_id]
  );

  const prevHash = prevHashResult.rows.length > 0 ? prevHashResult.rows[0].hash : null;

  // Create hash for this entry
  const hashInput = JSON.stringify({
    merchant_id: params.merchant_id,
    action: params.action,
    actor_id: params.actor_id,
    changes: params.changes,
    prev_hash: prevHash,
    timestamp: new Date().toISOString(),
  });

  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

  // Insert audit entry
  const insertQuery = `
    INSERT INTO merchant_settings_audit (
      merchant_id, action, actor_id, actor_type, ip_address, user_agent,
      changes, previous_values, new_values, hash, prev_hash
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;

  const result = await client.query<AuditEntry>(insertQuery, [
    params.merchant_id,
    params.action,
    params.actor_id,
    params.actor_type,
    params.ip_address,
    params.user_agent,
    JSON.stringify(params.changes),
    params.previous_values ? JSON.stringify(params.previous_values) : null,
    params.new_values ? JSON.stringify(params.new_values) : null,
    hash,
    prevHash,
  ]);

  return result.rows[0];
}

/**
 * Get audit log with filters
 */
export async function getAuditLog(
  merchantId: string,
  filters?: {
    action?: string;
    actor_id?: string;
    from_date?: Date;
    to_date?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<{ entries: AuditEntry[]; total: number }> {
  const client = await pool.connect();
  try {
    const conditions: string[] = ['merchant_id = $1'];
    const values: any[] = [merchantId];
    let paramIndex = 2;

    if (filters?.action) {
      conditions.push(`action = $${paramIndex}`);
      values.push(filters.action);
      paramIndex++;
    }

    if (filters?.actor_id) {
      conditions.push(`actor_id = $${paramIndex}`);
      values.push(filters.actor_id);
      paramIndex++;
    }

    if (filters?.from_date) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(filters.from_date);
      paramIndex++;
    }

    if (filters?.to_date) {
      conditions.push(`created_at <= $${paramIndex}`);
      values.push(filters.to_date);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get entries
    const entriesQuery = `
      SELECT * FROM merchant_settings_audit
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(filters?.limit || 50, filters?.offset || 0);

    const entriesResult = await client.query<AuditEntry>(entriesQuery, values);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as count FROM merchant_settings_audit WHERE ${whereClause}
    `;
    const countResult = await client.query<{ count: string }>(
      countQuery,
      values.slice(0, paramIndex - 1)
    );

    return {
      entries: entriesResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  } finally {
    client.release();
  }
}

/**
 * Verify audit trail integrity using hash chain
 */
export async function verifyAuditIntegrity(merchantId: string): Promise<{
  valid: boolean;
  total_entries: number;
  first_invalid_entry?: string;
  error?: string;
}> {
  const client = await pool.connect();
  try {
    const result = await client.query<AuditEntry>(
      `SELECT * FROM merchant_settings_audit
       WHERE merchant_id = $1
       ORDER BY created_at ASC`,
      [merchantId]
    );

    const entries = result.rows;

    if (entries.length === 0) {
      return { valid: true, total_entries: 0 };
    }

    let prevHash: string | null = null;

    for (const entry of entries) {
      // Verify prev_hash matches
      if (entry.prev_hash !== prevHash) {
        return {
          valid: false,
          total_entries: entries.length,
          first_invalid_entry: entry.id,
          error: `Hash chain broken at entry ${entry.id}`,
        };
      }

      // Recalculate hash
      const hashInput = JSON.stringify({
        merchant_id: entry.merchant_id,
        action: entry.action,
        actor_id: entry.actor_id,
        changes: entry.changes,
        prev_hash: entry.prev_hash,
        timestamp: entry.created_at.toISOString(),
      });

      const calculatedHash = crypto.createHash('sha256').update(hashInput).digest('hex');

      if (calculatedHash !== entry.hash) {
        return {
          valid: false,
          total_entries: entries.length,
          first_invalid_entry: entry.id,
          error: `Hash mismatch at entry ${entry.id}`,
        };
      }

      prevHash = entry.hash;
    }

    return { valid: true, total_entries: entries.length };
  } finally {
    client.release();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Settings
  getMerchantSettings,
  updateMerchantSettings,
  getMerchantSettingsHistory,
  rollbackMerchantSettings,

  // Branding
  updateMerchantBranding,
  generateBrandingCSS,

  // Payment Methods
  getPaymentMethods,
  updatePaymentMethod,
  togglePaymentMethod,

  // Commission
  requestCommissionOverride,
  approveCommissionOverride,
  rejectCommissionOverride,
  getActiveCommissionRate,
  getCommissionOverrideHistory,

  // Audit
  getAuditLog,
  verifyAuditIntegrity,
};
