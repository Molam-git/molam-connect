// Payout Service
// Core business logic for payout creation and management

import { pool, withTransaction } from '../utils/db';
import { calculatePayoutFees } from './fee-calculator';
import { pickRouting, requiresApproval } from './sira-router';
import { createLedgerHold } from './ledger-client';
import { v4 as uuid v4 } from 'uuid';

export interface CreatePayoutRequest {
  external_id?: string; // idempotency key
  origin_module: string;
  origin_entity_id: string;
  amount: number;
  currency: string;
  beneficiary: any;
  priority?: 'normal' | 'priority' | 'instant';
  scheduled_for?: Date;
  created_by?: string;
  metadata?: any;
}

export interface PayoutResult {
  id: string;
  external_id: string;
  status: string;
  amount: number;
  currency: string;
  molam_fee: number;
  bank_fee: number;
  total_debited: number;
  priority: string;
  hold_id?: string;
  requires_approval?: boolean;
  approval_count?: number;
}

/**
 * Create new payout with ledger hold
 */
export async function createPayout(request: CreatePayoutRequest): Promise<PayoutResult> {
  const external_id = request.external_id || `payout-${uuidv4()}`;

  // Check idempotency
  const existing = await getPayoutByExternalId(external_id);
  if (existing) {
    console.log(`Returning existing payout for idempotency key: ${external_id}`);
    return existing;
  }

  // Calculate fees
  const fees = await calculatePayoutFees({
    origin_module: request.origin_module,
    currency: request.currency,
    amount: request.amount,
    priority: request.priority || 'normal',
  });

  // Check approval requirements
  const approvalCheck = await requiresApproval({
    currency: request.currency,
    amount: request.amount,
    priority: request.priority || 'normal',
    beneficiary: request.beneficiary,
    origin_module: request.origin_module,
    origin_entity_id: request.origin_entity_id,
  });

  // Use transaction to ensure atomicity
  return await withTransaction(async (client) => {
    // Create ledger hold
    const holdRef = `payout-hold:${external_id}`;
    const holdResult = await createLedgerHold({
      account_id: request.origin_entity_id,
      amount: fees.total_debited,
      currency: request.currency,
      reference: holdRef,
      reason: 'payout_creation',
    });

    if (!holdResult.success) {
      throw new Error(`Failed to create ledger hold: ${holdResult.error}`);
    }

    // Insert payout record
    const { rows } = await client.query(
      `INSERT INTO payouts (
        external_id, origin_module, origin_entity_id,
        amount, currency, beneficiary,
        molam_fee, bank_fee, total_debited,
        priority, scheduled_for, status,
        requires_approval, approval_required,
        ledger_hold_id, created_by, metadata,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), now()
      ) RETURNING *`,
      [
        external_id,
        request.origin_module,
        request.origin_entity_id,
        request.amount,
        request.currency,
        JSON.stringify(request.beneficiary),
        fees.molam_fee,
        fees.estimated_bank_fee,
        fees.total_debited,
        request.priority || 'normal',
        request.scheduled_for || null,
        approvalCheck.requires_approval ? 'held' : 'created',
        approvalCheck.requires_approval,
        approvalCheck.approval_count || 0,
        holdResult.hold_id,
        request.created_by || null,
        JSON.stringify(request.metadata || {}),
      ]
    );

    const payout = rows[0];

    // If requires approval, set hold reason
    if (approvalCheck.requires_approval) {
      await client.query(
        `UPDATE payouts
         SET hold_reason = $2, hold_approval_required = $3
         WHERE id = $1`,
        [payout.id, approvalCheck.reason, approvalCheck.approval_count]
      );
    }

    console.log(`✅ Created payout ${payout.id} (${external_id})`);

    return {
      id: payout.id,
      external_id: payout.external_id,
      status: payout.status,
      amount: parseFloat(payout.amount),
      currency: payout.currency,
      molam_fee: parseFloat(payout.molam_fee),
      bank_fee: parseFloat(payout.bank_fee),
      total_debited: parseFloat(payout.total_debited),
      priority: payout.priority,
      hold_id: holdResult.hold_id,
      requires_approval: approvalCheck.requires_approval,
      approval_count: approvalCheck.approval_count,
    };
  });
}

/**
 * Get payout by external ID (for idempotency)
 */
export async function getPayoutByExternalId(external_id: string): Promise<PayoutResult | null> {
  const { rows } = await pool.query(
    `SELECT * FROM payouts WHERE external_id = $1`,
    [external_id]
  );

  if (rows.length === 0) {
    return null;
  }

  const payout = rows[0];

  return {
    id: payout.id,
    external_id: payout.external_id,
    status: payout.status,
    amount: parseFloat(payout.amount),
    currency: payout.currency,
    molam_fee: parseFloat(payout.molam_fee),
    bank_fee: parseFloat(payout.bank_fee),
    total_debited: parseFloat(payout.total_debited),
    priority: payout.priority,
    hold_id: payout.ledger_hold_id,
    requires_approval: payout.requires_approval,
    approval_count: payout.approval_count,
  };
}

