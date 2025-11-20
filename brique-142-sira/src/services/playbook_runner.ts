/**
 * BRIQUE 142-SIRA — Playbook Runner
 * Safe execution of playbook actions with idempotency
 */

import { pool } from '../db';

/**
 * Execute a single action from a playbook
 * All actions must be idempotent and safe-guarded
 */
export async function executeAction(
  playbookId: string,
  action: any,
  executionId: string
): Promise<any> {
  const idempotency = `${executionId}:${playbookId}:${JSON.stringify(action)}`;

  // Whitelist of allowed actions
  switch (action.action) {
    case 'create_alert':
      return await createAlertAction(action, idempotency);

    case 'freeze_accounts_by_list':
      return await freezeAccountsAction(action, idempotency);

    case 'escalate_ops':
      return await escalateOpsAction(action, idempotency);

    case 'notify_ops':
      return await notifyOpsAction(action, idempotency);

    case 'pause_bank':
      return await pauseBankAction(action, idempotency);

    case 'reverse_transaction':
      return await reverseTransactionAction(action, idempotency);

    default:
      throw new Error(`unsupported_action: ${action.action}`);
  }
}

/**
 * Create alert action
 */
async function createAlertAction(action: any, idempotency: string) {
  await pool.query(
    `INSERT INTO molam_audit_logs(actor, action, target_type, details)
     VALUES ($1, $2, $3, $4)`,
    [null, 'generated_alert', 'playbook', {
      severity: action.params?.severity || 'info',
      message: action.params?.message || 'Alert from playbook',
      idempotency,
    }]
  );

  // In production: actually insert into alerts table
  // await pool.query(`INSERT INTO alerts(type, severity, message, metadata) VALUES ...`);

  return { ok: true, action: 'create_alert' };
}

/**
 * Freeze accounts action
 */
async function freezeAccountsAction(action: any, idempotency: string) {
  // Dry run mode - don't actually freeze
  if (action.params?.dry_run) {
    return {
      dry_run: true,
      would_freeze_count: action.params?.list?.length || 0,
      reason: action.params?.reason || 'unspecified',
    };
  }

  // In production: call account service to freeze accounts
  // const accountIds = action.params?.list || [];
  // await freezeAccountsService(accountIds, { reason: action.params.reason, idempotency });

  await pool.query(
    `INSERT INTO molam_audit_logs(actor, action, target_type, details)
     VALUES ($1, $2, $3, $4)`,
    [null, 'freeze_accounts', 'accounts', {
      count: action.params?.list?.length || 0,
      reason: action.params?.reason,
      idempotency,
    }]
  );

  return {
    ok: true,
    action: 'freeze_accounts',
    count: action.params?.list?.length || 0,
  };
}

/**
 * Escalate to ops team
 */
async function escalateOpsAction(action: any, idempotency: string) {
  const team = action.params?.team || ['ops'];

  await pool.query(
    `INSERT INTO molam_audit_logs(actor, action, target_type, details)
     VALUES ($1, $2, $3, $4)`,
    [null, 'escalate_ops', 'team', {
      team,
      idempotency,
    }]
  );

  // In production: send notifications to team
  // await sendNotifications(team, { ... });

  return { ok: true, action: 'escalate_ops', team };
}

/**
 * Notify ops team
 */
async function notifyOpsAction(action: any, idempotency: string) {
  const team = action.params?.team || ['ops'];

  await pool.query(
    `INSERT INTO molam_audit_logs(actor, action, target_type, details)
     VALUES ($1, $2, $3, $4)`,
    [null, 'notify_ops', 'team', {
      team,
      idempotency,
    }]
  );

  return { ok: true, action: 'notify_ops', team };
}

/**
 * Pause bank action
 */
async function pauseBankAction(action: any, idempotency: string) {
  // Dry run mode
  if (action.params?.dry_run) {
    return {
      dry_run: true,
      would_pause_bank: action.params?.bank_id,
    };
  }

  await pool.query(
    `INSERT INTO molam_audit_logs(actor, action, target_type, details)
     VALUES ($1, $2, $3, $4)`,
    [null, 'pause_bank', 'bank', {
      bank_id: action.params?.bank_id,
      reason: action.params?.reason,
      idempotency,
    }]
  );

  return { ok: true, action: 'pause_bank', bank_id: action.params?.bank_id };
}

/**
 * Reverse transaction action
 */
async function reverseTransactionAction(action: any, idempotency: string) {
  // Dry run mode
  if (action.params?.dry_run) {
    return {
      dry_run: true,
      would_reverse_txn: action.params?.transaction_id,
    };
  }

  await pool.query(
    `INSERT INTO molam_audit_logs(actor, action, target_type, details)
     VALUES ($1, $2, $3, $4)`,
    [null, 'reverse_transaction', 'transaction', {
      transaction_id: action.params?.transaction_id,
      reason: action.params?.reason,
      idempotency,
    }]
  );

  return {
    ok: true,
    action: 'reverse_transaction',
    transaction_id: action.params?.transaction_id,
  };
}
