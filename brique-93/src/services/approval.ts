// Approval Service
// Multi-signature approval system for batch plans

import { pool, withTransaction } from '../utils/db';

interface ApprovalRequest {
  entity_type: string;
  entity_id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  signature?: string;
}

/**
 * Approval Service
 */
export class ApprovalService {
  /**
   * Add approval to an entity
   */
  async addApproval(request: ApprovalRequest): Promise<{
    success: boolean;
    is_complete: boolean;
    approvals_count: number;
    required_count: number;
  }> {
    return withTransaction(async (client) => {
      // 1. Get approval record
      const { rows: approvals } = await client.query(
        `SELECT * FROM approvals
         WHERE entity_type = $1
           AND entity_id = $2
           AND status = 'pending'
         FOR UPDATE`,
        [request.entity_type, request.entity_id]
      );

      if (approvals.length === 0) {
        throw new Error('No pending approval found');
      }

      const approval = approvals[0];

      // 2. Check if already approved by this actor
      const existing_approvals = approval.approvals || [];
      const already_approved = existing_approvals.some(
        (a: any) => a.actor_id === request.actor_id
      );

      if (already_approved) {
        throw new Error('Actor has already approved');
      }

      // 3. Check role requirement
      if (approval.required_roles && approval.required_roles.length > 0) {
        if (!approval.required_roles.includes(request.actor_role)) {
          throw new Error(`Role ${request.actor_role} not authorized to approve`);
        }
      }

      // 4. Add approval
      const new_approval = {
        actor_id: request.actor_id,
        actor_name: request.actor_name,
        role: request.actor_role,
        approved_at: new Date().toISOString(),
        signature: request.signature || null
      };

      const updated_approvals = [...existing_approvals, new_approval];

      // 5. Update approval record
      await client.query(
        `UPDATE approvals
         SET approvals = $1::jsonb,
             updated_at = now()
         WHERE id = $2`,
        [JSON.stringify(updated_approvals), approval.id]
      );

      // 6. Check if complete
      const is_complete = updated_approvals.length >= approval.required_count;

      if (is_complete) {
        await client.query(
          `UPDATE approvals
           SET status = 'approved',
               updated_at = now()
           WHERE id = $1`,
          [approval.id]
        );

        // Update entity status if it's a batch_plan
        if (request.entity_type === 'batch_plan') {
          await client.query(
            `UPDATE payout_batch_plans
             SET status = 'approved',
                 approved_at = now(),
                 updated_at = now()
             WHERE id = $1`,
            [request.entity_id]
          );
        }
      }

      console.log(`[Approval] Actor ${request.actor_name} approved ${request.entity_type}:${request.entity_id} (${updated_approvals.length}/${approval.required_count})`);

      return {
        success: true,
        is_complete,
        approvals_count: updated_approvals.length,
        required_count: approval.required_count
      };
    });
  }

  /**
   * Reject an approval
   */
  async rejectApproval(
    entity_type: string,
    entity_id: string,
    rejected_by: string,
    reason: string
  ): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE approvals
         SET status = 'rejected',
             rejected_by = $3,
             rejected_at = now(),
             rejection_reason = $4,
             updated_at = now()
         WHERE entity_type = $1
           AND entity_id = $2
           AND status = 'pending'`,
        [entity_type, entity_id, rejected_by, reason]
      );

      // Update entity status
      if (entity_type === 'batch_plan') {
        await client.query(
          `UPDATE payout_batch_plans
           SET status = 'rejected',
               notes = COALESCE(notes, '') || ' | Rejected: ' || $2
           WHERE id = $1`,
          [entity_id, reason]
        );
      }
    });

    console.log(`[Approval] Rejected ${entity_type}:${entity_id} by ${rejected_by}: ${reason}`);
  }

  /**
   * Get approval status
   */
  async getApprovalStatus(entity_type: string, entity_id: string): Promise<{
    status: string;
    approvals: any[];
    required_count: number;
    is_complete: boolean;
  } | null> {
    const { rows } = await pool.query(
      `SELECT * FROM approvals
       WHERE entity_type = $1
         AND entity_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [entity_type, entity_id]
    );

    if (rows.length === 0) {
      return null;
    }

    const approval = rows[0];
    const approvals_array = approval.approvals || [];

    return {
      status: approval.status,
      approvals: approvals_array,
      required_count: approval.required_count,
      is_complete: approvals_array.length >= approval.required_count
    };
  }
}

export default new ApprovalService();
