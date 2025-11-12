/**
 * Brique 70octies - Program Management
 * Loyalty program configuration and management
 */

import pool from '../../db';
import { createAuditLog } from '../audit';

export interface LoyaltyProgram {
  id: string;
  merchantId: string;
  name: string;
  currency: string;
  earnRate: number;
  enableTiers: boolean;
  enableCashback: boolean;
  cashbackRate?: number;
  aiEnabled: boolean;
  aiOptimizationLevel?: 'low' | 'medium' | 'high' | 'max';
  tierMultipliers?: any;
  tierThresholds?: any;
  status: 'active' | 'inactive' | 'suspended';
  budgetLimit?: number;
  budgetSpent?: number;
  maxEarnPerDay?: number;
  fraudDetectionEnabled?: boolean;
  crossModuleEnabled?: boolean;
  allowedModules?: string[];
}

/**
 * Get program configuration
 */
export async function getProgramConfig(programId: string): Promise<LoyaltyProgram | null> {
  const result = await pool.query(
    'SELECT * FROM loyalty_programs WHERE id = $1',
    [programId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    merchantId: row.merchant_id,
    name: row.name,
    currency: row.currency,
    earnRate: parseFloat(row.earn_rate),
    enableTiers: row.enable_tiers,
    enableCashback: row.enable_cashback,
    cashbackRate: row.cashback_rate ? parseFloat(row.cashback_rate) : undefined,
    aiEnabled: row.ai_enabled,
    aiOptimizationLevel: row.ai_optimization_level,
    tierMultipliers: row.tier_multipliers,
    tierThresholds: row.tier_thresholds,
    status: row.status,
    budgetLimit: row.budget_limit ? parseFloat(row.budget_limit) : undefined,
    budgetSpent: row.budget_spent ? parseFloat(row.budget_spent) : undefined,
    maxEarnPerDay: row.max_earn_per_day ? parseFloat(row.max_earn_per_day) : undefined,
    fraudDetectionEnabled: row.fraud_detection_enabled,
    crossModuleEnabled: row.cross_module_enabled,
    allowedModules: row.allowed_modules
  };
}

/**
 * Create new loyalty program
 */
export async function createProgram(
  config: Partial<LoyaltyProgram> & { merchantId: string; name: string },
  actorId?: string,
  actorRole?: string
): Promise<LoyaltyProgram> {
  const result = await pool.query(
    `INSERT INTO loyalty_programs
     (merchant_id, name, currency, earn_rate, enable_tiers, enable_cashback, cashback_rate,
      ai_enabled, ai_optimization_level, tier_multipliers, tier_thresholds, status,
      budget_limit, max_earn_per_day, fraud_detection_enabled, cross_module_enabled,
      allowed_modules, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
     RETURNING *`,
    [
      config.merchantId,
      config.name,
      config.currency || 'points',
      config.earnRate || 0.02,
      config.enableTiers !== undefined ? config.enableTiers : true,
      config.enableCashback !== undefined ? config.enableCashback : false,
      config.cashbackRate || null,
      config.aiEnabled !== undefined ? config.aiEnabled : true,
      config.aiOptimizationLevel || 'medium',
      config.tierMultipliers || { basic: 1.0, silver: 1.25, gold: 1.5, platinum: 2.0 },
      config.tierThresholds || { silver: { points: 1000, spend: 500 }, gold: { points: 5000, spend: 2500 }, platinum: { points: 20000, spend: 10000 } },
      config.status || 'active',
      config.budgetLimit || null,
      config.maxEarnPerDay || null,
      config.fraudDetectionEnabled !== undefined ? config.fraudDetectionEnabled : true,
      config.crossModuleEnabled !== undefined ? config.crossModuleEnabled : true,
      config.allowedModules || ['shop', 'eats', 'talk', 'free']
    ]
  );

  const program = result.rows[0];

  // Audit log
  await createAuditLog({
    entityType: 'program',
    entityId: program.id,
    action: 'create',
    actorId,
    actorRole,
    changes: {
      merchantId: config.merchantId,
      name: config.name,
      earnRate: config.earnRate || 0.02
    }
  });

  return {
    id: program.id,
    merchantId: program.merchant_id,
    name: program.name,
    currency: program.currency,
    earnRate: parseFloat(program.earn_rate),
    enableTiers: program.enable_tiers,
    enableCashback: program.enable_cashback,
    cashbackRate: program.cashback_rate ? parseFloat(program.cashback_rate) : undefined,
    aiEnabled: program.ai_enabled,
    aiOptimizationLevel: program.ai_optimization_level,
    tierMultipliers: program.tier_multipliers,
    tierThresholds: program.tier_thresholds,
    status: program.status,
    budgetLimit: program.budget_limit ? parseFloat(program.budget_limit) : undefined,
    budgetSpent: program.budget_spent ? parseFloat(program.budget_spent) : 0,
    maxEarnPerDay: program.max_earn_per_day ? parseFloat(program.max_earn_per_day) : undefined,
    fraudDetectionEnabled: program.fraud_detection_enabled,
    crossModuleEnabled: program.cross_module_enabled,
    allowedModules: program.allowed_modules
  };
}

/**
 * Update program configuration
 */
export async function updateProgram(
  programId: string,
  updates: Partial<LoyaltyProgram>,
  actorId?: string,
  actorRole?: string
): Promise<LoyaltyProgram | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }

  if (updates.earnRate !== undefined) {
    fields.push(`earn_rate = $${paramIndex++}`);
    values.push(updates.earnRate);
  }

  if (updates.enableTiers !== undefined) {
    fields.push(`enable_tiers = $${paramIndex++}`);
    values.push(updates.enableTiers);
  }

  if (updates.aiEnabled !== undefined) {
    fields.push(`ai_enabled = $${paramIndex++}`);
    values.push(updates.aiEnabled);
  }

  if (updates.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }

  if (updates.budgetLimit !== undefined) {
    fields.push(`budget_limit = $${paramIndex++}`);
    values.push(updates.budgetLimit);
  }

  if (updates.maxEarnPerDay !== undefined) {
    fields.push(`max_earn_per_day = $${paramIndex++}`);
    values.push(updates.maxEarnPerDay);
  }

  if (fields.length === 0) {
    return getProgramConfig(programId);
  }

  fields.push(`updated_at = NOW()`);
  values.push(programId);

  const result = await pool.query(
    `UPDATE loyalty_programs
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  const program = result.rows[0];

  // Audit log
  await createAuditLog({
    entityType: 'program',
    entityId: programId,
    action: 'update',
    actorId,
    actorRole,
    changes: updates
  });

  return {
    id: program.id,
    merchantId: program.merchant_id,
    name: program.name,
    currency: program.currency,
    earnRate: parseFloat(program.earn_rate),
    enableTiers: program.enable_tiers,
    enableCashback: program.enable_cashback,
    cashbackRate: program.cashback_rate ? parseFloat(program.cashback_rate) : undefined,
    aiEnabled: program.ai_enabled,
    aiOptimizationLevel: program.ai_optimization_level,
    tierMultipliers: program.tier_multipliers,
    tierThresholds: program.tier_thresholds,
    status: program.status,
    budgetLimit: program.budget_limit ? parseFloat(program.budget_limit) : undefined,
    budgetSpent: program.budget_spent ? parseFloat(program.budget_spent) : undefined,
    maxEarnPerDay: program.max_earn_per_day ? parseFloat(program.max_earn_per_day) : undefined,
    fraudDetectionEnabled: program.fraud_detection_enabled,
    crossModuleEnabled: program.cross_module_enabled,
    allowedModules: program.allowed_modules
  };
}

/**
 * Suspend program (emergency stop)
 */
export async function suspendProgram(
  programId: string,
  reason: string,
  actorId: string,
  actorRole: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE loyalty_programs
     SET status = 'suspended', updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [programId]
  );

  if (result.rows.length > 0) {
    await createAuditLog({
      entityType: 'program',
      entityId: programId,
      action: 'update',
      actorId,
      actorRole,
      changes: {
        status: 'suspended',
        reason
      }
    });

    return true;
  }

  return false;
}

/**
 * Get programs by merchant
 */
export async function getProgramsByMerchant(merchantId: string): Promise<LoyaltyProgram[]> {
  const result = await pool.query(
    'SELECT * FROM loyalty_programs WHERE merchant_id = $1 ORDER BY created_at DESC',
    [merchantId]
  );

  return result.rows.map(row => ({
    id: row.id,
    merchantId: row.merchant_id,
    name: row.name,
    currency: row.currency,
    earnRate: parseFloat(row.earn_rate),
    enableTiers: row.enable_tiers,
    enableCashback: row.enable_cashback,
    cashbackRate: row.cashback_rate ? parseFloat(row.cashback_rate) : undefined,
    aiEnabled: row.ai_enabled,
    aiOptimizationLevel: row.ai_optimization_level,
    tierMultipliers: row.tier_multipliers,
    tierThresholds: row.tier_thresholds,
    status: row.status,
    budgetLimit: row.budget_limit ? parseFloat(row.budget_limit) : undefined,
    budgetSpent: row.budget_spent ? parseFloat(row.budget_spent) : undefined,
    maxEarnPerDay: row.max_earn_per_day ? parseFloat(row.max_earn_per_day) : undefined,
    fraudDetectionEnabled: row.fraud_detection_enabled,
    crossModuleEnabled: row.cross_module_enabled,
    allowedModules: row.allowed_modules
  }));
}
