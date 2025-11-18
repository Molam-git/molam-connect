// Main rules engine - orchestrates condition evaluation and action execution
import { pool } from '../utils/db';
import { evaluateCondition, Condition, EvaluationContext } from './condition-evaluator';
import { executeActions, RuleAction, ActionResult } from './action-dispatcher';

export interface Rule {
  id: string;
  name: string;
  priority: number;
  condition: Condition;
  actions: RuleAction[];
  mode: 'dry_run' | 'staging' | 'active';
  auto_execute: boolean;
  approval_required: boolean;
  approval_threshold: number;
  min_approvers: number;
}

export interface RuleExecutionResult {
  rule: Rule;
  matched: boolean;
  score: number;
  actions: ActionResult[];
  executionTimeMs: number;
  error?: string;
}

/**
 * Run rules engine for a statement line
 * Evaluates all applicable rules and executes actions
 */
export async function runRulesForLine(lineId: string, userId?: string): Promise<RuleExecutionResult[]> {
  const startTime = Date.now();

  try {
    // Fetch line
    const { rows: [line] } = await pool.query(
      `SELECT * FROM bank_statement_lines WHERE id = $1`,
      [lineId]
    );

    if (!line) {
      throw new Error(`Line not found: ${lineId}`);
    }

    // Load applicable rules (global + bank-specific)
    const rules = await loadApplicableRules(line.bank_profile_id, line.currency);

    console.log(`Evaluating ${rules.length} rules for line ${lineId}`);

    const results: RuleExecutionResult[] = [];

    for (const rule of rules) {
      const result = await evaluateAndExecuteRule(rule, line, lineId, userId);
      results.push(result);

      // Log execution
      await logRuleExecution(rule.id, lineId, line, result);

      // Stop if rule matched and has stop_on_match flag
      if (result.matched && (rule as any).stop_on_match) {
        console.log(`Rule ${rule.name} matched with stop_on_match, stopping evaluation`);
        break;
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`Rules evaluation completed in ${totalTime}ms`);

    return results;
  } catch (error: any) {
    console.error('Rules engine error:', error);
    throw error;
  }
}

/**
 * Load applicable rules for a line
 */
async function loadApplicableRules(bankProfileId: string, currency: string): Promise<Rule[]> {
  const { rows } = await pool.query<Rule>(
    `SELECT
      id, name, priority, condition, actions, mode,
      auto_execute, approval_required, approval_threshold, min_approvers
     FROM recon_rules
     WHERE enabled = true
     AND mode IN ('staging', 'active')
     AND (bank_profile_id IS NULL OR bank_profile_id = $1)
     AND (currency IS NULL OR currency = $2)
     ORDER BY priority ASC, created_at ASC`,
    [bankProfileId, currency]
  );

  return rows.map(row => ({
    ...row,
    condition: row.condition as Condition,
    actions: row.actions as RuleAction[],
  }));
}

/**
 * Evaluate and execute a single rule
 */
async function evaluateAndExecuteRule(
  rule: Rule,
  line: any,
  lineId: string,
  userId?: string
): Promise<RuleExecutionResult> {
  const ruleStartTime = Date.now();

  try {
    // Build evaluation context
    const context: EvaluationContext = {
      line,
      metadata: {
        rule_id: rule.id,
        rule_name: rule.name,
      },
    };

    // Evaluate condition
    const matched = evaluateCondition(rule.condition, context);
    const score = matched ? 1.0 : 0.0;

    let actions: ActionResult[] = [];

    if (matched) {
      // Check if we should execute actions
      const shouldExecute = await checkShouldExecuteActions(rule, line, userId);

      if (shouldExecute) {
        // Execute actions
        const dryRun = rule.mode === 'dry_run' || !rule.auto_execute;

        actions = await executeActions(rule.actions, {
          lineId,
          line,
          ruleId: rule.id,
          userId,
          dryRun,
        });

        console.log(`Rule ${rule.name}: executed ${actions.length} actions (dryRun: ${dryRun})`);
      } else {
        console.log(`Rule ${rule.name}: matched but execution blocked (awaiting approval)`);
      }
    }

    const executionTimeMs = Date.now() - ruleStartTime;

    return {
      rule,
      matched,
      score,
      actions,
      executionTimeMs,
    };
  } catch (error: any) {
    console.error(`Rule ${rule.name} evaluation error:`, error);

    return {
      rule,
      matched: false,
      score: 0,
      actions: [],
      executionTimeMs: Date.now() - ruleStartTime,
      error: error.message,
    };
  }
}

/**
 * Check if actions should be executed
 * Verifies approval requirements
 */
async function checkShouldExecuteActions(rule: Rule, line: any, userId?: string): Promise<boolean> {
  // Always allow dry_run mode
  if (rule.mode === 'dry_run') {
    return true;
  }

  // Check if approval required
  if (!rule.approval_required) {
    return true;
  }

  // Check if amount exceeds approval threshold
  if (Math.abs(line.amount) <= rule.approval_threshold) {
    return true; // Below threshold, no approval needed
  }

  // Check if rule has sufficient approvals
  const hasApprovals = await checkRuleApprovals(rule.id, rule.min_approvers);

  if (!hasApprovals) {
    console.warn(`Rule ${rule.id} requires ${rule.min_approvers} approvals but doesn't have enough`);
    return false;
  }

  return true;
}

/**
 * Check if rule has sufficient approvals
 */
async function checkRuleApprovals(ruleId: string, minApprovers: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT approver_user_id) as approval_count
     FROM recon_rule_approvals
     WHERE rule_id = $1 AND approved = true`,
    [ruleId]
  );

  const approvalCount = parseInt(rows[0]?.approval_count || '0');
  return approvalCount >= minApprovers;
}

/**
 * Log rule execution to database
 */
async function logRuleExecution(
  ruleId: string,
  lineId: string,
  line: any,
  result: RuleExecutionResult
): Promise<void> {
  try {
    const inputSnapshot = {
      line,
      timestamp: new Date().toISOString(),
    };

    const actionsTaken = result.matched && result.rule.mode === 'active'
      ? result.actions.map(a => ({
          type: a.action.type,
          success: a.success,
          result: a.result,
          error: a.error,
        }))
      : null;

    const actionsWouldTake = result.matched && result.rule.mode !== 'active'
      ? result.actions.map(a => ({
          type: a.action.type,
          result: a.result,
        }))
      : null;

    await pool.query(
      `INSERT INTO recon_rule_executions (
        rule_id, bank_statement_line_id, input_snapshot, matched,
        match_score, actions_taken, actions_would_take, executed_by,
        execution_time_ms, error, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
      [
        ruleId,
        lineId,
        JSON.stringify(inputSnapshot),
        result.matched,
        result.score,
        actionsTaken ? JSON.stringify(actionsTaken) : null,
        actionsWouldTake ? JSON.stringify(actionsWouldTake) : null,
        'rules-engine',
        result.executionTimeMs,
        result.error || null,
      ]
    );
  } catch (error) {
    console.error('Error logging rule execution:', error);
    // Don't throw - logging failure shouldn't break the flow
  }
}

