import { pool } from '../utils/db';
import fetch from 'node-fetch';

const SIRA_URL = process.env.SIRA_URL || 'http://localhost:8044';

export interface SiraDisputeScore {
  score: number; // 0-1, higher = more likely to lose
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  recommended_action: 'auto_accept' | 'request_evidence' | 'auto_refute' | 'escalate_ops';
  confidence: number; // 0-1
  win_probability: number; // 0-1
  reasons: string[];
  suggested_evidence: string[];
}

/**
 * Score dispute using SIRA ML model
 */
export async function scoreDispute(
  disputeId: string,
  paymentId?: string,
  merchantId?: string
): Promise<SiraDisputeScore> {
  try {
    // Get dispute details
    const { rows: disputes } = await pool.query('SELECT * FROM disputes WHERE id = $1', [disputeId]);

    if (disputes.length === 0) {
      throw new Error('Dispute not found');
    }

    const dispute = disputes[0];

    // Get payment details if available
    let payment = null;
    if (paymentId || dispute.payment_id) {
      const paymentResponse = await fetch(`${process.env.PAYMENTS_URL || 'http://localhost:8034'}/api/payments/${paymentId || dispute.payment_id}`);
      if (paymentResponse.ok) {
        payment = await paymentResponse.json();
      }
    }

    // Call SIRA API
    const response = await fetch(`${SIRA_URL}/api/sira/score-dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispute_id: disputeId,
        dispute_ref: dispute.dispute_ref,
        merchant_id: dispute.merchant_id,
        amount: dispute.amount,
        currency: dispute.currency,
        reason_code: dispute.reason_code,
        network: dispute.network,
        payment,
        origin_details: dispute.origin_details,
      }),
    });

    if (!response.ok) {
      throw new Error(`SIRA API error: ${response.status}`);
    }

    const siraScore = (await response.json()) as SiraDisputeScore;

    // Update dispute with SIRA score
    await pool.query('UPDATE disputes SET sira_score = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(siraScore),
      disputeId,
    ]);

    // Create event
    await pool.query(
      `INSERT INTO dispute_events (dispute_id, actor, actor_type, action, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [disputeId, 'system', 'system', 'sira_scored', JSON.stringify(siraScore)]
    );

    console.log(`[SIRA] Scored dispute ${disputeId}: ${siraScore.risk_level}, win_probability: ${siraScore.win_probability}`);

    // If recommended action is auto_accept or auto_refute, create action
    if (siraScore.confidence > 0.9) {
      if (siraScore.recommended_action === 'auto_accept') {
        await pool.query(
          `INSERT INTO dispute_actions (dispute_id, action_type, payload, priority)
           VALUES ($1, $2, $3, $4)`,
          [disputeId, 'auto_accept', JSON.stringify({ sira_recommendation: true, confidence: siraScore.confidence }), 2]
        );
      } else if (siraScore.recommended_action === 'auto_refute') {
        await pool.query(
          `INSERT INTO dispute_actions (dispute_id, action_type, payload, priority)
           VALUES ($1, $2, $3, $4)`,
          [disputeId, 'auto_refute', JSON.stringify({ sira_recommendation: true, confidence: siraScore.confidence }), 2]
        );
      }
    }

    return siraScore;
  } catch (error: any) {
    console.error(`[SIRA] Failed to score dispute ${disputeId}:`, error.message);

    // Return default score on error
    const defaultScore: SiraDisputeScore = {
      score: 0.5,
      risk_level: 'medium',
      recommended_action: 'request_evidence',
      confidence: 0,
      win_probability: 0.5,
      reasons: ['SIRA unavailable'],
      suggested_evidence: ['invoice', 'shipping_proof', 'communication'],
    };

    return defaultScore;
  }
}

/**
 * Get suggested evidence templates based on reason code
 */
export function getSuggestedEvidence(reasonCode: string): string[] {
  const evidenceMap: Record<string, string[]> = {
    '10.4': ['proof_of_authorization', 'customer_communication', 'fraud_analysis', 'delivery_confirmation'],
    '13.1': ['invoice', 'delivery_confirmation', 'tracking_number', 'customer_communication'],
    '13.2': ['cancellation_policy', 'subscription_terms', 'customer_communication', 'cancellation_proof'],
    '13.3': ['product_description', 'invoice', 'return_policy', 'quality_certification'],
    '13.5': ['terms_of_service', 'product_description', 'marketing_materials', 'customer_agreement'],
    '13.7': ['cancellation_policy', 'refund_policy', 'customer_communication', 'cancellation_date'],
    '83': ['receipt', 'signature', 'emv_data', 'pos_terminal_id'],
  };

  return evidenceMap[reasonCode] || ['invoice', 'receipt', 'customer_communication'];
}