/**
 * Get payout by ID
 */
export async function getPayoutById(id: string): Promise<any | null> {
  const { rows } = await pool.query(
    `SELECT * FROM payouts WHERE id = $1`,
    [id]
  );

  return rows[0] || null;
}

/**
 * Approve payout
 */
export async function approvePayout(
  payout_id: string,
  approver_id: string,
  approver_role: string,
  comment?: string
): Promise<{ success: boolean; approved: boolean; error?: string }> {
  try {
    await pool.query('BEGIN');

    // Get payout
    const { rows: payoutRows } = await pool.query(
      `SELECT * FROM payouts WHERE id = $1 FOR UPDATE`,
      [payout_id]
    );

    if (payoutRows.length === 0) {
      await pool.query('ROLLBACK');
      return { success: false, approved: false, error: 'Payout not found' };
    }

    const payout = payoutRows[0];

    // Check if already approved by this user
    if (payout.approved_by && payout.approved_by.includes(approver_id)) {
      await pool.query('ROLLBACK');
      return { success: false, approved: false, error: 'Already approved by this user' };
    }

    // Record approval
    await pool.query(
      `INSERT INTO payout_hold_approvals (payout_id, approver_id, role, action, comment, approved_at)
       VALUES ($1, $2, $3, 'approve_release', $4, now())`,
      [payout_id, approver_id, approver_role, comment || null]
    );

    // Update payout
    const newApprovedBy = [...(payout.approved_by || []), approver_id];
    const newApprovalCount = newApprovedBy.length;

    await pool.query(
      `UPDATE payouts
       SET approved_by = $2, approval_count = $3, updated_at = now()
       WHERE id = $1`,
      [payout_id, newApprovedBy, newApprovalCount]
    );

    // Check if enough approvals
    const approved = newApprovalCount >= (payout.approval_required || 0);

    // If approved, release hold and change status to created
    if (approved && payout.status === 'held') {
      await pool.query(
        `UPDATE payouts
         SET status = 'created', hold_reason = NULL, updated_at = now()
         WHERE id = $1`,
        [payout_id]
      );

      console.log(`✅ Payout ${payout_id} fully approved and released to queue`);
    }

    await pool.query('COMMIT');

    return {
      success: true,
      approved,
    };
  } catch (error: any) {
    await pool.query('ROLLBACK');
    console.error('Error approving payout:', error);
    return {
      success: false,
      approved: false,
      error: error.message,
    };
  }
}

/**
 * Cancel payout
 */
export async function cancelPayout(
  payout_id: string,
  reason: string,
  cancelled_by?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const payout = await getPayoutById(payout_id);

    if (!payout) {
      return { success: false, error: 'Payout not found' };
    }

    // Can only cancel if in created, held, or queued status
    if (!['created', 'held', 'queued'].includes(payout.status)) {
      return {
        success: false,
        error: `Cannot cancel payout with status: ${payout.status}`,
      };
    }

    // Update status
    await pool.query(
      `UPDATE payouts
       SET status = 'cancelled', updated_at = now(),
           metadata = metadata || jsonb_build_object('cancellation_reason', $2, 'cancelled_by', $3, 'cancelled_at', now())
       WHERE id = $1`,
      [payout_id, reason, cancelled_by || null]
    );

    // Release ledger hold
    if (payout.ledger_hold_id) {
      // This would call ledger service to release hold
      console.log(`Releasing ledger hold ${payout.ledger_hold_id} for cancelled payout`);
    }

    console.log(`✅ Cancelled payout ${payout_id}`);

    return { success: true };
  } catch (error: any) {
    console.error('Error cancelling payout:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * List payouts with filters
 */
export async function listPayouts(filters: {
  status?: string;
  origin_module?: string;
  currency?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  let query = `SELECT * FROM payouts WHERE 1=1`;
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.status) {
    query += ` AND status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  if (filters.origin_module) {
    query += ` AND origin_module = $${paramIndex}`;
    params.push(filters.origin_module);
    paramIndex++;
  }

  if (filters.currency) {
    query += ` AND currency = $${paramIndex}`;
    params.push(filters.currency);
    paramIndex++;
  }

  if (filters.priority) {
    query += ` AND priority = $${paramIndex}`;
    params.push(filters.priority);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC`;
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(filters.limit || 50, filters.offset || 0);

  const { rows } = await pool.query(query, params);

  return rows;
}
