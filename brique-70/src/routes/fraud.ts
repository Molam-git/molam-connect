import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { getCustomerRiskProfile } from '../services/siraIntegration';
import { checkCustomerPromoActivity, reportPromoCodeFraud } from '../services/applyPromoWithFraud';
import { pool } from '../db/pool';

const router = Router();

/**
 * Get customer risk profile (ops only)
 */
router.get('/customer/:customer_id/risk', authenticate, requireRole('ops', 'admin'), async (req, res) => {
  try {
    const { customer_id } = req.params;

    const [siraProfile, promoActivity] = await Promise.all([
      getCustomerRiskProfile(customer_id),
      checkCustomerPromoActivity(customer_id),
    ]);

    res.json({
      customer_id,
      sira_risk_profile: siraProfile,
      promo_activity: promoActivity,
    });
  } catch (error) {
    console.error('Error getting customer risk profile:', error);
    res.status(500).json({ error: 'Failed to get customer risk profile' });
  }
});

/**
 * Get flagged promo code usages (ops only)
 */
router.get('/flagged-usages', authenticate, requireRole('ops', 'admin'), async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    // Get suspicious usage patterns
    const result = await pool.query(
      `SELECT
        pcu.*,
        pc.code as promo_code,
        c.email as customer_email,
        COUNT(*) OVER (PARTITION BY pcu.customer_id) as customer_total_uses
      FROM promo_code_usage pcu
      JOIN promo_codes pc ON pc.id = pcu.promo_code_id
      LEFT JOIN customers c ON c.id = pcu.customer_id
      WHERE pcu.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY pcu.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      data: result.rows,
      pagination: { limit, offset, total: result.rowCount },
    });
  } catch (error) {
    console.error('Error getting flagged usages:', error);
    res.status(500).json({ error: 'Failed to get flagged usages' });
  }
});

/**
 * Report fraud (ops only)
 */
router.post('/report', authenticate, requireRole('ops', 'admin'), async (req, res) => {
  try {
    const { usage_log_id, customer_id, reason, details } = req.body;

    if (!usage_log_id || !customer_id || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await reportPromoCodeFraud({
      usage_log_id,
      customer_id,
      reason,
      details,
    });

    res.json({ success: true, message: 'Fraud reported successfully' });
  } catch (error) {
    console.error('Error reporting fraud:', error);
    res.status(500).json({ error: 'Failed to report fraud' });
  }
});

/**
 * Get fraud statistics (ops only)
 */
router.get('/stats', authenticate, requireRole('ops', 'admin'), async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const result = await pool.query(
      `SELECT
        COUNT(*) as total_usages,
        COUNT(*) FILTER (WHERE status = 'applied') as successful_usages,
        COUNT(*) FILTER (WHERE status = 'expired') as blocked_usages,
        COUNT(DISTINCT customer_id) as unique_customers,
        COUNT(DISTINCT ip_address) as unique_ips,
        AVG(discount_amount) as avg_discount,
        SUM(discount_amount) as total_discount
      FROM promo_code_usage
      WHERE created_at >= NOW() - INTERVAL '${parseInt(days as string)} days'`,
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting fraud stats:', error);
    res.status(500).json({ error: 'Failed to get fraud stats' });
  }
});

export default router;
