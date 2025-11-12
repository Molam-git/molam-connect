/**
 * Brique 50 - Fiscal Reporting
 * Molam ID Helpers for extracting locale/currency/country
 */

import { pool } from "./db.js";

interface LocaleInfo {
  country: string;
  locale: string;
  currency: string;
}

/**
 * Compute locale, currency, and country from legal entity
 * In production: integrate with Molam ID or merchants table
 */
export async function computeLocaleCurrencyFromMolamId(legalEntity: string): Promise<LocaleInfo> {
  // Try to fetch from merchants table
  try {
    const { rows } = await pool.query(
      `SELECT billing_country, billing_currency, locale FROM merchants WHERE legal_entity = $1 LIMIT 1`,
      [legalEntity]
    );

    if (rows.length > 0) {
      return {
        country: rows[0].billing_country || "US",
        locale: rows[0].locale || "en",
        currency: rows[0].billing_currency || "USD",
      };
    }
  } catch (err) {
    // Table might not exist, use defaults
  }

  // Default mapping based on legal entity name patterns
  const defaults: Record<string, LocaleInfo> = {
    FR: { country: "FR", locale: "fr", currency: "EUR" },
    SN: { country: "SN", locale: "fr", currency: "XOF" },
    US: { country: "US", locale: "en", currency: "USD" },
    GB: { country: "GB", locale: "en", currency: "GBP" },
    DE: { country: "DE", locale: "de", currency: "EUR" },
    ES: { country: "ES", locale: "es", currency: "EUR" },
  };

  // Match legal entity against country codes
  for (const [code, info] of Object.entries(defaults)) {
    if (legalEntity.includes(code)) {
      return info;
    }
  }

  // Default fallback
  return { country: "US", locale: "en", currency: "USD" };
}
