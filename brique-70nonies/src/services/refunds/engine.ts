/**
 * Brique 70nonies - Refund Engine
 * Core idempotent refund operations with SIRA ML integration
 */

import pool from '../../db';
import { callSiraRefundEval, recordSiraFeedback, SiraRefundDecision } from './sira';

export interface InitiateRefundRequest {
  idempotencyKey: string;
  paymentId: string;
  userId: string;
  merchantId: string;
  requestedAmount: number;
  originalAmount: number;
  currency: string;
  reason?: string;
  originModule: string;
  requesterRole?: 'buyer' | 'merchant' | 'ops';
  ipAddress?: string;
  userAgent?: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  status?: string;
  decision?: SiraRefundDecision;
  error?: string;
  isDuplicate?: boolean;
}

/**
 * Initiate a refund request (idempotent)
 * This is the main entry point for all refund requests
 */
export async function initiateRefund(request: InitiateRefundRequest): Promise<RefundResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Idempotency check
    if (request.idempotencyKey) {
      const existing = await client.query(
        `SELECT id, status, decision FROM refund_requests
         WHERE idempotency_key = $1`,
        [request.idempotencyKey]
      );

      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        return {
          success: true,
          refundId: existing.rows[0].id,
          status: existing.rows[0].status,
          decision: existing.rows[0].decision,
          isDuplicate: true
        };
      }
    }

    // 2. Validate refund amount
    if (request.requestedAmount <= 0) {
      throw new Error('Refund amount must be positive');
    }

    if (request.requestedAmount > request.originalAmount) {
      throw new Error('Refund amount cannot exceed original payment amount');
    }

    // 3. Check for existing refunds on this payment
    const previousRefunds = await client.query(
      `SELECT COALESCE(SUM(requested_amount), 0) as total
       FROM refund_requests
       WHERE payment_id = $1 AND status IN ('refunded', 'approved', 'auto_approved', 'processing')`,
      [request.paymentId]
    );

    const totalPreviousRefunds = parseFloat(previousRefunds.rows[0].total);
    if (totalPreviousRefunds + request.requestedAmount > request.originalAmount) {
      throw new Error(`Total refunds would exceed original payment (already refunded: ${totalPreviousRefunds})`);
    }

    // 4. Create refund request record
    const refundResult = await client.query(
      `INSERT INTO refund_requests
       (payment_id, origin_module, requester_user_id, requester_role, requested_amount,
        original_payment_amount, currency, reason, status, merchant_id, idempotency_key, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        request.paymentId,
        request.originModule,
        request.userId,
        request.requesterRole || 'buyer',
        request.requestedAmount,
        request.originalAmount,
        request.currency,
        request.reason,
        request.merchantId,
        request.idempotencyKey
      ]
    );

    const refund = refundResult.rows[0];

    // 5. Create initial audit log
    await client.query(
      `INSERT INTO refund_audit
       (refund_id, actor_id, actor_role, action, payload, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, 'initiate', $4, $5, $6, NOW())`,
      [
        refund.id,
        request.userId,
        request.requesterRole || 'buyer',
        JSON.stringify({
          requestedAmount: request.requestedAmount,
          originalAmount: request.originalAmount,
          reason: request.reason
        }),
        request.ipAddress,
        request.userAgent
      ]
    );

    // 6. Call SIRA for risk evaluation
    const siraDecision = await callSiraRefundEval({
      paymentId: request.paymentId,
      userId: request.userId,
      merchantId: request.merchantId,
      requestedAmount: request.requestedAmount,
      originalAmount: request.originalAmount,
      currency: request.currency,
      reason: request.reason,
      originModule: request.originModule
    });

    // 7. Update refund with SIRA decision
    const newStatus = determineStatus(siraDecision);

    await client.query(
      `UPDATE refund_requests
       SET sira_score = $1, decision = $2, status = $3, kyc_check_required = $4, updated_at = NOW()
       WHERE id = $5`,
      [
        siraDecision.score,
        JSON.stringify(siraDecision),
        newStatus,
        siraDecision.requireKyc,
        refund.id
      ]
    );

    // 8. Audit SIRA decision
    await client.query(
      `INSERT INTO refund_audit
       (refund_id, actor_role, action, payload, created_at)
       VALUES ($1, 'system', 'sira_decision', $2, NOW())`,
      [refund.id, JSON.stringify(siraDecision)]
    );

    // 9. Create multi-sig approval request if needed
    if (siraDecision.requireMultiSig) {
      await client.query(
        `INSERT INTO refund_approvals
         (refund_id, required_approvers, status, created_at)
         VALUES ($1, $2, 'pending', NOW())`,
        [refund.id, ['ops_refunds', 'finance_ops']]
      );
    }

    // 10. Record feedback for SIRA training
    await recordSiraFeedback(
      refund.id,
      request.paymentId,
      request.userId,
      {
        requestedAmount: request.requestedAmount,
        originalAmount: request.originalAmount,
        reason: request.reason,
        originModule: request.originModule
      },
      siraDecision,
      'pending'
    );

    await client.query('COMMIT');

    console.log(`[REFUND_ENGINE] Refund ${refund.id} initiated with status: ${newStatus}, SIRA score: ${siraDecision.score}`);

    return {
      success: true,
      refundId: refund.id,
      status: newStatus,
      decision: siraDecision,
      isDuplicate: false
    };

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[REFUND_ENGINE] Error initiating refund:', error);

    return {
      success: false,
      error: error.message
    };
  } finally {
    client.release();
  }
}

/**
 * Approve a refund (manual or multi-sig)
 */
export async function approveRefund(
  refundId: string,
  approverId: string,
  approverRole: string,
  comments?: string
): Promise<RefundResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get refund
    const refund = await client.query(
      'SELECT * FROM refund_requests WHERE id = $1 FOR UPDATE',
      [refundId]
    );

    if (refund.rows.length === 0) {
      throw new Error('Refund not found');
    }

    const refundData = refund.rows[0];

    if (refundData.status !== 'manual_review' && refundData.status !== 'pending') {
      throw new Error(`Cannot approve refund in status: ${refundData.status}`);
    }

    // Check if multi-sig is required
    const multiSig = await client.query(
      'SELECT * FROM refund_approvals WHERE refund_id = $1 AND status = \'pending\'',
      [refundId]
    );

    if (multiSig.rows.length > 0) {
      // Handle multi-sig approval
      const approval = multiSig.rows[0];
      const approvals = approval.approvals || [];
      const requiredApprovers = approval.required_approvers;

      // Check if already approved by this role
      const alreadyApproved = approvals.some((a: any) => a.role === approverRole);
      if (!alreadyApproved) {
        // Add approval
        approvals.push({
          role: approverRole,
          userId: approverId,
          approvedAt: new Date().toISOString(),
          comments
        });

        await client.query(
          'UPDATE refund_approvals SET approvals = $1, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(approvals), approval.id]
        );

        // Check if all required approvers have approved
        const approvedRoles = approvals.map((a: any) => a.role);
        const allApproved = requiredApprovers.every((role: string) => approvedRoles.includes(role));

        if (allApproved) {
          // Mark approval as complete
          await client.query(
            'UPDATE refund_approvals SET status = \'approved\', resolved_at = NOW() WHERE id = $1',
            [approval.id]
          );

          // Update refund status
          await client.query(
            `UPDATE refund_requests
             SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
             WHERE id = $2`,
            [approverId, refundId]
          );
        } else {
          await client.query('COMMIT');
          return {
            success: true,
            refundId,
            status: 'multi_sig_pending',
            error: `Waiting for approvals from: ${requiredApprovers.filter((r: string) => !approvedRoles.includes(r)).join(', ')}`
          };
        }
      }
    } else {
      // Single approval
      await client.query(
        `UPDATE refund_requests
         SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [approverId, refundId]
      );
    }

    // Audit log
    await client.query(
      `INSERT INTO refund_audit
       (refund_id, actor_id, actor_role, action, payload, created_at)
       VALUES ($1, $2, $3, 'approve', $4, NOW())`,
      [refundId, approverId, approverRole, JSON.stringify({ comments })]
    );

    await client.query('COMMIT');

    console.log(`[REFUND_ENGINE] Refund ${refundId} approved by ${approverRole}`);

    return {
      success: true,
      refundId,
      status: 'approved'
    };

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[REFUND_ENGINE] Error approving refund:', error);

    return {
      success: false,
      error: error.message
    };
  } finally {
    client.release();
  }
}

