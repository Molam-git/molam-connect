import { pool } from '../utils/db';
import Decimal from 'decimal.js';
import { roundForCurrency } from '../utils/rounding';
import { resolveJurisdiction, evaluateExemptions, getActiveTaxRules } from './utils';

export type ComputeInput = {
  connectTxId: string;
  amount: number;
  currency: string;
  merchantId?: string;
  buyerCountry?: string;
  eventType: string;
  productCode?: string;
  merchantMeta?: any;
};

export type TaxDecision = {
  id: string;
  connect_tx_id: string;
  merchant_id?: string;
  buyer_country?: string;
  jurisdiction_id: string;
  rules_applied: any;
  tax_lines: any[];
  total_tax: number;
  currency: string;
  rounding_info: any;
  computed_at: Date;
};

/**
 * Compute tax for a transaction and persist the decision
 */
export async function computeAndPersistTax(input: ComputeInput): Promise<TaxDecision> {
  const { connectTxId } = input;

  // Check if already computed (idempotency)
  const existing = await pool.query(
    `SELECT * FROM tax_decisions WHERE connect_tx_id = $1`,
    [connectTxId]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return existing.rows[0];
  }

  // Resolve tax jurisdiction
  const jurisdiction = await resolveJurisdiction(input.merchantId, input.buyerCountry);

  if (!jurisdiction) {
    throw new Error('no_tax_jurisdiction');
  }

  // Get active tax rules
  const rules = await getActiveTaxRules(jurisdiction.id, input.eventType);

  // Calculate tax for each applicable rule
  const taxLines: any[] = [];
  const baseAmount = new Decimal(input.amount);
  let totalTax = new Decimal(0);

  for (const rule of rules) {
    // Check exemptions
    if (
      rule.exempt_conditions &&
      evaluateExemptions(rule.exempt_conditions, input.merchantMeta, input.productCode)
    ) {
      continue;
    }

    // Calculate tax amount
    let taxAmount: Decimal;

    if (rule.is_percentage) {
      const rate = new Decimal(rule.rate || 0).dividedBy(100);
      taxAmount = baseAmount.times(rate);
    } else {
      taxAmount = new Decimal(rule.fixed_amount || 0);
    }

    // Round to currency precision
    const rounded = roundForCurrency(taxAmount, input.currency);

    taxLines.push({
      rule_code: rule.code,
      rule_id: rule.id,
      description: rule.description,
      amount: rounded,
      currency: input.currency,
      is_percentage: rule.is_percentage,
      rate: rule.is_percentage ? Number(rule.rate) : null,
      reverse_charge: rule.reverse_charge,
    });

    totalTax = totalTax.plus(rounded);
  }

  // Persist tax decision
  const { rows } = await pool.query<TaxDecision>(
    `INSERT INTO tax_decisions(
      connect_tx_id, merchant_id, buyer_country, jurisdiction_id,
      rules_applied, tax_lines, total_tax, currency, rounding_info
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      connectTxId,
      input.merchantId || null,
      input.buyerCountry || null,
      jurisdiction.id,
      JSON.stringify(
        rules.map((r: any) => ({
          id: r.id,
          code: r.code,
          version: r.rule_version,
        }))
      ),
      JSON.stringify(taxLines),
      totalTax.toNumber(),
      input.currency,
      JSON.stringify({
        precision: input.currency === 'XOF' ? 0 : 2,
        method: 'ROUND_HALF_UP',
      }),
    ]
  );

  // Audit log
  await pool.query(
    `INSERT INTO molam_audit_logs(brique_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'brique-65',
      'tax_computed',
      'tax_decision',
      rows[0].id,
      JSON.stringify({
        connect_tx_id: connectTxId,
        jurisdiction: jurisdiction.code,
        total_tax: totalTax.toNumber(),
        rules_count: rules.length,
      }),
    ]
  );

  return rows[0];
}

/**
 * Get tax decision by transaction ID
 */
export async function getTaxDecision(connectTxId: string): Promise<TaxDecision | null> {
  const { rows } = await pool.query<TaxDecision>(
    `SELECT * FROM tax_decisions WHERE connect_tx_id = $1`,
    [connectTxId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Reverse a tax decision (for refunds/disputes)
 */
export async function reverseTaxDecision(
  originalTxId: string,
  reversalTxId: string
): Promise<TaxDecision> {
  const original = await getTaxDecision(originalTxId);

  if (!original) {
    throw new Error('original_tax_decision_not_found');
  }

  // Create reversal decision with negated amounts
  const reversalLines = original.tax_lines.map((line: any) => ({
    ...line,
    amount: -line.amount,
  }));

  const { rows } = await pool.query<TaxDecision>(
    `INSERT INTO tax_decisions(
      connect_tx_id, merchant_id, buyer_country, jurisdiction_id,
      rules_applied, tax_lines, total_tax, currency, rounding_info
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      reversalTxId,
      original.merchant_id,
      original.buyer_country,
      original.jurisdiction_id,
      original.rules_applied,
      JSON.stringify(reversalLines),
      -original.total_tax,
      original.currency,
      original.rounding_info,
    ]
  );

  return rows[0];
}