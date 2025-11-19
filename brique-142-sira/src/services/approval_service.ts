/**
 * BRIQUE 142-SIRA — Approval Service
 * Multi-signature approval workflow with threshold evaluation
 */

import { pool } from '../db';
import { publishEvent } from '../webhooks/publisher';

export async function createApprovalRequest(
  reqType: string,
  referenceId: string | undefined,
  requestedBy: string,
  policyId: string,
  metadata: any
) {
  const { rows: [policy] } = await pool.query(
    `SELECT * FROM approval_policies WHERE id=$1`,
    [policyId]
  );

  if (!policy) {
    throw new Error('policy_not_found');
  }

  const { rows: [r] } = await pool.query(
    `INSERT INTO approval_requests (request_type, reference_id, requested_by, policy_id, required_threshold, metadata)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [reqType, referenceId || null, requestedBy, policyId, policy.threshold_value, metadata || {}]
  );

  await pool.query(
    `INSERT INTO molam_audit_logs(actor, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [requestedBy, 'approval.request.created', reqType, r.id, { policy: policyId }]
  );

  await publishEvent('internal', 'ops', 'approval.request.created', {
    request_id: r.id,
    request_type: reqType,
  });

  return r;
}

export async function signApprovalRequest(
  approvalRequestId: string,
  signerUserId: string,
  signerRoles: string[],
  comment?: string
) {
  const { rows: [req] } = await pool.query(
    `SELECT ar.*, ap.require_roles, ap.threshold_type, ap.threshold_value
     FROM approval_requests ar
     JOIN approval_policies ap ON ap.id = ar.policy_id
     WHERE ar.id = $1`,
    [approvalRequestId]
  );

  if (!req) {
    throw new Error('approval_request_not_found');
  }

  if (req.status !== 'open') {
    throw new Error('approval_request_not_open');
  }

  // Insert signature (unique constraint prevents duplicates)
  await pool.query(
    `INSERT INTO approval_signatures(approval_request_id, signer_user_id, signer_roles, comment)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [approvalRequestId, signerUserId, signerRoles, comment || null]
  );

  await pool.query(
    `INSERT INTO molam_audit_logs(actor, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [signerUserId, 'approval.signature.added', 'approval_request', approvalRequestId, {
      roles: signerRoles,
      comment,
    }]
  );

  // Evaluate quorum
  const { rows: sigs } = await pool.query(
    `SELECT signer_user_id, signer_roles FROM approval_signatures WHERE approval_request_id = $1`,
    [approvalRequestId]
  );

  const thresholdReached = evaluateThreshold(sigs, req);

  if (thresholdReached) {
    // Mark approved & emit event
    await pool.query(
      `UPDATE approval_requests SET status = 'approved' WHERE id = $1`,
      [approvalRequestId]
    );

    await pool.query(
      `INSERT INTO molam_audit_logs(actor, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [signerUserId, 'approval.request.approved', 'approval_request', approvalRequestId, {
        by: signerUserId,
      }]
    );

    await publishEvent('internal', 'ops', 'approval.request.approved', {
      request_id: approvalRequestId,
    });
  }

  return { ok: true, thresholdReached };
}

/**
 * Evaluate if approval threshold is reached
 */
function evaluateThreshold(sigs: any[], policy: any): boolean {
  if (policy.threshold_type === 'absolute') {
    return sigs.length >= Number(policy.threshold_value);
  } else if (policy.threshold_type === 'percent') {
    // Percent: count unique signers with allowed roles / total required roles
    const requiredRoles = policy.require_roles || [];
    const presentRoles = new Set<string>();
    sigs.forEach((s) =>
      (s.signer_roles || []).forEach((r: string) => presentRoles.add(r))
    );
    const matched = requiredRoles.filter((r: string) => presentRoles.has(r)).length;
    const frac = requiredRoles.length === 0 ? 0 : matched / requiredRoles.length;
    return frac >= Number(policy.threshold_value);
  }

  return false;
}

/**
 * Reject approval request
 */
export async function rejectApprovalRequest(
  approvalRequestId: string,
  rejectorUserId: string,
  reason: string
) {
  await pool.query(
    `UPDATE approval_requests SET status = 'rejected' WHERE id = $1`,
    [approvalRequestId]
  );

  await pool.query(
    `INSERT INTO molam_audit_logs(actor, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [rejectorUserId, 'approval.request.rejected', 'approval_request', approvalRequestId, {
      reason,
    }]
  );

  await publishEvent('internal', 'ops', 'approval.request.rejected', {
    request_id: approvalRequestId,
    reason,
  });
}
