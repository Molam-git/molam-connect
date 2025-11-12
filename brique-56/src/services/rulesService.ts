/**
 * Rules Service - Manage radar rules
 */
import { pool } from "../utils/db.js";
import { RadarRule, validateRule } from "../radar/evaluator.js";

export interface CreateRuleInput {
  name: string;
  description?: string;
  scope?: any;
  condition: string; // JSONLogic as string
  action: any;
  priority?: number;
  createdBy: string;
}

export interface UpdateRuleInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  scope?: any;
  condition?: string;
  action?: any;
  priority?: number;
}

/**
 * Create a new radar rule
 */
export async function createRule(input: CreateRuleInput): Promise<RadarRule> {
  // Validate JSONLogic condition
  const validation = validateRule(input.condition);
  if (!validation.valid) {
    throw new Error(`Invalid rule condition: ${validation.error}`);
  }

  const { rows: [rule] } = await pool.query<RadarRule>(
    `INSERT INTO radar_rules (
      name, description, scope, condition, action, priority, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      input.name,
      input.description || null,
      input.scope || {},
      input.condition,
      input.action,
      input.priority || 100,
      input.createdBy,
    ]
  );

  return rule;
}

/**
 * Get rule by ID
 */
export async function getRule(ruleId: string): Promise<RadarRule | null> {
  const { rows } = await pool.query<RadarRule>("SELECT * FROM radar_rules WHERE id = $1", [
    ruleId,
  ]);
  return rows.length ? rows[0] : null;
}

/**
 * List all rules (with optional filters)
 */
export async function listRules(filters?: {
  enabled?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ data: RadarRule[]; total: number }> {
  let whereClause = "";
  const params: any[] = [];
  let paramIndex = 1;

  if (filters?.enabled !== undefined) {
    whereClause = `WHERE enabled = $${paramIndex++}`;
    params.push(filters.enabled);
  }

  // Get total count
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) FROM radar_rules ${whereClause}`,
    params
  );
  const total = parseInt(countRows[0].count);

  // Get paginated data
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  const { rows: data } = await pool.query<RadarRule>(
    `SELECT * FROM radar_rules ${whereClause}
     ORDER BY priority ASC, created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset]
  );

  return { data, total };
}

/**
 * Update rule
 */
export async function updateRule(ruleId: string, input: UpdateRuleInput): Promise<RadarRule> {
  // Validate condition if provided
  if (input.condition) {
    const validation = validateRule(input.condition);
    if (!validation.valid) {
      throw new Error(`Invalid rule condition: ${validation.error}`);
    }
  }

  // Build dynamic update query
  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    params.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    params.push(input.description);
  }
  if (input.enabled !== undefined) {
    updates.push(`enabled = $${paramIndex++}`);
    params.push(input.enabled);
  }
  if (input.scope !== undefined) {
    updates.push(`scope = $${paramIndex++}`);
    params.push(input.scope);
  }
  if (input.condition !== undefined) {
    updates.push(`condition = $${paramIndex++}`);
    params.push(input.condition);
  }
  if (input.action !== undefined) {
    updates.push(`action = $${paramIndex++}`);
    params.push(input.action);
  }
  if (input.priority !== undefined) {
    updates.push(`priority = $${paramIndex++}`);
    params.push(input.priority);
  }

  updates.push(`updated_at = now()`);
  params.push(ruleId);

  const { rows: [rule] } = await pool.query<RadarRule>(
    `UPDATE radar_rules SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    params
  );

  if (!rule) {
    throw new Error("rule_not_found");
  }

  return rule;
}

/**
 * Delete rule
 */
export async function deleteRule(ruleId: string): Promise<void> {
  await pool.query("DELETE FROM radar_rules WHERE id = $1", [ruleId]);
}

/**
 * Test rule against sample data
 */
export async function testRule(
  condition: string,
  sampleData: any
): Promise<{ triggered: boolean; error?: string }> {
  try {
    // Validate condition first
    const validation = validateRule(condition);
    if (!validation.valid) {
      return { triggered: false, error: validation.error };
    }

    // Import jsonLogic for testing
    const jsonLogic = (await import("json-logic-js")).default;
    const parsed = JSON.parse(condition);
    const triggered = !!jsonLogic.apply(parsed, sampleData);

    return { triggered };
  } catch (error) {
    return { triggered: false, error: String(error) };
  }
}
