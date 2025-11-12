import { pool } from '../utils/db';

/**
 * Get merchant's country from database
 */
export async function getMerchantCountry(merchantId: string | undefined): Promise<string | null> {
  if (!merchantId) return null;

  const { rows } = await pool.query(
    `SELECT country FROM merchants WHERE id = $1 LIMIT 1`,
    [merchantId]
  );

  return rows.length ? rows[0].country : null;
}

/**
 * Resolve tax jurisdiction based on merchant and buyer location
 */
export async function resolveJurisdiction(
  merchantId?: string,
  buyerCountry?: string
): Promise<any> {
  // Try merchant country first
  if (merchantId) {
    const mCountry = await getMerchantCountry(merchantId);
    if (mCountry) {
      const { rows } = await pool.query(
        `SELECT * FROM tax_jurisdictions WHERE country_codes @> $1::text[] LIMIT 1`,
        [[mCountry]]
      );
      if (rows.length) return rows[0];
    }
  }

  // Try buyer country
  if (buyerCountry) {
    const { rows } = await pool.query(
      `SELECT * FROM tax_jurisdictions WHERE country_codes @> $1::text[] LIMIT 1`,
      [[buyerCountry]]
    );
    if (rows.length) return rows[0];
  }

  // Fall back to default jurisdiction
  const { rows } = await pool.query(
    `SELECT * FROM tax_jurisdictions WHERE default = true LIMIT 1`
  );

  return rows[0] || null;
}

/**
 * Evaluate if a transaction is exempt from tax
 */
export function evaluateExemptions(
  exemptConditions: any,
  merchantMeta: any,
  productCode?: string
): boolean {
  if (!exemptConditions) return false;

  // Check merchant exemption
  if (exemptConditions.merchant_exempt_if === 'has_tax_id') {
    return !!merchantMeta?.tax_id;
  }

  // Check product exemption
  if (exemptConditions.product_codes?.includes(productCode)) {
    return true;
  }

  // Check merchant category exemption
  if (exemptConditions.merchant_categories?.includes(merchantMeta?.category)) {
    return true;
  }

  // Check amount threshold exemption
  if (exemptConditions.below_threshold && merchantMeta?.amount < exemptConditions.below_threshold) {
    return true;
  }

  return false;
}

/**
 * Get active tax rules for a jurisdiction and event type
 */
export async function getActiveTaxRules(
  jurisdictionId: string,
  eventType: string,
  asOfDate: Date = new Date()
): Promise<any[]> {
  const dateStr = asOfDate.toISOString().slice(0, 10);

  const { rows } = await pool.query(
    `SELECT * FROM tax_rules
     WHERE jurisdiction_id = $1
       AND $2 = ANY(applies_to)
       AND effective_from <= $3
       AND (effective_to IS NULL OR effective_to >= $3)
     ORDER BY rule_version DESC`,
    [jurisdictionId, eventType, dateStr]
  );

  return rows;
}