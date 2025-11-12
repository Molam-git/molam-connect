import { pool } from '../utils/db';

export interface ChurnPrediction {
  id: string;
  subscription_id: string;
  merchant_id: string;
  risk_score: number;
  predicted_reason: string | null;
  recommended_action: any;
  status: string;
  created_at: string;
}

export interface ChurnFeedback {
  churn_prediction_id: string;
  actor_id: string;
  actor_role: string;
  action: string;
  details: any;
}

/**
 * Get pending churn predictions for a merchant
 */
export async function getChurnPredictions(merchantId: string): Promise<ChurnPrediction[]> {
  const { rows } = await pool.query<ChurnPrediction>(
    `SELECT * FROM churn_predictions
     WHERE merchant_id = $1 AND status = 'pending'
     ORDER BY risk_score DESC`,
    [merchantId]
  );
  return rows;
}

/**
 * Create a churn prediction
 */
export async function createChurnPrediction(input: {
  subscription_id: string;
  merchant_id: string;
  risk_score: number;
  predicted_reason?: string;
  recommended_action?: any;
}): Promise<ChurnPrediction> {
  const { rows } = await pool.query<ChurnPrediction>(
    `INSERT INTO churn_predictions (
      subscription_id, merchant_id, risk_score, predicted_reason, recommended_action
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *`,
    [
      input.subscription_id,
      input.merchant_id,
      input.risk_score,
      input.predicted_reason || null,
      JSON.stringify(input.recommended_action || {}),
    ]
  );
  return rows[0];
}

/**
 * Submit feedback on a churn prediction
 */
export async function submitFeedback(input: ChurnFeedback): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert feedback
    await client.query(
      `INSERT INTO sira_feedback (
        churn_prediction_id, actor_id, actor_role, action, details
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        input.churn_prediction_id,
        input.actor_id,
        input.actor_role,
        input.action,
        JSON.stringify(input.details || {}),
      ]
    );

    // Update prediction status
    const status = input.action === 'approve' ? 'applied' : 'rejected';
    await client.query(
      `UPDATE churn_predictions
       SET status = $1, applied_at = CASE WHEN $1 = 'applied' THEN NOW() ELSE applied_at END, updated_at = NOW()
       WHERE id = $2`,
      [status, input.churn_prediction_id]
    );

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes)
       VALUES ($1, $2, $3, $4, $5)`,
      ['churn_prediction', input.churn_prediction_id, `feedback_${input.action}`, input.actor_id, JSON.stringify(input)]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Mock SIRA prediction (to be replaced with real ML API)
 */
export async function predictChurnRisk(subscription: any): Promise<{
  risk_score: number;
  predicted_reason: string;
  recommended_action: any;
}> {
  // Mock implementation - replace with actual SIRA API call
  const riskScore = Math.random() * 100;

  let reason = 'low_usage';
  let action: any = { type: 'email', template: 'engagement' };

  if (riskScore > 70) {
    reason = 'failed_payment';
    action = { type: 'discount', value: 10 };
  } else if (riskScore > 50) {
    reason = 'voluntary';
    action = { type: 'offer', value: '1 month free' };
  }

  return {
    risk_score: Math.round(riskScore),
    predicted_reason: reason,
    recommended_action: action,
  };
}
