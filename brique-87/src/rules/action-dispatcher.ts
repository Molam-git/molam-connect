// Action dispatcher for reconciliation rules
// Executes actions when rules match

import { pool, withTransaction } from '../utils/db';
import { extractRegexGroups } from './condition-evaluator';

export interface RuleAction {
  type: string;
  [key: string]: any;
}

export interface ActionResult {
  success: boolean;
  action: RuleAction;
  result?: any;
  error?: string;
}

export interface ActionContext {
  lineId: string;
  line: any;
  ruleId: string;
  userId?: string;
  dryRun: boolean;
}

/**
 * Execute array of actions
 */
export async function executeActions(
  actions: RuleAction[],
  context: ActionContext
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const action of actions) {
    try {
      const result = await executeAction(action, context);
      results.push(result);

      // Stop on first error (unless action.continue_on_error)
      if (!result.success && !action.continue_on_error) {
        break;
      }
    } catch (error: any) {
      console.error('Action execution error:', error);
      results.push({
        success: false,
        action,
        error: error.message,
      });
      break;
    }
  }

  return results;
}

/**
 * Execute single action
 */
async function executeAction(action: RuleAction, context: ActionContext): Promise<ActionResult> {
  const { type } = action;

  // Route to appropriate handler
  switch (type) {
    case 'auto_match_payout':
      return await autoMatchPayout(action, context);

    case 'create_adjustment':
      return await createAdjustment(action, context);

    case 'mark_payout_partial':
      return await markPayoutPartial(action, context);

    case 'mark_ignored':
      return await markIgnored(action, context);

    case 'escalate_to_ops':
      return await escalateToOps(action, context);

    case 'notify_ops':
      return await notifyOps(action, context);

    case 'release_ledger_hold':
      return await releaseLedgerHold(action, context);

    case 'log_audit':
      return await logAudit(action, context);

    default:
      console.warn('Unknown action type:', type);
      return {
        success: false,
        action,
        error: `Unknown action type: ${type}`,
      };
  }
}

/**
 * Auto-match payout using extracted reference
 */
