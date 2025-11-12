/**
 * Brique 41 - Molam Connect
 * Pricing & fee calculation service
 */

import { pool } from "../db";

export interface FeeStructure {
  card?: { percent: number; fixed: number };
  wallet?: { percent: number; fixed: number };
  bank?: { percent: number; fixed: number };
  mobile_money?: { percent: number; fixed: number };
}

export interface FeeCalculation {
  subtotal: number;
  fee: number;
  total: number;
  currency: string;
  method: string;
}

/**
 * Get fee profile for a Connect account
 * Falls back to default if no custom profile exists
 */
export async function getFeeProfile(connectAccountId: string): Promise<FeeStructure> {
  try {
    // Try to get custom fee profile
    const { rows } = await pool.query(
      `SELECT fees
       FROM connect_fee_profiles
       WHERE connect_account_id = $1 AND active = true
       ORDER BY updated_at DESC
       LIMIT 1`,
      [connectAccountId]
    );

    if (rows.length > 0) {
      return rows[0].fees;
    }

    // Fallback to default fees
    return getDefaultFees();
  } catch (e: any) {
    console.error("[Pricing] Error fetching fee profile:", e.message);
    return getDefaultFees();
  }
}

/**
 * Get default fee structure
 */
export function getDefaultFees(): FeeStructure {
  return {
    card: { percent: 2.25, fixed: 0.23 },
    wallet: { percent: 0.9, fixed: 0 },
    bank: { percent: 0.0, fixed: 0.3 },
    mobile_money: { percent: 1.5, fixed: 0 },
  };
}

/**
 * Calculate fee for a transaction
 */
export function calculateFee(
  amount: number,
  method: keyof FeeStructure,
  feeStructure: FeeStructure,
  currency: string = "USD"
): FeeCalculation {
  const methodFee = feeStructure[method];

  if (!methodFee) {
    throw new Error(`Invalid payment method: ${method}`);
  }

  // Calculate percentage fee
  const percentageFee = (amount * methodFee.percent) / 100;

  // Total fee (percentage + fixed)
  const totalFee = percentageFee + methodFee.fixed;

  // Round to 2 decimals
  const fee = Math.round(totalFee * 100) / 100;
  const total = Math.round((amount + fee) * 100) / 100;

  return {
    subtotal: amount,
    fee,
    total,
    currency,
    method,
  };
}

/**
 * Calculate net amount (after fees) for merchant
 */
export function calculateNetAmount(
  amount: number,
  method: keyof FeeStructure,
  feeStructure: FeeStructure
): number {
  const methodFee = feeStructure[method];

  if (!methodFee) {
    throw new Error(`Invalid payment method: ${method}`);
  }

  // Merchant receives: amount - (amount * percent / 100 + fixed)
  const percentageFee = (amount * methodFee.percent) / 100;
  const totalFee = percentageFee + methodFee.fixed;
  const netAmount = amount - totalFee;

  return Math.round(netAmount * 100) / 100;
}

/**
 * Set custom fee profile for account
 */
export async function setFeeProfile(
  connectAccountId: string,
  name: string,
  fees: FeeStructure
): Promise<void> {
  // Deactivate existing profiles
  await pool.query(
    `UPDATE connect_fee_profiles
     SET active = false
     WHERE connect_account_id = $1`,
    [connectAccountId]
  );

  // Create new profile
  await pool.query(
    `INSERT INTO connect_fee_profiles (connect_account_id, name, fees, active)
     VALUES ($1, $2, $3, true)`,
    [connectAccountId, name, fees]
  );

  console.log(`[Pricing] Set fee profile for ${connectAccountId}: ${name}`);
}

/**
 * Get volume-based discount (enterprise pricing)
 * Returns discount percentage based on monthly volume
 */
export function getVolumeDiscount(monthlyVolume: number): number {
  if (monthlyVolume >= 1_000_000) return 30; // 30% discount for $1M+
  if (monthlyVolume >= 500_000) return 20; // 20% discount for $500K+
  if (monthlyVolume >= 100_000) return 10; // 10% discount for $100K+
  return 0; // No discount
}

/**
 * Apply volume discount to fee structure
 */
export function applyVolumeDiscount(fees: FeeStructure, discountPercent: number): FeeStructure {
  const multiplier = (100 - discountPercent) / 100;

  return {
    card: fees.card ? { ...fees.card, percent: fees.card.percent * multiplier } : undefined,
    wallet: fees.wallet ? { ...fees.wallet, percent: fees.wallet.percent * multiplier } : undefined,
    bank: fees.bank ? { ...fees.bank, percent: fees.bank.percent * multiplier } : undefined,
    mobile_money: fees.mobile_money
      ? { ...fees.mobile_money, percent: fees.mobile_money.percent * multiplier }
      : undefined,
  };
}