/**
 * Test rule against sample lines
 * Returns statistics on matches
 */
export async function testRule(
  ruleId: string,
  sampleSize: number = 100
): Promise<{
  rule: Rule;
  totalSamples: number;
  matchCount: number;
  matchRate: number;
  sampleResults: RuleExecutionResult[];
}> {
  // Load rule
  const { rows: [ruleRow] } = await pool.query<Rule>(
    `SELECT * FROM recon_rules WHERE id = $1`,
    [ruleId]
  );

  if (!ruleRow) {
    throw new Error(`Rule not found: ${ruleId}`);
  }

  const rule: Rule = {
    ...ruleRow,
    condition: ruleRow.condition as Condition,
    actions: ruleRow.actions as RuleAction[],
  };

  // Get sample lines (recent unmatched lines)
  const { rows: sampleLines } = await pool.query(
    `SELECT * FROM bank_statement_lines
     WHERE (bank_profile_id = $1 OR $1 IS NULL)
     AND (currency = $2 OR $2 IS NULL)
     ORDER BY created_at DESC
     LIMIT $3`,
    [rule.bank_profile_id, rule.currency, sampleSize]
  );

  console.log(`Testing rule ${rule.name} against ${sampleLines.length} samples`);

  const results: RuleExecutionResult[] = [];
  let matchCount = 0;

  for (const line of sampleLines) {
    const result = await evaluateAndExecuteRule(rule, line, line.id);
    results.push(result);

    if (result.matched) {
      matchCount++;
    }
  }

  const matchRate = sampleLines.length > 0 ? (matchCount / sampleLines.length) * 100 : 0;

  return {
    rule,
    totalSamples: sampleLines.length,
    matchCount,
    matchRate,
    sampleResults: results,
  };
}

/**
 * Update rule metrics
 * Should be called periodically (e.g., daily cron)
 */
export async function updateRuleMetrics(date?: Date): Promise<void> {
  const metricDate = date || new Date();
  const dateStr = metricDate.toISOString().split('T')[0];

  const { rows: rules } = await pool.query<{ id: string; currency: string }>(
    `SELECT DISTINCT id, currency FROM recon_rules WHERE enabled = true`
  );

  for (const rule of rules) {
    try {
      // Aggregate execution stats for this rule on this date
      const { rows: [stats] } = await pool.query(
        `SELECT
          COUNT(*) as executions_total,
          COUNT(*) FILTER (WHERE matched = true) as matches_total,
          COUNT(*) FILTER (WHERE actions_taken IS NOT NULL) as actions_executed,
          COUNT(*) FILTER (WHERE error IS NOT NULL) as errors_total,
          AVG(execution_time_ms) as avg_execution_time_ms
         FROM recon_rule_executions
         WHERE rule_id = $1
         AND DATE(created_at) = $2`,
        [rule.id, dateStr]
      );

      if (parseInt(stats.executions_total) === 0) {
        continue; // No executions today
      }

      const matchRate = (parseInt(stats.matches_total) / parseInt(stats.executions_total)) * 100;

      // Insert or update metrics
      await pool.query(
        `INSERT INTO recon_rule_metrics (
          rule_id, metric_date, executions_total, matches_total,
          actions_executed, errors_total, avg_execution_time_ms,
          match_rate_pct, currency
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (rule_id, metric_date, currency)
        DO UPDATE SET
          executions_total = EXCLUDED.executions_total,
          matches_total = EXCLUDED.matches_total,
          actions_executed = EXCLUDED.actions_executed,
          errors_total = EXCLUDED.errors_total,
          avg_execution_time_ms = EXCLUDED.avg_execution_time_ms,
          match_rate_pct = EXCLUDED.match_rate_pct,
          updated_at = now()`,
        [
          rule.id,
          dateStr,
          stats.executions_total,
          stats.matches_total,
          stats.actions_executed,
          stats.errors_total,
          parseFloat(stats.avg_execution_time_ms) || 0,
          matchRate,
          rule.currency || 'ALL',
        ]
      );
    } catch (error) {
      console.error(`Error updating metrics for rule ${rule.id}:`, error);
    }
  }
}