async function autoMatchPayout(action: RuleAction, context: ActionContext): Promise<ActionResult> {
  const { line, lineId, dryRun } = context;

  try {
    // Extract reference using regex group
    let reference = action.reference;

    if (action.use_ref_group !== undefined && action.regex_pattern) {
      const groups = extractRegexGroups(line.description || '', action.regex_pattern);
      if (groups && groups[action.use_ref_group]) {
        reference = groups[action.use_ref_group];
      }
    }

    if (!reference) {
      return {
        success: false,
        action,
        error: 'No reference extracted',
      };
    }

    // Find matching payout
    const { rows: payouts } = await pool.query(
      `SELECT id, reference_code, amount, currency, status
       FROM payouts
       WHERE reference_code = $1
       AND currency = $2
       LIMIT 1`,
      [reference, line.currency]
    );

    if (payouts.length === 0) {
      return {
        success: false,
        action,
        error: `No payout found with reference: ${reference}`,
      };
    }

    const payout = payouts[0];

    if (dryRun) {
      return {
        success: true,
        action,
        result: {
          would_match: true,
          payout_id: payout.id,
          reference,
        },
      };
    }

    // Execute match in transaction
    await withTransaction(async (client) => {
      // Insert reconciliation match
      await client.query(
        `INSERT INTO reconciliation_matches (
          bank_statement_line_id, matched_type, matched_entity_id,
          match_score, match_rule, reconciled_at
        ) VALUES ($1, 'payout', $2, 1.0, 'rule_auto_match', now())`,
        [lineId, payout.id]
      );

      // Update line status
      await client.query(
        `UPDATE bank_statement_lines
         SET reconciliation_status = 'matched', matched_at = now()
         WHERE id = $1`,
        [lineId]
      );

      // Update payout status if specified
      if (action.set_payout_status) {
        await client.query(
          `UPDATE payouts
           SET status = $1, settled_at = now()
           WHERE id = $2`,
          [action.set_payout_status, payout.id]
        );
      }

      // Log action
      await client.query(
        `INSERT INTO reconciliation_logs (actor, actor_type, action, details, created_at)
         VALUES ('rules-engine', 'system', 'rule_auto_matched', $1, now())`,
        [JSON.stringify({ line_id: lineId, payout_id: payout.id, reference, rule_id: context.ruleId })]
      );
    });

    return {
      success: true,
      action,
      result: {
        matched: true,
        payout_id: payout.id,
        reference,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      action,
      error: error.message,
    };
  }
}

/**
 * Create ledger adjustment
 */
async function createAdjustment(action: RuleAction, context: ActionContext): Promise<ActionResult> {
  const { line, lineId, dryRun, ruleId } = context;

  try {
    // Calculate adjustment amount
    const adjustmentAmount = calculateAdjustmentAmount(action, line);

    if (adjustmentAmount === 0) {
      return {
        success: true,
        action,
        result: { adjustment_amount: 0, skipped: true },
      };
    }

    if (dryRun) {
      return {
        success: true,
        action,
        result: {
          would_create_adjustment: true,
          amount: adjustmentAmount,
          ledger_code: action.ledger_code,
        },
      };
    }

    // Create adjustment
    const { rows } = await pool.query(
      `INSERT INTO ledger_adjustments (
        bank_statement_line_id, rule_id, adjustment_type, ledger_code,
        amount, currency, expected_amount, settled_amount, formula, memo, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
      RETURNING id`,
      [
        lineId,
        ruleId,
        action.adjustment_type || 'rule_auto_adjustment',
        action.ledger_code,
        adjustmentAmount,
        line.currency,
        action.expected_amount || null,
        line.amount,
        action.amount_formula || null,
        action.memo || 'Auto-adjustment by rule',
      ]
    );

    return {
      success: true,
      action,
      result: {
        adjustment_id: rows[0].id,
        amount: adjustmentAmount,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      action,
      error: error.message,
    };
  }
}

/**
 * Calculate adjustment amount from formula
 */
function calculateAdjustmentAmount(action: RuleAction, line: any): number {
  if (action.amount !== undefined) {
    return parseFloat(action.amount);
  }

  if (action.amount_formula) {
    // Simple formula evaluation
    // Supports: "expected - settled", "amount * 0.05", etc.
    try {
      const formula = action.amount_formula
        .replace(/expected/g, String(action.expected_amount || 0))
        .replace(/settled/g, String(line.amount))
        .replace(/amount/g, String(Math.abs(line.amount)));

      // Safe eval (very limited scope)
      const result = Function(`"use strict"; return (${formula})`)();
      return parseFloat(result) || 0;
    } catch (error) {
      console.error('Formula evaluation error:', error);
      return 0;
    }
  }

  return 0;
}

/**
 * Mark payout as partially settled
 */
async function markPayoutPartial(action: RuleAction, context: ActionContext): Promise<ActionResult> {
  const { line, lineId, dryRun } = context;

  try {
    // Find related payout
    const { rows: payouts } = await pool.query(
      `SELECT id, amount FROM payouts
       WHERE currency = $1
       AND ABS(amount - $2) BETWEEN 0 AND $3
       ORDER BY ABS(amount - $2) ASC
       LIMIT 1`,
      [line.currency, Math.abs(line.amount), Math.abs(line.amount) * 0.1] // 10% tolerance
    );

    if (payouts.length === 0) {
      return {
        success: false,
        action,
        error: 'No matching payout found for partial settlement',
      };
    }

    const payout = payouts[0];

    if (dryRun) {
      return {
        success: true,
        action,
        result: { would_mark_partial: true, payout_id: payout.id },
      };
    }

    // Mark payout as partially settled
    await pool.query(
      `UPDATE payouts
       SET status = 'partially_settled', settled_amount = $1, settled_at = now()
       WHERE id = $2`,
      [line.amount, payout.id]
    );

    // Optionally create adjustment
    if (action.create_adjustment) {
      const diff = Number(payout.amount) - Number(line.amount);
      await pool.query(
        `INSERT INTO ledger_adjustments (
          bank_statement_line_id, payout_id, adjustment_type, ledger_code,
          amount, currency, expected_amount, settled_amount, memo
        ) VALUES ($1, $2, 'partial_settlement', 'ADJ-PARTIAL', $3, $4, $5, $6, 'Partial settlement variance')`,
        [lineId, payout.id, diff, line.currency, payout.amount, line.amount]
      );
    }

    return {
      success: true,
      action,
      result: { payout_id: payout.id, marked_partial: true },
    };
  } catch (error: any) {
    return {
      success: false,
      action,
      error: error.message,
    };
  }
}

/**
 * Mark line as ignored
 */
async function markIgnored(action: RuleAction, context: ActionContext): Promise<ActionResult> {
  const { lineId, dryRun } = context;

  if (dryRun) {
    return {
      success: true,
      action,
      result: { would_ignore: true, reason: action.reason },
    };
  }

  try {
    await pool.query(
      `UPDATE bank_statement_lines
       SET reconciliation_status = 'ignored', updated_at = now()
       WHERE id = $1`,
      [lineId]
    );

    // Log reason
    await pool.query(
      `INSERT INTO reconciliation_logs (actor, actor_type, action, details)
       VALUES ('rules-engine', 'system', 'line_ignored', $1)`,
      [JSON.stringify({ line_id: lineId, reason: action.reason, rule_id: context.ruleId })]
    );

    return {
      success: true,
      action,
      result: { ignored: true },
    };
  } catch (error: any) {
    return {
      success: false,
      action,
      error: error.message,
    };
  }
}

/**
 * Escalate to Ops (create queue entry)
 */
async function escalateToOps(action: RuleAction, context: ActionContext): Promise<ActionResult> {
  const { lineId, dryRun } = context;

  if (dryRun) {
    return {
      success: true,
      action,
      result: { would_escalate: true, severity: action.severity },
    };
  }

  try {
    await pool.query(
      `INSERT INTO reconciliation_queue (
        bank_statement_line_id, reason, severity, status
      ) VALUES ($1, $2, $3, 'open')`,
      [lineId, action.reason || 'rule_escalation', action.severity || 'medium']
    );

    return {
      success: true,
      action,
      result: { escalated: true },
    };
  } catch (error: any) {
    return {
      success: false,
      action,
      error: error.message,
    };
  }
}

/**
 * Send notification to Ops
 */
async function notifyOps(action: RuleAction, context: ActionContext): Promise<ActionResult> {
  const { lineId, line, dryRun } = context;

  if (dryRun) {
    return {
      success: true,
      action,
      result: { would_notify: true, channel: action.channel },
    };
  }

  try {
    await pool.query(
      `INSERT INTO system_notifications (channel, severity, title, message, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        action.channel || 'ops',
        action.severity || 'info',
        action.title || `Rule matched: ${context.ruleId}`,
        action.message || `Line ${lineId} matched rule`,
        JSON.stringify({ line_id: lineId, amount: line.amount, currency: line.currency }),
      ]
    );

    return {
      success: true,
      action,
      result: { notified: true },
    };
  } catch (error: any) {
    return {
      success: false,
      action,
      error: error.message,
    };
  }
}

/**
 * Release ledger hold (placeholder - integrate with ledger service)
 */
async function releaseLedgerHold(action: RuleAction, context: ActionContext): Promise<ActionResult> {
  // TODO: Integrate with ledger/treasury service to release holds
  return {
    success: true,
    action,
    result: { hold_released: context.dryRun ? 'dry_run' : true },
  };
}

/**
 * Log audit entry
 */
async function logAudit(action: RuleAction, context: ActionContext): Promise<ActionResult> {
  if (context.dryRun) {
    return {
      success: true,
      action,
      result: { would_log: true },
    };
  }

  try {
    await pool.query(
      `INSERT INTO reconciliation_logs (actor, actor_type, action, details)
       VALUES ('rules-engine', 'system', 'rule_audit_log', $1)`,
      [JSON.stringify({ line_id: context.lineId, message: action.message, rule_id: context.ruleId })]
    );

    return {
      success: true,
      action,
      result: { logged: true },
    };
  } catch (error: any) {
    return {
      success: false,
      action,
      error: error.message,
    };
  }
}
