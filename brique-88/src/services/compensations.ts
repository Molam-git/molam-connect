// Compensation Actions Service
// Executes compensation actions: wallet credit/debit, credit notes, payout adjustments

import { pool } from '../utils/db';

/**
 * Enqueue compensation action
 */
export async function enqueueCompensation(adjustmentId: string, action: any): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO compensation_actions (adjustment_id, action_type, params, status)
     VALUES ($1, $2, $3, 'queued')
     RETURNING id`,
    [adjustmentId, action.type, JSON.stringify(action.params)]
  );

  return rows[0].id;
}

/**
 * Process queued compensation actions (worker loop)
 */
export async function processCompensations(batchSize: number = 50): Promise<void> {
  const { rows: actions } = await pool.query(
    `UPDATE compensation_actions
     SET status = 'processing', updated_at = now()
     WHERE id IN (
       SELECT id FROM compensation_actions
       WHERE status = 'queued' OR (status = 'failed' AND attempts < max_attempts)
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [batchSize]
  );

  for (const action of actions) {
    try {
      await executeCompensationAction(action);

      await pool.query(
        `UPDATE compensation_actions
         SET status = 'done', executed_at = now(), updated_at = now()
         WHERE id = $1`,
        [action.id]
      );

      console.log(`✅ Compensation action ${action.id} (${action.action_type}) completed`);
    } catch (error: any) {
      console.error(`Failed to execute compensation ${action.id}:`, error);

      const newAttempts = action.attempts + 1;
      const isFinal = newAttempts >= action.max_attempts;

      await pool.query(
        `UPDATE compensation_actions
         SET attempts = $2, last_error = $3, status = $4, updated_at = now()
         WHERE id = $1`,
        [action.id, newAttempts, error.message, isFinal ? 'failed' : 'queued']
      );

      if (isFinal) {
        console.error(`❌ Compensation ${action.id} failed permanently after ${newAttempts} attempts`);
        // Notify Ops
        await notifyCompensationFailed(action);
      }
    }
  }
}

/**
 * Execute single compensation action
 */
async function executeCompensationAction(action: any): Promise<void> {
  const { action_type, params } = action;

  switch (action_type) {
    case 'wallet_credit':
      await executeWalletCredit(action.id, params);
      break;

    case 'wallet_debit':
      await executeWalletDebit(action.id, params);
      break;

    case 'create_credit_note':
      await executeCreateCreditNote(action.id, params);
      break;

    case 'payout_reduce':
      await executePayoutReduce(action.id, params);
      break;

    case 'refund':
      await executeRefund(action.id, params);
      break;

    default:
      throw new Error(`Unknown compensation action type: ${action_type}`);
  }
}

/**
 * Execute wallet credit
 */
async function executeWalletCredit(actionId: string, params: any): Promise<void> {
  const { user_id, amount, currency, memo } = params;

  // Call wallet service API (B20 Wallet)
  // For now, stub implementation
  console.log(`WALLET CREDIT: user=${user_id}, amount=${amount}, currency=${currency}`);

  // TODO: const response = await walletService.credit({user_id, amount, currency, memo, idempotency_key: actionId});

  // Store external reference
  await pool.query(
    `UPDATE compensation_actions
     SET external_id = $2, metadata = $3
     WHERE id = $1`,
    [actionId, `wallet_txn_${actionId}`, JSON.stringify({ user_id, amount, currency })]
  );
}

/**
 * Execute wallet debit
 */
async function executeWalletDebit(actionId: string, params: any): Promise<void> {
  const { user_id, amount, currency, memo } = params;

  console.log(`WALLET DEBIT: user=${user_id}, amount=${amount}, currency=${currency}`);

  // TODO: Implement wallet service call
}

/**
 * Execute credit note creation
 */
async function executeCreateCreditNote(actionId: string, params: any): Promise<void> {
  const { merchant_id, amount, currency, reason } = params;

  console.log(`CREATE CREDIT NOTE: merchant=${merchant_id}, amount=${amount}`);

  // TODO: Call billing service to create credit note
  // const creditNote = await billingService.createCreditNote({merchant_id, amount, currency, reason});

  await pool.query(
    `UPDATE compensation_actions
     SET external_id = $2
     WHERE id = $1`,
    [actionId, `credit_note_${actionId}`]
  );
}

/**
 * Execute payout reduction
 */
async function executePayoutReduce(actionId: string, params: any): Promise<void> {
  const { payout_id, amount, reason } = params;

  console.log(`PAYOUT REDUCE: payout=${payout_id}, amount=${amount}`);

  // Update payout amount
  await pool.query(
    `UPDATE payouts
     SET amount = amount - $2, updated_at = now(),
         metadata = metadata || jsonb_build_object('adjustment_reduction', $3)
     WHERE id = $1`,
    [payout_id, amount, reason]
  );
}

/**
 * Execute refund
 */
async function executeRefund(actionId: string, params: any): Promise<void> {
  const { payment_id, amount, currency, reason } = params;

  console.log(`REFUND: payment=${payment_id}, amount=${amount}`);

  // TODO: Call payment service to process refund
}

/**
 * Notify Ops of compensation failure
 */
async function notifyCompensationFailed(action: any): Promise<void> {
  await pool.query(
    `INSERT INTO system_notifications (channel, severity, title, message, payload)
     VALUES ('ops', 'critical', 'Compensation Action Failed', $1, $2)`,
    [
      `Compensation ${action.id} (${action.action_type}) failed after ${action.max_attempts} attempts`,
      JSON.stringify({ action_id: action.id, adjustment_id: action.adjustment_id, error: action.last_error }),
    ]
  );
}

/**
 * Run compensation worker loop
 */
export async function runCompensationWorker(): Promise<void> {
  console.log('🔄 Starting Compensation Worker');

  while (true) {
    try {
      await processCompensations(50);
    } catch (error: any) {
      console.error('Compensation worker error:', error);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Run if executed directly
if (require.main === module) {
  runCompensationWorker().catch(err => {
    console.error('Fatal compensation worker error:', err);
    process.exit(1);
  });
}
