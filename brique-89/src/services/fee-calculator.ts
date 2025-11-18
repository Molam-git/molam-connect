// Fee Calculation Service
// Calculates Molam fees and bank fees for payouts

import { pool } from '../utils/db';

export interface FeeCalculationInput {
  origin_module: string;
  currency: string;
  amount: number;
  priority: 'normal' | 'priority' | 'instant';
  bank_profile_id?: string;
}

export interface FeeCalculationResult {
  molam_fee: number;
  estimated_bank_fee: number;
  total_fee: number;
  total_debited: number;
  net_to_beneficiary: number;
  fee_rule_used?: string;
}

/**
 * Calculate Molam fee using database fee rules
 */
export async function calculateMolamFee(input: FeeCalculationInput): Promise<number> {
  const { rows } = await pool.query(
    `SELECT calculate_payout_fee($1, $2, $3, $4, $5) as fee`,
    [
      input.origin_module,
      input.currency,
      input.amount,
      input.priority,
      input.bank_profile_id || null,
    ]
  );

  return parseFloat(rows[0].fee || '0');
}

/**
 * Estimate bank fee based on bank profile and routing method
 */
export async function estimateBankFee(input: {
  bank_profile_id?: string;
  currency: string;
  amount: number;
  routing_method?: string;
}): Promise<number> {
  // In production, this would query bank_profiles or routing_rules table
  // For now, return simple estimates based on routing method

  if (!input.bank_profile_id) {
    return 0;
  }

  // Placeholder logic - should be replaced with actual bank profile fees
  const { routing_method, currency } = input;

  if (routing_method === 'instant') {
    return currency === 'USD' ? 5.0 : currency === 'EUR' ? 4.5 : 2000; // XOF
  }

  if (routing_method === 'sepa') {
    return 0.5;
  }

  if (routing_method === 'swift') {
    return 25.0;
  }

  // Default batch fee
  return currency === 'USD' ? 1.0 : currency === 'EUR' ? 0.9 : 500; // XOF
}

/**
 * Calculate complete fee breakdown for a payout
 */
export async function calculatePayoutFees(
  input: FeeCalculationInput & { routing_method?: string }
): Promise<FeeCalculationResult> {
  const molam_fee = await calculateMolamFee(input);

  const estimated_bank_fee = await estimateBankFee({
    bank_profile_id: input.bank_profile_id,
    currency: input.currency,
    amount: input.amount,
    routing_method: input.routing_method,
  });

  const total_fee = molam_fee + estimated_bank_fee;
  const total_debited = input.amount + total_fee;
  const net_to_beneficiary = input.amount; // By default, fees deducted from sender

  return {
    molam_fee,
    estimated_bank_fee,
    total_fee,
    total_debited,
    net_to_beneficiary,
  };
}

/**
 * Get applicable fee rule for given parameters
 */
export async function getApplicableFeeRule(input: FeeCalculationInput): Promise<any | null> {
  const { rows } = await pool.query(
    `SELECT *
     FROM payout_fee_rules
     WHERE active = TRUE
       AND (origin_module IS NULL OR origin_module = $1)
       AND (currency IS NULL OR currency = $2)
       AND (min_amount IS NULL OR $3 >= min_amount)
       AND (max_amount IS NULL OR $3 <= max_amount)
       AND (bank_profile_id IS NULL OR bank_profile_id = $4)
       AND (payout_priority IS NULL OR payout_priority = $5)
     ORDER BY priority DESC
     LIMIT 1`,
    [
      input.origin_module,
      input.currency,
      input.amount,
      input.bank_profile_id || null,
      input.priority,
    ]
  );

  return rows[0] || null;
}

/**
 * Validate if payout amount is within acceptable limits
 */
export async function validatePayoutAmount(
  currency: string,
  amount: number
): Promise<{ valid: boolean; error?: string }> {
  // Minimum amounts by currency
  const minimums: Record<string, number> = {
    USD: 1.0,
    EUR: 1.0,
    GBP: 1.0,
    XOF: 100,
    GHS: 10,
  };

  // Maximum amounts by currency (anti-money laundering limits)
  const maximums: Record<string, number> = {
    USD: 1000000,
    EUR: 900000,
    GBP: 800000,
    XOF: 500000000,
    GHS: 4000000,
  };

  const min = minimums[currency] || 1;
  const max = maximums[currency] || 1000000;

  if (amount < min) {
    return {
      valid: false,
      error: `Amount below minimum ${min} ${currency}`,
    };
  }

  if (amount > max) {
    return {
      valid: false,
      error: `Amount exceeds maximum ${max} ${currency}`,
    };
  }

  return { valid: true };
}

/**
 * Calculate net-to-beneficiary for gross payout
 * (when fees are deducted from payout amount)
 */
export async function calculateNetToBeneficiary(
  gross_amount: number,
  fees: FeeCalculationResult
): Promise<number> {
  return gross_amount - fees.total_fee;
}

/**
 * Bulk fee calculation for batch processing
 */
export async function calculateBatchFees(
  payouts: Array<{
    id: string;
    amount: number;
    currency: string;
    origin_module: string;
    priority: string;
    bank_profile_id?: string;
  }>
): Promise<Map<string, FeeCalculationResult>> {
  const results = new Map<string, FeeCalculationResult>();

  for (const payout of payouts) {
    const fees = await calculatePayoutFees({
      origin_module: payout.origin_module,
      currency: payout.currency,
      amount: payout.amount,
      priority: payout.priority as any,
      bank_profile_id: payout.bank_profile_id,
    });

    results.set(payout.id, fees);
  }

  return results;
}

/**
 * Check if instant payout is available for currency/amount
 */
export async function canProcessInstant(currency: string, amount: number): Promise<boolean> {
  // Check instant payout limits
  const instantLimits: Record<string, { min: number; max: number }> = {
    USD: { min: 1, max: 50000 },
    EUR: { min: 1, max: 45000 },
    GBP: { min: 1, max: 40000 },
    XOF: { min: 100, max: 25000000 },
  };

  const limits = instantLimits[currency];
  if (!limits) {
    return false;
  }

  return amount >= limits.min && amount <= limits.max;
}