/**
 * Reject a refund
 */
export async function rejectRefund(
  refundId: string,
  rejectorId: string,
  rejectorRole: string,
  reason: string
): Promise<RefundResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get refund
    const refund = await client.query(
      'SELECT status FROM refund_requests WHERE id = $1 FOR UPDATE',
      [refundId]
    );

    if (refund.rows.length === 0) {
      throw new Error('Refund not found');
    }

    const currentStatus = refund.rows[0].status;
    if (currentStatus === 'refunded' || currentStatus === 'processing') {
      throw new Error(`Cannot reject refund in status: ${currentStatus}`);
    }

    // Update status
    await client.query(
      'UPDATE refund_requests SET status = \'rejected\', updated_at = NOW() WHERE id = $1',
      [refundId]
    );

    // Audit log
    await client.query(
      `INSERT INTO refund_audit
       (refund_id, actor_id, actor_role, action, payload, created_at)
       VALUES ($1, $2, $3, 'reject', $4, NOW())`,
      [refundId, rejectorId, rejectorRole, JSON.stringify({ reason })]
    );

    // Record feedback
    await recordSiraFeedback(refundId, '', '', {}, {} as any, 'rejected');

    await client.query('COMMIT');

    console.log(`[REFUND_ENGINE] Refund ${refundId} rejected by ${rejectorRole}: ${reason}`);

    return {
      success: true,
      refundId,
      status: 'rejected'
    };

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[REFUND_ENGINE] Error rejecting refund:', error);

    return {
      success: false,
      error: error.message
    };
  } finally {
    client.release();
  }
}

