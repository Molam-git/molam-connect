import { pool } from '../utils/db';

export interface SubscriptionAnalytics {
  id: string;
  merchant_id: string;
  cohort_date: string;
  plan_id: string | null;
  country: string | null;
  currency: string | null;
  mrr: number;
  arr: number;
  arpu: number;
  cltv: number;
  churn_rate: number;
  active_count: number;
  cancelled_count: number;
  created_at: string;
}

/**
 * Get analytics metrics for a merchant
 */
export async function getAnalytics(merchantId: string, limit: number = 12): Promise<SubscriptionAnalytics[]> {
  const { rows } = await pool.query<SubscriptionAnalytics>(
    `SELECT * FROM subscription_analytics
     WHERE merchant_id = $1
     ORDER BY cohort_date DESC
     LIMIT $2`,
    [merchantId, limit]
  );
  return rows;
}

/**
 * Calculate and store analytics for a merchant
 */
export async function calculateAnalytics(merchantId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get subscription metrics from B60
    const { rows: metrics } = await client.query(
      `SELECT
         CURRENT_DATE AS cohort_date,
         COUNT(*) FILTER (WHERE status = 'active') AS active_count,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
         AVG(p.amount * s.quantity) AS arpu
       FROM subscriptions s
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.merchant_id = $1`,
      [merchantId]
    );

    if (metrics.length === 0 || !metrics[0].active_count) {
      await client.query('COMMIT');
      return;
    }

    const metric = metrics[0];
    const activeCount = parseInt(metric.active_count || '0', 10);
    const cancelledCount = parseInt(metric.cancelled_count || '0', 10);
    const arpu = parseFloat(metric.arpu || '0');

    const mrr = activeCount * arpu;
    const arr = mrr * 12;
    const totalCount = activeCount + cancelledCount;
    const churnRate = totalCount > 0 ? (cancelledCount / totalCount) * 100 : 0;
    const cltv = arpu * 24; // Simple CLTV calculation (2 years average)

    // Insert or update analytics
    await client.query(
      `INSERT INTO subscription_analytics (
        merchant_id, cohort_date, mrr, arr, arpu, cltv, churn_rate,
        active_count, cancelled_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (merchant_id, cohort_date)
      DO UPDATE SET
        mrr = EXCLUDED.mrr,
        arr = EXCLUDED.arr,
        arpu = EXCLUDED.arpu,
        cltv = EXCLUDED.cltv,
        churn_rate = EXCLUDED.churn_rate,
        active_count = EXCLUDED.active_count,
        cancelled_count = EXCLUDED.cancelled_count,
        updated_at = NOW()`,
      [merchantId, metric.cohort_date, mrr, arr, arpu, cltv, churnRate, activeCount, cancelledCount]
    );

    await client.query('COMMIT');
    console.log(`[Analytics] Calculated metrics for merchant ${merchantId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
