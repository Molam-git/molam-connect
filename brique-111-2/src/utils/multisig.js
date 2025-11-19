/**
 * Brique 111-2: Multi-Signature Approval Logic
 * Core multisig approval workflow for AI recommendations
 */

const { signWithHSM } = require('./hsm');

let pool;

function setPool(pgPool) {
  pool = pgPool;
}

/**
 * Get multisig policy for a target type and priority
 */
async function getPolicy(targetType, priority) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM multisig_policies WHERE target_type = $1 AND priority = $2`,
      [targetType, priority]
    );

    if (rows.length === 0) {
      // Return default policy if none configured
      return {
        target_type: targetType,
        priority: priority,
        required_signatures: 2,
        approver_roles: ['ops', 'pay_admin'],
        auto_apply_threshold: 0.95,
        auto_apply_allowed: false
      };
    }

    return rows[0];
  } catch (error) {
    console.error('Failed to get multisig policy:', error);
    throw error;
  }
}

/**
 * Check if user has required role for approval
 */
function hasRequiredRole(userRoles, allowedRoles) {
  if (!Array.isArray(userRoles) || !Array.isArray(allowedRoles)) {
    return false;
  }

  return userRoles.some(role => allowedRoles.includes(role));
}

/**
 * Add an approval or rejection vote
 */
async function addApproval(recommendationId, approverId, approverRoles, decision, comment = null) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get recommendation
    const { rows: recRows } = await client.query(
      `SELECT * FROM config_recommendations WHERE id = $1`,
      [recommendationId]
    );

    if (recRows.length === 0) {
      throw new Error('recommendation_not_found');
    }

    const rec = recRows[0];

    // Check if recommendation is in a state that allows voting
    if (!['proposed', 'awaiting_approvals'].includes(rec.status)) {
      throw new Error('recommendation_not_votable');
    }

    // Get policy
    const policy = await getPolicy(rec.target_type, rec.priority);

    if (!policy) {
      throw new Error('policy_not_found');
    }

    // Check if user has required role
    if (!hasRequiredRole(approverRoles, policy.approver_roles)) {
      throw new Error('insufficient_permissions');
    }

    // Create approval signature
    const signature = await createApprovalSignature(recommendationId, approverId, decision);

    // Insert or update approval (upsert)
    await client.query(
      `INSERT INTO config_approvals(
        recommendation_id,
        approver_user_id,
        approver_roles,
        decision,
        comment,
        signature
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (recommendation_id, approver_user_id)
      DO UPDATE SET
        decision = EXCLUDED.decision,
        comment = EXCLUDED.comment,
        signature = EXCLUDED.signature,
        created_at = now()`,
      [recommendationId, approverId, approverRoles, decision, comment, signature]
    );

    // Handle rejection
    if (decision === 'reject') {
      await client.query(
        `UPDATE config_recommendations
         SET status = 'rejected', updated_at = now()
         WHERE id = $1`,
        [recommendationId]
      );

      await client.query(
        `INSERT INTO config_recommendation_audit(
          recommendation_id,
          actor,
          action_taken,
          details
        ) VALUES ($1, $2, 'reject', $3)`,
        [recommendationId, approverId, { comment, roles: approverRoles }]
      );

      await client.query('COMMIT');
      return { status: 'rejected', decision: 'reject' };
    }

    // Count approvals
    const { rows: approvalRows } = await client.query(
      `SELECT approver_user_id, approver_roles
       FROM config_approvals
       WHERE recommendation_id = $1 AND decision = 'approve'`,
      [recommendationId]
    );

    // Count unique signers with valid roles
    const uniqueSigners = new Set();
    approvalRows.forEach(approval => {
      const roles = approval.approver_roles || [];
      if (hasRequiredRole(roles, policy.approver_roles)) {
        uniqueSigners.add(approval.approver_user_id);
      }
    });

    const countSignatures = uniqueSigners.size;

    // Check if we have enough signatures
    if (countSignatures >= policy.required_signatures) {
      // Mark as approved
      await client.query(
        `UPDATE config_recommendations
         SET status = 'approved', updated_at = now()
         WHERE id = $1`,
        [recommendationId]
      );

      await client.query(
        `INSERT INTO config_recommendation_audit(
          recommendation_id,
          actor,
          action_taken,
          details
        ) VALUES ($1, $2, 'approve', $3)`,
        [recommendationId, approverId, { count_signatures: countSignatures, required: policy.required_signatures }]
      );

      await client.query('COMMIT');
      return {
        status: 'approved',
        approvals: countSignatures,
        required: policy.required_signatures
      };
    }

    // Still waiting for more approvals
    await client.query(
      `UPDATE config_recommendations
       SET status = 'awaiting_approvals', updated_at = now()
       WHERE id = $1`,
      [recommendationId]
    );

    await client.query('COMMIT');

    return {
      status: 'pending',
      approvals: countSignatures,
      required: policy.required_signatures
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add approval error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create cryptographic signature for approval
 */
async function createApprovalSignature(recommendationId, approverId, decision) {
  const payload = {
    rec: recommendationId,
    approver: approverId,
    decision: decision,
    iat: Math.floor(Date.now() / 1000)
  };

  // Use HSM to sign
  const token = await signWithHSM(payload);
  return token;
}

/**
 * Check if recommendation can be auto-applied based on policy
 */
async function canAutoApply(targetType, priority, confidence) {
  try {
    const policy = await getPolicy(targetType, priority);

    if (!policy || !policy.auto_apply_allowed) {
      return false;
    }

    if (Number(confidence) < Number(policy.auto_apply_threshold)) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Check auto-apply error:', error);
    return false;
  }
}

/**
 * Get approval status for a recommendation
 */
async function getApprovalStatus(recommendationId) {
  try {
    // Get recommendation
    const { rows: recRows } = await pool.query(
      `SELECT * FROM config_recommendations WHERE id = $1`,
      [recommendationId]
    );

    if (recRows.length === 0) {
      throw new Error('recommendation_not_found');
    }

    const rec = recRows[0];

    // Get policy
    const policy = await getPolicy(rec.target_type, rec.priority);

    // Get approvals
    const { rows: approvals } = await pool.query(
      `SELECT * FROM config_approvals WHERE recommendation_id = $1 ORDER BY created_at DESC`,
      [recommendationId]
    );

    // Count approves and rejects
    const approveCount = approvals.filter(a => a.decision === 'approve').length;
    const rejectCount = approvals.filter(a => a.decision === 'reject').length;

    return {
      recommendation_id: recommendationId,
      status: rec.status,
      approvals: approveCount,
      rejections: rejectCount,
      required_signatures: policy.required_signatures,
      approver_roles: policy.approver_roles,
      approval_list: approvals.map(a => ({
        approver_id: a.approver_user_id,
        decision: a.decision,
        comment: a.comment,
        created_at: a.created_at
      }))
    };
  } catch (error) {
    console.error('Get approval status error:', error);
    throw error;
  }
}

/**
 * Acquire lock for recommendation to prevent concurrent apply
 */
async function acquireLock(recommendationId, userId) {
  try {
    await pool.query(
      `INSERT INTO recommendation_locks(recommendation_id, locked_by, locked_at)
       VALUES ($1, $2, now())
       ON CONFLICT (recommendation_id) DO NOTHING`,
      [recommendationId, userId]
    );

    // Check if we got the lock
    const { rows } = await pool.query(
      `SELECT locked_by FROM recommendation_locks WHERE recommendation_id = $1`,
      [recommendationId]
    );

    if (rows.length === 0 || rows[0].locked_by !== userId) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Acquire lock error:', error);
    return false;
  }
}

/**
 * Release lock for recommendation
 */
async function releaseLock(recommendationId) {
  try {
    await pool.query(
      `DELETE FROM recommendation_locks WHERE recommendation_id = $1`,
      [recommendationId]
    );
    return true;
  } catch (error) {
    console.error('Release lock error:', error);
    return false;
  }
}

/**
 * List all multisig policies
 */
async function listPolicies() {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM multisig_policies ORDER BY target_type, priority`
    );
    return rows;
  } catch (error) {
    console.error('List policies error:', error);
    throw error;
  }
}

