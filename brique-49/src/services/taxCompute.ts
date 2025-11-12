/**
 * Brique 49 - Taxes & Compliance
 * Tax Computation Service (Core Engine)
 */

import { pool } from "../utils/db.js";
import { getFxRate } from "./fx.js";
import { auditLog } from "../utils/audit.js";

export interface TaxComputeResult {
  processed: number;
  errors: string[];
}

/**
 * Compute taxes for billing charges (idempotent)
 * Batch processing with automatic FX conversion and exemption handling
 */
export async function computeTaxForCharges(
  chargeIds: string[],
  actorUserId: string
): Promise<TaxComputeResult> {
  if (!chargeIds.length) {
    return { processed: 0, errors: [] };
  }

  const errors: string[] = [];
  let processed = 0;

  // Fetch charges
  const { rows: charges } = await pool.query(
    `SELECT id, amount, source_currency, source_module, merchant_id, occurred_at, metadata
     FROM billing_charges
     WHERE id = ANY($1::uuid[])`,
    [chargeIds]
  );

  for (const charge of charges) {
    try {
      // Get merchant info
      const { rows: merchantRows } = await pool.query(
        `SELECT id, billing_country, billing_currency, legal_entity
         FROM merchants
         WHERE id = $1`,
        [charge.merchant_id]
      );

      if (!merchantRows[0]) {
        errors.push(`Merchant not found for charge ${charge.id}`);
        continue;
      }

      const merchant = merchantRows[0];
      const country = merchant.billing_country || "UNKNOWN";
      const billingCurrency = merchant.billing_currency || "USD";
      const legalEntity = merchant.legal_entity || "MOLAM-GLOBAL";

      // Get applicable tax rules
      const occurredDate = new Date(charge.occurred_at).toISOString().slice(0, 10);
      const { rows: rules } = await pool.query(
        `SELECT * FROM tax_rules
         WHERE country = $1
           AND $2 = ANY(applies_to)
           AND effective_from <= $3::date
           AND (effective_to IS NULL OR effective_to >= $3::date)
         ORDER BY priority ASC`,
        [country, charge.source_module, occurredDate]
      );

      // Check exemptions
      const { rows: exemptions } = await pool.query(
        `SELECT tax_code FROM tax_exemptions
         WHERE entity_type = 'merchant'
           AND entity_id = $1
           AND country = $2
           AND (valid_from IS NULL OR valid_from <= $3::date)
           AND (valid_to IS NULL OR valid_to >= $3::date)`,
        [charge.merchant_id, country, occurredDate]
      );

      const exemptedTaxCodes = new Set(exemptions.map((e) => e.tax_code));

      // Process each applicable tax rule
      for (const rule of rules) {
        // Skip if exempted
        if (exemptedTaxCodes.has(rule.tax_code)) {
          continue;
        }

        // Convert to billing currency
        const fx = await getFxRate(charge.source_currency, billingCurrency, new Date(charge.occurred_at));
        const taxableAmount = Math.round(Number(charge.amount) * fx * 100) / 100;

        // Check threshold (if applicable)
        if (rule.threshold_amount && taxableAmount < Number(rule.threshold_amount)) {
          continue;
        }

        // Calculate tax
        const taxAmount = Math.round(taxableAmount * Number(rule.rate_percent) / 100 * 100) / 100;

        // Upsert into tax_lines (idempotent)
        await pool.query(
          `INSERT INTO tax_lines(
            source_table, source_id, legal_entity, country, tax_code,
            tax_rate, taxable_amount, tax_amount, currency, computed_by, computed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
          ON CONFLICT (source_table, source_id, tax_code)
          DO UPDATE SET
            tax_rate = EXCLUDED.tax_rate,
            taxable_amount = EXCLUDED.taxable_amount,
            tax_amount = EXCLUDED.tax_amount,
            computed_by = EXCLUDED.computed_by,
            computed_at = now()`,
          [
            "billing_charges",
            charge.id,
            legalEntity,
            country,
            rule.tax_code,
            rule.rate_percent,
            taxableAmount,
            taxAmount,
            billingCurrency,
            actorUserId,
          ]
        );

        // Handle withholding if applicable
        if (rule.tax_code.includes("WITHHOLDING")) {
          await pool.query(
            `INSERT INTO withholding_records(
              target_entity_type, target_entity_id, legal_entity, country, tax_code,
              base_amount, withheld_amount, currency, status, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)`,
            [
              "merchant",
              charge.merchant_id,
              legalEntity,
              country,
              rule.tax_code,
              taxableAmount,
              taxAmount,
              billingCurrency,
              actorUserId,
            ]
          );
        }
      }

      processed++;
    } catch (err: any) {
      console.error(`Error processing charge ${charge.id}:`, err);
      errors.push(`Charge ${charge.id}: ${err.message}`);
    }
  }

  // Audit log
  await auditLog({
    action: "tax.compute",
    actor_id: actorUserId,
    details: { processed, errors: errors.length, chargeIds },
  });

  return { processed, errors };
}
