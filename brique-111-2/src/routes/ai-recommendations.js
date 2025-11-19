/**
 * Brique 111-2: AI Config Advisor - API Routes
 * REST endpoints for SIRA-powered configuration recommendations with multisig
 */

const express = require('express');
const crypto = require('crypto');
const multisig = require('../utils/multisig');

function createRecommendationsRouter(pool, executor) {
  const router = express.Router();

  // Initialize multisig module with pool
  multisig.setPool(pool);

  /**
   * Internal endpoint for SIRA to create recommendations
   * POST /api/ai-recommendations
   */
  router.post('/', async (req, res) => {
    try {
      const {
        merchantId,
        targetType,
        targetId,
        action,
        params,
        evidence,
        confidence,
        priority
      } = req.body;

      // Validate required fields
      if (!targetType || !action || !params || confidence === undefined) {
        return res.status(400).json({
          error: 'missing_required_fields',
          required: ['targetType', 'action', 'params', 'confidence']
        });
      }

      // Idempotency via evidence hash
      const evidenceHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(evidence || {}))
        .digest('hex');

      // Check for existing recommendation with same evidence
      const existing = await pool.query(
        `SELECT * FROM config_recommendations
         WHERE (merchant_id = $1 OR (merchant_id IS NULL AND $1 IS NULL))
           AND target_type = $2
           AND (params->>'evidence_hash') = $3
           AND status NOT IN ('rejected', 'rolled_back')`,
        [merchantId, targetType, evidenceHash]
      );

      if (existing.rows.length > 0) {
        return res.json(existing.rows[0]);
      }

      // Add evidence hash to params
      const paramsWithHash = {
        ...params,
        evidence_hash: evidenceHash
      };

      // Create new recommendation
      const { rows: [rec] } = await pool.query(
        `INSERT INTO config_recommendations(
          merchant_id,
          target_type,
          target_id,
          action,
          params,
          evidence,
          confidence,
          priority,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sira')
        RETURNING *`,
        [
          merchantId,
          targetType,
          targetId,
          action,
          paramsWithHash,
          evidence,
          confidence,
          priority || 'medium'
        ]
      );

      // Create audit entry
      await pool.query(
        `INSERT INTO config_recommendation_audit(
          recommendation_id,
          actor,
          action_taken,
          details
        ) VALUES ($1, 'sira', 'propose', $2)`,
        [rec.id, { evidence_hash: evidenceHash }]
      );

      // Notify ops
      await executor.publishEvent('ops', null, 'ai.recommendation.created', { rec });

      // Check multisig policy for auto-apply
      const canAutoApplyNow = await multisig.canAutoApply(targetType, priority || 'medium', confidence);

      if (canAutoApplyNow) {
        // Auto-apply in background
        setImmediate(async () => {
          try {
            // Create snapshot
            const snapshot = await executor.snapshotTarget(targetType, targetId, 'sira');
            await pool.query(
              `INSERT INTO config_snapshots(target_type, target_id, snapshot, created_by)
               VALUES ($1, $2, $3, 'sira')`,
              [targetType, targetId, snapshot]
            );

            // Execute recommendation
            const result = await executor.executeRecommendation(rec, 'sira');

            await pool.query(
              `UPDATE config_recommendations
               SET status = $2, updated_at = now()
               WHERE id = $1`,
              [rec.id, result.ok ? 'applied' : 'apply_failed']
            );

            await pool.query(
              `INSERT INTO config_recommendation_audit(
                recommendation_id,
                actor,
                action_taken,
                details
              ) VALUES ($1, 'sira', $2, $3)`,
              [rec.id, result.ok ? 'auto_apply' : 'apply_failed', result.details]
            );
          } catch (error) {
            console.error('Auto-apply failed:', error);
            await pool.query(
              `UPDATE config_recommendations
               SET status = 'apply_failed', updated_at = now()
               WHERE id = $1`,
              [rec.id]
            );
          }
        });

        res.status(201).json({ rec, auto_applied: true });
      } else {
        // Awaiting manual approvals
        await pool.query(
          `UPDATE config_recommendations
           SET status = 'awaiting_approvals', updated_at = now()
           WHERE id = $1`,
          [rec.id]
        );

        res.status(201).json({ rec, auto_applied: false, status: 'awaiting_approvals' });
      }
    } catch (error) {
      console.error('Create recommendation error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * List recommendations
   * GET /api/ai-recommendations
   */
  router.get('/', async (req, res) => {
    try {
      const {
        merchantId,
        status,
        priority,
        targetType,
        limit = 50,
        offset = 0
      } = req.query;

      let query = `
        SELECT
          r.*,
          count_approvals(r.id) as approval_count,
          requires_multisig_approval(r.id) as requires_multisig,
          can_auto_apply(r.id) as can_auto_apply
        FROM config_recommendations r
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (merchantId) {
        query += ` AND merchant_id = $${paramIndex++}`;
        params.push(merchantId);
      }

      if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
      }

      if (priority) {
        query += ` AND priority = $${paramIndex++}`;
        params.push(priority);
      }

      if (targetType) {
        query += ` AND target_type = $${paramIndex++}`;
        params.push(targetType);
      }

      query += `
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END,
          created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      params.push(limit, offset);

      const { rows } = await pool.query(query, params);

      res.json(rows);
    } catch (error) {
      console.error('List recommendations error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Get recommendation by ID
   * GET /api/ai-recommendations/:id
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const { rows } = await pool.query(
        `SELECT
          r.*,
          count_approvals(r.id) as approval_count,
          requires_multisig_approval(r.id) as requires_multisig,
          can_auto_apply(r.id) as can_auto_apply
        FROM config_recommendations r
        WHERE r.id = $1`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'not_found' });
      }

      res.json(rows[0]);
    } catch (error) {
      console.error('Get recommendation error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Approve or reject a recommendation (multisig)
   * POST /api/ai-recommendations/:id/approve
   * Body: { decision: 'approve'|'reject', comment: '...' }
   */
  router.post('/:id/approve', async (req, res) => {
    try {
      const { id } = req.params;
      const { decision = 'approve', comment } = req.body;
      const userId = req.user?.id || 'ops_user';
      const userRoles = req.user?.roles || ['ops']; // Default to ops role

      // Validate decision
      if (!['approve', 'reject'].includes(decision)) {
        return res.status(400).json({
          error: 'invalid_decision',
          message: 'Decision must be either "approve" or "reject"'
        });
      }

      // Add approval/rejection using multisig logic
      // This handles all the logic including updating status
      const result = await multisig.addApproval(id, userId, userRoles, decision, comment);

      res.json({
        ok: true,
        ...result
      });
    } catch (error) {
      console.error('Approve recommendation error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Apply a recommendation
   * POST /api/ai-recommendations/:id/apply
   */
  router.post('/:id/apply', async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id || 'ops_user';

      // Get recommendation
      const { rows: [rec] } = await pool.query(
        `SELECT * FROM config_recommendations WHERE id = $1`,
        [id]
      );

      if (!rec) {
        return res.status(404).json({ error: 'not_found' });
      }

      // Check status - must be 'approved' or 'awaiting_approvals'
      if (!['proposed', 'approved', 'awaiting_approvals'].includes(rec.status)) {
        return res.status(400).json({
          error: 'invalid_status',
          message: 'Recommendation has already been applied or rejected'
        });
      }

      // Check if has required signatures
      const { rows: [hasSignatures] } = await pool.query(
        `SELECT has_required_signatures($1) as has_sigs`,
        [id]
      );

      if (!hasSignatures.has_sigs && rec.status !== 'approved') {
        // Get approval status for error message
        const approvalStatus = await multisig.getApprovalStatus(id);

        return res.status(403).json({
          error: 'insufficient_approvals',
          message: `This recommendation requires ${approvalStatus.required_signatures} approvals`,
          current_approvals: approvalStatus.approvals,
          required: approvalStatus.required_signatures
        });
      }

      // Acquire lock to prevent concurrent apply
      const lockAcquired = await multisig.acquireLock(id, userId);

      if (!lockAcquired) {
        return res.status(409).json({
          error: 'locked',
          message: 'Another operation is in progress for this recommendation'
        });
      }

      try {
        // Execute the recommendation
        const result = await executor.executeRecommendation(rec, userId);

        // Update status
        await pool.query(
          `UPDATE config_recommendations
           SET status = $2, updated_at = now()
           WHERE id = $1`,
          [id, result.ok ? 'applied' : 'apply_failed']
        );

        // Create audit entry
        await pool.query(
          `INSERT INTO config_recommendation_audit(
            recommendation_id,
            actor,
            action_taken,
            details
          ) VALUES ($1, $2, $3, $4)`,
          [id, userId, result.ok ? 'apply' : 'apply_failed', result.details]
        );

        // Publish event
        await executor.publishEvent('ops', userId, 'ai.recommendation.applied', {
          recommendation_id: id,
          result
        });

        // Release lock
        await multisig.releaseLock(id);

        res.json({
          ok: result.ok,
          details: result.details,
          snapshot_id: result.snapshot_id
        });
      } catch (execError) {
        // Release lock on error
        await multisig.releaseLock(id);
        throw execError;
      }
    } catch (error) {
      console.error('Apply recommendation error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Rollback a recommendation
   * POST /api/ai-recommendations/:id/rollback
   */
  router.post('/:id/rollback', async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id || 'ops_user';

      // Get recommendation
      const { rows: [rec] } = await pool.query(
        `SELECT * FROM config_recommendations WHERE id = $1`,
        [id]
      );

      if (!rec) {
        return res.status(404).json({ error: 'not_found' });
      }

      if (rec.status !== 'applied') {
        return res.status(400).json({
          error: 'invalid_status',
          message: 'Only applied recommendations can be rolled back'
        });
      }

      // Find most recent snapshot for this target
      const { rows: [snapshot] } = await pool.query(
        `SELECT id FROM config_snapshots
         WHERE target_type = $1 AND target_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [rec.target_type, rec.target_id]
      );

      if (!snapshot) {
        return res.status(404).json({
          error: 'snapshot_not_found',
          message: 'No snapshot available for rollback'
        });
      }

      // Restore from snapshot
      await executor.restoreFromSnapshot(snapshot.id);

      // Update status
      await pool.query(
        `UPDATE config_recommendations
         SET status = 'rolled_back', updated_at = now()
         WHERE id = $1`,
        [id]
      );

      // Create audit entry
      await pool.query(
        `INSERT INTO config_recommendation_audit(
          recommendation_id,
          actor,
          action_taken,
          details
        ) VALUES ($1, $2, 'rollback', $3)`,
        [id, userId, { reason, snapshot_id: snapshot.id }]
      );

      // Publish event
      await executor.publishEvent('ops', userId, 'ai.recommendation.rolled_back', {
        recommendation_id: id,
        reason
      });

      res.json({ ok: true, snapshot_id: snapshot.id });
    } catch (error) {
      console.error('Rollback recommendation error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Reject a recommendation
   * POST /api/ai-recommendations/:id/reject
   */
  router.post('/:id/reject', async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id || 'ops_user';

      const { rows: [rec] } = await pool.query(
        `SELECT * FROM config_recommendations WHERE id = $1`,
        [id]
      );

      if (!rec) {
        return res.status(404).json({ error: 'not_found' });
      }

      if (!['proposed', 'approved'].includes(rec.status)) {
        return res.status(400).json({
          error: 'invalid_status',
          message: 'Only proposed or approved recommendations can be rejected'
        });
      }

      // Update status
      await pool.query(
        `UPDATE config_recommendations
         SET status = 'rejected', updated_at = now()
         WHERE id = $1`,
        [id]
      );

      // Create audit entry
      await pool.query(
        `INSERT INTO config_recommendation_audit(
          recommendation_id,
          actor,
          action_taken,
          details
        ) VALUES ($1, $2, 'reject', $3)`,
        [id, userId, { reason }]
      );

      res.json({ ok: true });
    } catch (error) {
      console.error('Reject recommendation error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Get evidence for a recommendation
   * GET /api/ai-recommendations/:id/evidence
   */
  router.get('/:id/evidence', async (req, res) => {
    try {
      const { id } = req.params;

      const { rows: [rec] } = await pool.query(
        `SELECT evidence FROM config_recommendations WHERE id = $1`,
        [id]
      );

      if (!rec) {
        return res.status(404).json({ error: 'not_found' });
      }

      res.json(rec.evidence || {});
    } catch (error) {
      console.error('Get evidence error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Get audit trail for a recommendation
   * GET /api/ai-recommendations/:id/audit
   */
  router.get('/:id/audit', async (req, res) => {
    try {
      const { id } = req.params;

      const { rows } = await pool.query(
        `SELECT * FROM config_recommendation_audit
         WHERE recommendation_id = $1
         ORDER BY created_at DESC`,
        [id]
      );

      res.json(rows);
    } catch (error) {
      console.error('Get audit trail error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Get recommendation metrics
   * GET /api/ai-recommendations/stats/metrics
   */
  router.get('/stats/metrics', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM v_recommendation_metrics`);
      res.json(rows);
    } catch (error) {
      console.error('Get metrics error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Get approval status for a recommendation
   * GET /api/ai-recommendations/:id/approvals
   */
  router.get('/:id/approvals', async (req, res) => {
    try {
      const { id } = req.params;

      const approvalStatus = await multisig.getApprovalStatus(id);

      res.json(approvalStatus);
    } catch (error) {
      console.error('Get approval status error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * List all multisig policies
   * GET /api/ai-recommendations/policies
   */
  router.get('/policies/list', async (req, res) => {
    try {
      const policies = await multisig.listPolicies();
      res.json(policies);
    } catch (error) {
      console.error('List policies error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Get specific policy
   * GET /api/ai-recommendations/policies/:targetType/:priority
   */
  router.get('/policies/:targetType/:priority', async (req, res) => {
    try {
      const { targetType, priority } = req.params;

      const policy = await multisig.getPolicy(targetType, priority);

      res.json(policy);
    } catch (error) {
      console.error('Get policy error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Update multisig policy (ops admin only)
   * PATCH /api/ai-recommendations/policies/:targetType/:priority
   */
  router.patch('/policies/:targetType/:priority', async (req, res) => {
    try {
      const { targetType, priority } = req.params;
      const updates = req.body;

      // Validate user role (should be ops admin)
      const userRoles = req.user?.roles || [];
      if (!userRoles.includes('pay_admin') && !userRoles.includes('ops')) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Only ops admin can update policies'
        });
      }

      const updatedPolicy = await multisig.updatePolicy(targetType, priority, updates);

      // Audit the policy change
      await pool.query(
        `INSERT INTO config_recommendation_audit(
          recommendation_id,
          actor,
          action_taken,
          details
        ) VALUES (NULL, $1, 'update_policy', $2)`,
        [req.user?.id || 'ops_user', { target_type: targetType, priority, updates }]
      );

      res.json(updatedPolicy);
    } catch (error) {
      console.error('Update policy error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  return router;
}

module.exports = createRecommendationsRouter;
