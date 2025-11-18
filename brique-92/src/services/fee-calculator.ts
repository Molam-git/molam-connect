// Fee Calculator Service
// Computes Molam fees and estimates bank fees

interface FeeCalculationInput {
  origin_module: string;
  amount: number;
  currency: string;
  bank_profile_id?: string;
}

interface FeeCalculationResult {
  molam_fee: number;
  estimated_bank_fee: number;
  total_fees: number;
  total_deducted: number;
}

// Fee rules by origin module
const MOLAM_FEE_RULES: Record<string, { percentage: number; min_fee: number; max_fee?: number }> = {
  'connect': { percentage: 0.015, min_fee: 0.10 }, // 1.5% for merchant payouts
  'wallet': { percentage: 0.009, min_fee: 0.05 }, // 0.9% for P2P
  'agents': { percentage: 0.012, min_fee: 0.08 }, // 1.2% for agent payouts
  'treasury': { percentage: 0.005, min_fee: 0.10 } // 0.5% for treasury ops
};

// Estimated bank fees by currency (flat fee)
const BANK_FEE_ESTIMATES: Record<string, number> = {
  'XOF': 100, // 100 XOF
  'USD': 0.25, // $0.25
  'EUR': 0.20, // €0.20
  'GBP': 0.20 // £0.20
};

/**
 * Calculate Molam fee based on origin module and amount
 */
export function calculateMolamFee(input: FeeCalculationInput): number {
  const rule = MOLAM_FEE_RULES[input.origin_module];

  if (!rule) {
    // Default rule: 1% with min $0.10
    return Math.max(0.10, Math.round(input.amount * 0.01 * 100) / 100);
  }

  // Calculate percentage-based fee
  let fee = Math.round(input.amount * rule.percentage * 100) / 100;

  // Apply minimum
  fee = Math.max(rule.min_fee, fee);

  // Apply maximum if specified
  if (rule.max_fee && fee > rule.max_fee) {
    fee = rule.max_fee;
  }

  return fee;
}

/**
 * Estimate bank fee based on currency and bank profile
 */
export function estimateBankFee(input: FeeCalculationInput): number {
  // In production, this would query bank_profiles table or call SIRA
  const flatFee = BANK_FEE_ESTIMATES[input.currency] || 0;

  return flatFee;
}

/**
 * Calculate all fees for a payout
 */
export function calculatePayoutFees(input: FeeCalculationInput): FeeCalculationResult {
  const molam_fee = calculateMolamFee(input);
  const estimated_bank_fee = estimateBankFee(input);
  const total_fees = molam_fee + estimated_bank_fee;
  const total_deducted = input.amount + total_fees;

  return {
    molam_fee,
    estimated_bank_fee,
    total_fees,
    total_deducted
  };
}

export default {
  calculateMolamFee,
  estimateBankFee,
  calculatePayoutFees
};
