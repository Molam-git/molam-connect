import { pool } from '../utils/db';
import fetch from 'node-fetch';
import * as dashboardService from '../services/dashboardService';

const SIRA_API_URL = process.env.SIRA_API_URL || 'http://localhost:8061';
const WALLET_API_URL = process.env.WALLET_API_URL || 'http://localhost:8050';
const CONNECT_API_URL = process.env.CONNECT_API_URL || 'http://localhost:8055';
const SUBSCRIPTIONS_API_URL = process.env.SUBSCRIPTIONS_API_URL || 'http://localhost:8060';
const DISPUTES_API_URL = process.env.DISPUTES_API_URL || 'http://localhost:8058';

const INTERVAL_MS = parseInt(process.env.TILES_REFRESH_INTERVAL_MS || '60000', 10); // 1 minute

/**
 * Fetch churn alerts from SIRA and create tiles
 */
async function fetchChurnAlerts(): Promise<void> {
  try {
    // Get all merchants
    const { rows: merchants } = await pool.query(
      'SELECT DISTINCT merchant_id FROM subscriptions WHERE status IN (\'active\', \'trialing\')'
    );

    for (const { merchant_id } of merchants) {
      try {
        // Fetch churn predictions from SIRA (Brique 61)
        const response = await fetch(`${SIRA_API_URL}/api/analytics/subscriptions/churn`, {
          headers: { Authorization: `Bearer mock-token` }, // In production, use proper auth
        });

        if (!response.ok) continue;

        const predictions = await response.json();

        // Filter high-risk predictions (risk_score > 70)
        const highRisk = predictions.filter((p: any) => p.risk_score > 70 && p.status === 'pending');

        if (highRisk.length > 0) {
          await dashboardService.createTile({
            merchant_id,
            tile_type: 'churn_risk',
            priority: 'high',
            payload: {
              count: highRisk.length,
              highest_risk: Math.max(...highRisk.map((p: any) => p.risk_score)),
              predictions: highRisk.slice(0, 5), // Top 5
            },
            source: 'sira',
            expires_at: new Date(Date.now() + 3600000), // 1 hour
          });

          console.log(`[Tiles] Created churn_risk tile for merchant ${merchant_id} (${highRisk.length} alerts)`);
        }
      } catch (error: any) {
        console.error(`[Tiles] Error fetching churn alerts for merchant ${merchant_id}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('[Tiles] Error in fetchChurnAlerts:', error.message);
  }
}

/**
 * Fetch fraud alerts from SIRA fraud detection (Brique 57)
 */
async function fetchFraudAlerts(): Promise<void> {
  try {
    const { rows: merchants } = await pool.query(
      'SELECT DISTINCT merchant_id FROM molam_transactions WHERE created_at > NOW() - INTERVAL \'1 hour\''
    );

    for (const { merchant_id } of merchants) {
      try {
        // In production, call Brique 57 fraud detection API
        // For now, check for high-risk transactions
        const { rows: highRiskTransactions } = await pool.query(
          `SELECT COUNT(*) as count FROM molam_transactions
           WHERE merchant_id = $1
             AND risk_score > 80
             AND status = 'flagged'
             AND created_at > NOW() - INTERVAL '1 hour'`,
          [merchant_id]
        );

        const count = parseInt(highRiskTransactions[0]?.count || '0', 10);

        if (count > 0) {
          await dashboardService.createTile({
            merchant_id,
            tile_type: 'fraud_alerts',
            priority: count > 5 ? 'critical' : 'high',
            payload: {
              count,
              message: `${count} high-risk transactions detected in the last hour`,
            },
            source: 'sira',
            expires_at: new Date(Date.now() + 3600000),
          });

          console.log(`[Tiles] Created fraud_alerts tile for merchant ${merchant_id} (${count} alerts)`);
        }
      } catch (error: any) {
        console.error(`[Tiles] Error fetching fraud alerts for merchant ${merchant_id}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('[Tiles] Error in fetchFraudAlerts:', error.message);
  }
}

/**
 * Aggregate wallet balance summary
 */
async function fetchWalletSummary(): Promise<void> {
  try {
    const { rows: merchants } = await pool.query(
      'SELECT DISTINCT merchant_id FROM wallet_accounts'
    );

    for (const { merchant_id } of merchants) {
      try {
        // Fetch wallet balance (Brique 50)
        const { rows: accounts } = await pool.query(
          `SELECT currency, SUM(balance) as total_balance
           FROM wallet_accounts
           WHERE merchant_id = $1 AND status = 'active'
           GROUP BY currency`,
          [merchant_id]
        );

        if (accounts.length > 0) {
          await dashboardService.createTile({
            merchant_id,
            tile_type: 'balance_summary',
            priority: 'normal',
            payload: {
              balances: accounts.map((a: any) => ({
                currency: a.currency,
                balance: parseFloat(a.total_balance || '0'),
              })),
            },
            source: 'wallet',
            expires_at: new Date(Date.now() + 300000), // 5 minutes
          });
        }
      } catch (error: any) {
        console.error(`[Tiles] Error fetching wallet summary for merchant ${merchant_id}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('[Tiles] Error in fetchWalletSummary:', error.message);
  }
}

/**
 * Fetch pending disputes
 */
async function fetchDisputesSummary(): Promise<void> {
  try {
    const { rows: merchants } = await pool.query(
      'SELECT DISTINCT merchant_id FROM disputes WHERE status IN (\'pending\', \'under_review\')'
    );

    for (const { merchant_id } of merchants) {
      try {
        const { rows: disputes } = await pool.query(
          `SELECT COUNT(*) as count, SUM(disputed_amount) as total_amount
           FROM disputes
           WHERE merchant_id = $1 AND status IN ('pending', 'under_review')`,
          [merchant_id]
        );

        const count = parseInt(disputes[0]?.count || '0', 10);
        const totalAmount = parseFloat(disputes[0]?.total_amount || '0');

        if (count > 0) {
          await dashboardService.createTile({
            merchant_id,
            tile_type: 'disputes_pending',
            priority: count > 10 ? 'high' : 'normal',
            payload: {
              count,
              total_amount: totalAmount,
              message: `${count} pending disputes (${totalAmount.toFixed(2)})`,
            },
            source: 'disputes',
            expires_at: new Date(Date.now() + 1800000), // 30 minutes
          });
        }
      } catch (error: any) {
        console.error(`[Tiles] Error fetching disputes for merchant ${merchant_id}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('[Tiles] Error in fetchDisputesSummary:', error.message);
  }
}

/**
 * Fetch subscriptions MRR summary
 */
async function fetchSubscriptionsSummary(): Promise<void> {
  try {
    const { rows: merchants } = await pool.query(
      'SELECT DISTINCT merchant_id FROM subscriptions WHERE status = \'active\''
    );

    for (const { merchant_id } of merchants) {
      try {
        // Fetch latest analytics from Brique 61
        const { rows: analytics } = await pool.query(
          `SELECT mrr, arr, churn_rate, active_count
           FROM subscription_analytics
           WHERE merchant_id = $1
           ORDER BY cohort_date DESC
           LIMIT 1`,
          [merchant_id]
        );

        if (analytics.length > 0) {
          const data = analytics[0];

          await dashboardService.createTile({
            merchant_id,
            tile_type: 'subscriptions_mrr',
            priority: 'normal',
            payload: {
              mrr: parseFloat(data.mrr || '0'),
              arr: parseFloat(data.arr || '0'),
              churn_rate: parseFloat(data.churn_rate || '0'),
              active_count: parseInt(data.active_count || '0', 10),
            },
            source: 'subscriptions',
            expires_at: new Date(Date.now() + 3600000), // 1 hour
          });
        }
      } catch (error: any) {
        console.error(`[Tiles] Error fetching subscriptions summary for merchant ${merchant_id}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('[Tiles] Error in fetchSubscriptionsSummary:', error.message);
  }
}

/**
 * Main aggregation loop
 */
async function runAggregation(): Promise<void> {
  console.log('[Tiles Aggregator] Starting tile aggregation...');

  await Promise.all([
    fetchChurnAlerts(),
    fetchFraudAlerts(),
    fetchWalletSummary(),
    fetchDisputesSummary(),
    fetchSubscriptionsSummary(),
  ]);

  console.log('[Tiles Aggregator] Aggregation complete');
}

/**
 * Start worker
 */
async function start(): Promise<void> {
  console.log(`[Tiles Aggregator] Starting with interval: ${INTERVAL_MS}ms`);

  // Run immediately
  await runAggregation();

  // Schedule periodic runs
  setInterval(async () => {
    await runAggregation();
  }, INTERVAL_MS);
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('[Tiles Aggregator] Shutting down...');
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start worker
if (require.main === module) {
  start().catch((error) => {
    console.error('[Tiles Aggregator] Fatal error:', error);
    process.exit(1);
  });
}

export { runAggregation };
