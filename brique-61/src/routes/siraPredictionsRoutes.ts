import { Router, Response } from 'express';
import { authzMiddleware, requireRole, AuthRequest } from '../utils/authz';
import { pool } from '../utils/db';
import fetch from 'node-fetch';

const router = Router();

const SIRA_SCORER_URL = process.env.SIRA_SCORER_URL || 'http://localhost:8062';

/**
 * POST /api/sira/score
 * Proxy to scoring service and persist prediction
 */
router.post(
  '/score',
  authzMiddleware,
  requireRole('billing_ops', 'merchant_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { user_id, merchant_id, features } = req.body;

      if (!user_id || !merchant_id || !features) {
        res.status(400).json({ error: 'Missing required fields: user_id, merchant_id, features' });
        return;
      }

      // Call scoring microservice
      console.log(`[SIRA API] Calling scorer for user ${user_id}...`);

      const scorerResponse = await fetch(`${SIRA_SCORER_URL}/v1/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id, merchant_id, features }),
      });

      if (!scorerResponse.ok) {
        const error = await scorerResponse.text();
        throw new Error(`Scorer error: ${error}`);
      }

      const scoreResult = await scorerResponse.json();

      // Persist churn prediction to database
      const { rows } = await pool.query(
        `INSERT INTO churn_predictions(
          user_id, merchant_id, model_version, risk_score, predicted_reason,
          recommended_action, decision_context, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'suggested')
        RETURNING *`,
        [
          user_id,
          merchant_id,
          scoreResult.model_version || 'unknown',
          scoreResult.risk_score,
          scoreResult.predicted_reason,
          scoreResult.recommended_action,
          JSON.stringify(scoreResult.top_features || []),
        ]
      );

      const prediction = rows[0];

      // Audit log
      await pool.query(
        `INSERT INTO molam_audit_logs(entity_type, entity_id, action, actor_id, changes)
         VALUES ($1, $2, $3, $4, $5)`,
        ['churn_prediction', prediction.id, 'prediction_created', req.user!.id, JSON.stringify(scoreResult)]
      );

      console.log(`[SIRA API] ✓ Prediction created: ${prediction.id}, risk=${scoreResult.risk_score}`);

      res.json(prediction);
    } catch (error: any) {
      console.error('[SIRA API] Error scoring:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/sira/predictions
 * Get predictions for merchant
 */
router.get(
  '/predictions',
  authzMiddleware,
  requireRole('billing_ops', 'merchant_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const merchantId = req.user!.merchantId!;
      const status = (req.query.status as string) || 'suggested';
      const limit = parseInt(req.query.limit as string) || 50;

      const { rows } = await pool.query(
        `SELECT * FROM churn_predictions
         WHERE merchant_id = $1 AND status = $2
         ORDER BY risk_score DESC, predicted_at DESC
         LIMIT $3`,
        [merchantId, status, limit]
      );

      res.json(rows);
    } catch (error: any) {
      console.error('[SIRA API] Error fetching predictions:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/sira/action/:id/accept
 * Accept and execute recommended action
 */
router.post(
  '/action/:id/accept',
  authzMiddleware,
  requireRole('billing_ops', 'merchant_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const predictionId = req.params.id;
      const actorId = req.user!.id;

      // Update prediction status
      const { rows } = await pool.query(
        `UPDATE churn_predictions
         SET status = 'actioned', actioned_by = $2, actioned_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [predictionId, actorId]
      );

      if (rows.length === 0) {
        res.status(404).json({ error: 'Prediction not found' });
        return;
      }

      const prediction = rows[0];

      // Audit log
      await pool.query(
        `INSERT INTO molam_audit_logs(entity_type, entity_id, action, actor_id, changes)
         VALUES ($1, $2, $3, $4, $5)`,
        ['churn_prediction', predictionId, 'action_accepted', actorId, JSON.stringify({ prediction })]
      );

      // TODO: Publish event to action execution pipeline
      // await publishEvent('sira', predictionId, 'action.accepted', { actor: actorId, action: prediction.recommended_action });

      console.log(`[SIRA API] ✓ Action accepted: ${predictionId} by ${actorId}`);

      res.json({ ok: true, prediction });
    } catch (error: any) {
      console.error('[SIRA API] Error accepting action:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/sira/action/:id/dismiss
 * Dismiss recommendation
 */
router.post(
  '/action/:id/dismiss',
  authzMiddleware,
  requireRole('billing_ops', 'merchant_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const predictionId = req.params.id;
      const actorId = req.user!.id;
      const { reason } = req.body;

      // Update prediction status
      const { rows } = await pool.query(
        `UPDATE churn_predictions
         SET status = 'dismissed', actioned_by = $2, actioned_at = NOW(),
             action_result = $3
         WHERE id = $1
         RETURNING *`,
        [predictionId, actorId, JSON.stringify({ dismissed: true, reason })]
      );

      if (rows.length === 0) {
        res.status(404).json({ error: 'Prediction not found' });
        return;
      }

      // Audit log
      await pool.query(
        `INSERT INTO molam_audit_logs(entity_type, entity_id, action, actor_id, changes)
         VALUES ($1, $2, $3, $4, $5)`,
        ['churn_prediction', predictionId, 'action_dismissed', actorId, JSON.stringify({ reason })]
      );

      console.log(`[SIRA API] ✓ Action dismissed: ${predictionId} by ${actorId}`);

      res.json({ ok: true });
    } catch (error: any) {
      console.error('[SIRA API] Error dismissing action:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/sira/feedback
 * Submit feedback on prediction
 */
router.post(
  '/feedback',
  authzMiddleware,
  requireRole('billing_ops', 'merchant_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { churn_prediction_id, feedback } = req.body;
      const actorId = req.user!.id;
      const source = req.user!.roles.includes('billing_ops') ? 'ops' : 'merchant';

      if (!churn_prediction_id || !feedback) {
        res.status(400).json({ error: 'Missing required fields: churn_prediction_id, feedback' });
        return;
      }

      // Insert feedback
      await pool.query(
        `INSERT INTO sira_feedback(churn_prediction_id, source, feedback, created_by)
         VALUES ($1, $2, $3, $4)`,
        [churn_prediction_id, source, JSON.stringify(feedback), actorId]
      );

      // Check if enough feedback to trigger retrain
      const { rows } = await pool.query(
        `SELECT COUNT(1) as c FROM sira_feedback
         WHERE created_at > NOW() - INTERVAL '1 day'`
      );

      const feedbackCount = parseInt(rows[0].c || '0', 10);
      const RETRAIN_THRESHOLD = parseInt(process.env.SIRA_RETRAIN_FEEDBACK_THRESHOLD || '50', 10);

      if (feedbackCount >= RETRAIN_THRESHOLD) {
        console.log(`[SIRA API] Feedback threshold reached (${feedbackCount}), triggering retrain...`);
        // TODO: Publish retrain event
        // await publishEvent('sira', 'system', 'retrain.requested', { reason: 'feedback_threshold', count: feedbackCount });
      }

      res.json({ ok: true, message: 'Feedback submitted successfully' });
    } catch (error: any) {
      console.error('[SIRA API] Error submitting feedback:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