/**
 * Get refund status and details
 */
export async function getRefundStatus(refundId: string): Promise<any> {
  const result = await pool.query(
    `SELECT r.*, a.approvals
     FROM refund_requests r
     LEFT JOIN refund_approvals a ON r.id = a.refund_id
     WHERE r.id = $1`,
    [refundId]
  );

  if (result.rows.length === 0) {
    throw new Error('Refund not found');
  }

  return result.rows[0];
}

/**
 * Get refunds pending manual review (for Ops queue)
 */
export async function getPendingRefunds(filters?: {
  merchantId?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
}): Promise<any[]> {
  let query = `
    SELECT r.*, COUNT(e.id) as evidence_count
    FROM refund_requests r
    LEFT JOIN refund_evidence e ON r.id = e.refund_id
    WHERE r.status IN ('manual_review', 'pending')
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (filters?.merchantId) {
    query += ` AND r.merchant_id = $${paramIndex++}`;
    params.push(filters.merchantId);
  }

  if (filters?.minAmount) {
    query += ` AND r.requested_amount >= $${paramIndex++}`;
    params.push(filters.minAmount);
  }

  if (filters?.maxAmount) {
    query += ` AND r.requested_amount <= $${paramIndex++}`;
    params.push(filters.maxAmount);
  }

  query += ' GROUP BY r.id ORDER BY r.created_at ASC';

  if (filters?.limit) {
    query += ` LIMIT $${paramIndex++}`;
    params.push(filters.limit);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Helper: Determine refund status from SIRA decision
 */
function determineStatus(decision: SiraRefundDecision): string {
  switch (decision.action) {
    case 'auto_approve':
      return 'auto_approved';
    case 'auto_reject':
      return 'rejected';
    case 'manual_review':
    default:
      return 'manual_review';
  }
}
