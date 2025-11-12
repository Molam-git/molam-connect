// ============================================================================
// Split Rules Service
// Purpose: CRUD operations for split payment rules
// ============================================================================

import { SplitRule, CreateSplitRuleInput } from '../types';
import pool from '../db';

/**
 * Create a new split rule
 */
export async function createSplitRule(input: CreateSplitRuleInput): Promise<SplitRule> {
  const {
    platform_id,
    merchant_id,
    rule_name,
    rule_type,
    rule_config,
    max_recipients = 10,
    min_split_amount = 0,
    tax_handling = 'included',
    allowed_currencies = ['USD', 'EUR', 'GBP'],
    allowed_countries = ['US', 'CA', 'GB', 'FR', 'DE'],
    created_by,
    metadata = {},
  } = input;

  const { rows } = await pool.query<SplitRule>(
    `INSERT INTO split_rules (
      platform_id, merchant_id, rule_name, rule_type, rule_config,
      max_recipients, min_split_amount, tax_handling,
      allowed_currencies, allowed_countries, created_by, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      platform_id,
      merchant_id || null,
      rule_name,
      rule_type,
      JSON.stringify(rule_config),
      max_recipients,
      min_split_amount,
      tax_handling,
      allowed_currencies,
      allowed_countries,
      created_by,
      JSON.stringify(metadata),
    ]
  );

  // Audit log
  await pool.query(
    `INSERT INTO molam_audit_logs (brique_id, entity_type, entity_id, action, actor_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    ['brique-64', 'split_rule', rows[0].id, 'created', created_by, JSON.stringify({ rule_name })]
  );

  return rows[0];
}

/**
 * Get split rule by ID
 */
export async function getSplitRuleById(id: string): Promise<SplitRule | null> {
  const { rows } = await pool.query<SplitRule>('SELECT * FROM split_rules WHERE id = $1', [id]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * List split rules for a platform
 */
export async function listSplitRules(
  platform_id: string,
  filters?: {
    merchant_id?: string;
    status?: 'active' | 'inactive' | 'archived';
    limit?: number;
    offset?: number;
  }
): Promise<SplitRule[]> {
  const { merchant_id, status, limit = 100, offset = 0 } = filters || {};

  let query = 'SELECT * FROM split_rules WHERE platform_id = $1';
  const params: any[] = [platform_id];
  let paramIndex = 2;

  if (merchant_id !== undefined) {
    query += ` AND merchant_id = $${paramIndex}`;
    params.push(merchant_id);
    paramIndex++;
  }

  if (status) {
    query += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const { rows } = await pool.query<SplitRule>(query, params);
  return rows;
}

/**
 * Update split rule status
 */
export async function updateSplitRuleStatus(
  id: string,
  status: 'active' | 'inactive' | 'archived',
  actor_id: string
): Promise<SplitRule> {
  const { rows } = await pool.query<SplitRule>(
    'UPDATE split_rules SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, id]
  );

  if (rows.length === 0) {
    throw new Error(`Split rule ${id} not found`);
  }

  // Audit log
  await pool.query(
    `INSERT INTO molam_audit_logs (brique_id, entity_type, entity_id, action, actor_id, changes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      'brique-64',
      'split_rule',
      id,
      'status_updated',
      actor_id,
      JSON.stringify({ new_status: status }),
    ]
  );

  return rows[0];
}

/**
 * Update split rule configuration
 */
export async function updateSplitRuleConfig(
  id: string,
  updates: {
    rule_name?: string;
    rule_config?: any;
    max_recipients?: number;
    min_split_amount?: number;
    tax_handling?: 'included' | 'excluded' | 'added';
    allowed_currencies?: string[];
    allowed_countries?: string[];
    metadata?: Record<string, any>;
  },
  actor_id: string
): Promise<SplitRule> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.rule_name !== undefined) {
    fields.push(`rule_name = $${paramIndex++}`);
    values.push(updates.rule_name);
  }

  if (updates.rule_config !== undefined) {
    fields.push(`rule_config = $${paramIndex++}`);
    values.push(JSON.stringify(updates.rule_config));
  }

  if (updates.max_recipients !== undefined) {
    fields.push(`max_recipients = $${paramIndex++}`);
    values.push(updates.max_recipients);
  }

  if (updates.min_split_amount !== undefined) {
    fields.push(`min_split_amount = $${paramIndex++}`);
    values.push(updates.min_split_amount);
  }

  if (updates.tax_handling !== undefined) {
    fields.push(`tax_handling = $${paramIndex++}`);
    values.push(updates.tax_handling);
  }

  if (updates.allowed_currencies !== undefined) {
    fields.push(`allowed_currencies = $${paramIndex++}`);
    values.push(updates.allowed_currencies);
  }

  if (updates.allowed_countries !== undefined) {
    fields.push(`allowed_countries = $${paramIndex++}`);
    values.push(updates.allowed_countries);
  }

  if (updates.metadata !== undefined) {
    fields.push(`metadata = $${paramIndex++}`);
    values.push(JSON.stringify(updates.metadata));
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const query = `UPDATE split_rules SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

  const { rows } = await pool.query<SplitRule>(query, values);

  if (rows.length === 0) {
    throw new Error(`Split rule ${id} not found`);
  }

  // Audit log
  await pool.query(
    `INSERT INTO molam_audit_logs (brique_id, entity_type, entity_id, action, actor_id, changes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    ['brique-64', 'split_rule', id, 'updated', actor_id, JSON.stringify(updates)]
  );

  return rows[0];
}

/**
 * Delete split rule (soft delete by archiving)
 */
export async function deleteSplitRule(id: string, actor_id: string): Promise<void> {
  await updateSplitRuleStatus(id, 'archived', actor_id);
}