/**
 * Update multisig policy
 */
async function updatePolicy(targetType, priority, updates) {
  try {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.required_signatures !== undefined) {
      fields.push(`required_signatures = $${paramIndex++}`);
      values.push(updates.required_signatures);
    }

    if (updates.approver_roles !== undefined) {
      fields.push(`approver_roles = $${paramIndex++}`);
      values.push(updates.approver_roles);
    }

    if (updates.auto_apply_threshold !== undefined) {
      fields.push(`auto_apply_threshold = $${paramIndex++}`);
      values.push(updates.auto_apply_threshold);
    }

    if (updates.auto_apply_allowed !== undefined) {
      fields.push(`auto_apply_allowed = $${paramIndex++}`);
      values.push(updates.auto_apply_allowed);
    }

    if (fields.length === 0) {
      throw new Error('no_fields_to_update');
    }

    fields.push(`updated_at = now()`);
    values.push(targetType, priority);

    const query = `
      UPDATE multisig_policies
      SET ${fields.join(', ')}
      WHERE target_type = $${paramIndex++} AND priority = $${paramIndex++}
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      throw new Error('policy_not_found');
    }

    return rows[0];
  } catch (error) {
    console.error('Update policy error:', error);
    throw error;
  }
}

module.exports = {
  setPool,
  getPolicy,
  hasRequiredRole,
  addApproval,
  canAutoApply,
  getApprovalStatus,
  acquireLock,
  releaseLock,
  listPolicies,
  updatePolicy
};
