// =====================================================================
// Merchant Service
// =====================================================================
// Fetch merchant/tenant information
// Date: 2025-11-12
// =====================================================================

import { pool } from '../db';

// =====================================================================
// Types
// =====================================================================

export interface Merchant {
  id: string;
  legal_name: string;
  email: string;
  phone?: string;
  locale?: string;
  currency?: string;
  timezone?: string;
  notification_preferences?: {
    email: boolean;
    sms: boolean;
    push: boolean;
    webhook: boolean;
  };
  webhook_url?: string;
}

// =====================================================================
// Merchant Service
// =====================================================================

/**
 * Get merchant by ID
 */
export async function getMerchant(tenantId: string): Promise<Merchant> {
  const { rows } = await pool.query(
    `
    SELECT
      id::text,
      legal_name,
      email,
      phone,
      locale,
      currency,
      timezone,
      notification_preferences,
      webhook_url
    FROM tenants
    WHERE id = $1
    `,
    [tenantId]
  );

  if (rows.length === 0) {
    throw new Error(`Merchant ${tenantId} not found`);
  }

  return rows[0];
}

/**
 * Get merchant notification preferences
 */
export async function getMerchantNotificationPreferences(
  tenantId: string
): Promise<{
  email: boolean;
  sms: boolean;
  push: boolean;
  webhook: boolean;
}> {
  const merchant = await getMerchant(tenantId);

  return (
    merchant.notification_preferences || {
      email: true,
      sms: false,
      push: false,
      webhook: false,
    }
  );
}

/**
 * Get merchant locale and currency
 */
export async function getMerchantLocale(
  tenantId: string
): Promise<{ locale: string; currency: string; timezone: string }> {
  const merchant = await getMerchant(tenantId);

  return {
    locale: merchant.locale || 'en-US',
    currency: merchant.currency || 'USD',
    timezone: merchant.timezone || 'UTC',
  };
}

/**
 * Get merchant admin users
 */
export async function getMerchantAdmins(tenantId: string): Promise<Array<{
  id: string;
  email: string;
  name: string;
}>> {
  const { rows } = await pool.query(
    `
    SELECT
      u.id::text,
      u.email,
      u.name
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    WHERE ur.tenant_id = $1
      AND ur.role IN ('merchant_admin', 'billing_admin')
      AND u.active = true
    `,
    [tenantId]
  );

  return rows;
}
