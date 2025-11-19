/**
 * Merchant Dashboard API Routes
 * Provides analytics and reporting endpoints for merchants
 */
import { Router } from 'express';
import { z } from 'zod';
import { merchantAuth, AuthenticatedRequest } from '../utils/merchantAuth';
import { pool } from '../utils/db';

const router = Router();

/**
 * GET /api/dashboard/overview
 * Returns high-level metrics for merchant dashboard
 */
router.get('/overview', merchantAuth, async (req, res) => {
  const merchant = (req as AuthenticatedRequest).merchant;

  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Get today's aggregates
    const { rows: todayRows } = await pool.query(
      `SELECT
        COALESCE(SUM(total_transactions), 0) as total_transactions,
        COALESCE(SUM(successful_transactions), 0) as successful_transactions,
        COALESCE(SUM(total_revenue), 0) as total_revenue,
        COALESCE(SUM(total_fees), 0) as total_fees,
        COALESCE(SUM(net_revenue), 0) as net_revenue,
        COALESCE(AVG(avg_transaction_amount), 0) as avg_transaction_amount
       FROM merchant_daily_aggregates
       WHERE merchant_id = $1 AND date = $2`,
      [merchant.merchantId, today]
    );

    // Get yesterday's aggregates for comparison
    const { rows: yesterdayRows } = await pool.query(
      `SELECT
        COALESCE(SUM(total_transactions), 0) as total_transactions,
        COALESCE(SUM(total_revenue), 0) as total_revenue
       FROM merchant_daily_aggregates
       WHERE merchant_id = $1 AND date = $2`,
      [merchant.merchantId, yesterday]
    );

    // Get this month's totals
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().split('T')[0];

    const { rows: monthRows } = await pool.query(
      `SELECT
        COALESCE(SUM(total_transactions), 0) as total_transactions,
        COALESCE(SUM(total_revenue), 0) as total_revenue,
        COALESCE(SUM(unique_customers), 0) as total_customers
       FROM merchant_daily_aggregates
       WHERE merchant_id = $1 AND date >= $2`,
      [merchant.merchantId, firstDayOfMonth]
    );

    // Calculate growth percentages
    const todayData = todayRows[0];
    const yesterdayData = yesterdayRows[0];
    const monthData = monthRows[0];

    const transactionGrowth = yesterdayData.total_transactions > 0
      ? ((todayData.total_transactions - yesterdayData.total_transactions) / yesterdayData.total_transactions * 100)
      : 0;

    const revenueGrowth = yesterdayData.total_revenue > 0
      ? ((todayData.total_revenue - yesterdayData.total_revenue) / yesterdayData.total_revenue * 100)
      : 0;

    res.json({
      today: {
        transactions: parseInt(todayData.total_transactions),
        successful_transactions: parseInt(todayData.successful_transactions),
        revenue: parseFloat(todayData.total_revenue),
        fees: parseFloat(todayData.total_fees),
        net_revenue: parseFloat(todayData.net_revenue),
        avg_transaction: parseFloat(todayData.avg_transaction_amount),
        transaction_growth: transactionGrowth.toFixed(2),
        revenue_growth: revenueGrowth.toFixed(2)
      },
      month: {
        transactions: parseInt(monthData.total_transactions),
        revenue: parseFloat(monthData.total_revenue),
        customers: parseInt(monthData.total_customers)
      }
    });
  } catch (error: any) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({
      error: 'fetch_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/dashboard/analytics
 * Returns detailed analytics for a date range
 */
const analyticsSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  granularity: z.enum(['daily', 'hourly']).default('daily')
});

router.get('/analytics', merchantAuth, async (req, res) => {
  const merchant = (req as AuthenticatedRequest).merchant;

  try {
    const parsed = analyticsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_parameters',
        details: parsed.error.errors
      });
    }

    const { start_date, end_date, granularity } = parsed.data;

    if (granularity === 'daily') {
      // Daily aggregates
      const { rows } = await pool.query(
        `SELECT
          date,
          total_transactions,
          successful_transactions,
          failed_transactions,
          total_revenue,
          total_fees,
          net_revenue,
          avg_transaction_amount,
          unique_customers,
          new_customers,
          mobile_money_count + card_count + bank_transfer_count + qr_payment_count as payment_method_breakdown
         FROM merchant_daily_aggregates
         WHERE merchant_id = $1
           AND date >= $2
           AND date <= $3
         ORDER BY date ASC`,
        [merchant.merchantId, start_date, end_date]
      );

      res.json({
        granularity: 'daily',
        data: rows.map(row => ({
          date: row.date,
          transactions: parseInt(row.total_transactions),
          successful: parseInt(row.successful_transactions),
          failed: parseInt(row.failed_transactions),
          revenue: parseFloat(row.total_revenue),
          fees: parseFloat(row.total_fees),
          net_revenue: parseFloat(row.net_revenue),
          avg_transaction: parseFloat(row.avg_transaction_amount),
          customers: parseInt(row.unique_customers),
          new_customers: parseInt(row.new_customers)
        }))
      });
    } else {
      // Hourly aggregates
      const { rows } = await pool.query(
        `SELECT
          hour_timestamp,
          total_transactions,
          successful_transactions,
          total_revenue
         FROM merchant_hourly_aggregates
         WHERE merchant_id = $1
           AND hour_timestamp >= $2::date
           AND hour_timestamp <= ($3::date + interval '1 day')
         ORDER BY hour_timestamp ASC`,
        [merchant.merchantId, start_date, end_date]
      );

      res.json({
        granularity: 'hourly',
        data: rows.map(row => ({
          timestamp: row.hour_timestamp,
          transactions: parseInt(row.total_transactions),
          successful: parseInt(row.successful_transactions),
          revenue: parseFloat(row.total_revenue)
        }))
      });
    }
  } catch (error: any) {
    console.error('Analytics error:', error);
    res.status(500).json({
      error: 'fetch_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/dashboard/payment-methods
 * Returns breakdown of payment methods
 */
router.get('/payment-methods', merchantAuth, async (req, res) => {
  const merchant = (req as AuthenticatedRequest).merchant;

  try {
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

    const { rows } = await pool.query(
      `SELECT
        COALESCE(SUM(mobile_money_count), 0) as mobile_money_count,
        COALESCE(SUM(mobile_money_amount), 0) as mobile_money_amount,
        COALESCE(SUM(card_count), 0) as card_count,
        COALESCE(SUM(card_amount), 0) as card_amount,
        COALESCE(SUM(bank_transfer_count), 0) as bank_transfer_count,
        COALESCE(SUM(bank_transfer_amount), 0) as bank_transfer_amount,
        COALESCE(SUM(qr_payment_count), 0) as qr_payment_count,
        COALESCE(SUM(qr_payment_amount), 0) as qr_payment_amount
       FROM merchant_daily_aggregates
       WHERE merchant_id = $1 AND date >= $2`,
      [merchant.merchantId, startDate]
    );

    const data = rows[0];

    res.json({
      period_days: days,
      payment_methods: [
        {
          method: 'mobile_money',
          count: parseInt(data.mobile_money_count),
          amount: parseFloat(data.mobile_money_amount)
        },
        {
          method: 'card',
          count: parseInt(data.card_count),
          amount: parseFloat(data.card_amount)
        },
        {
          method: 'bank_transfer',
          count: parseInt(data.bank_transfer_count),
          amount: parseFloat(data.bank_transfer_amount)
        },
        {
          method: 'qr_payment',
          count: parseInt(data.qr_payment_count),
          amount: parseFloat(data.qr_payment_amount)
        }
      ]
    });
  } catch (error: any) {
    console.error('Payment methods error:', error);
    res.status(500).json({
      error: 'fetch_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/dashboard/top-products
 * Returns top selling products
 */
router.get('/top-products', merchantAuth, async (req, res) => {
  const merchant = (req as AuthenticatedRequest).merchant;

  try {
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 10;
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

    const { rows } = await pool.query(
      `SELECT
        product_id,
        product_name,
        SUM(transaction_count) as total_transactions,
        SUM(total_amount) as total_amount
       FROM merchant_product_stats
       WHERE merchant_id = $1 AND date >= $2
       GROUP BY product_id, product_name
       ORDER BY total_amount DESC
       LIMIT $3`,
      [merchant.merchantId, startDate, limit]
    );

    res.json({
      period_days: days,
      products: rows.map(row => ({
        product_id: row.product_id,
        product_name: row.product_name,
        transactions: parseInt(row.total_transactions),
        amount: parseFloat(row.total_amount)
      }))
    });
  } catch (error: any) {
    console.error('Top products error:', error);
    res.status(500).json({
      error: 'fetch_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/dashboard/customers
 * Returns customer analytics
 */
router.get('/customers', merchantAuth, async (req, res) => {
  const merchant = (req as AuthenticatedRequest).merchant;

  try {
    const limit = parseInt(req.query.limit as string) || 50;

    // Top customers by spend
    const { rows: topCustomers } = await pool.query(
      `SELECT
        customer_id,
        total_transactions,
        total_spent,
        first_transaction_at,
        last_transaction_at
       FROM merchant_customer_stats
       WHERE merchant_id = $1
       ORDER BY total_spent DESC
       LIMIT $2`,
      [merchant.merchantId, limit]
    );

    // Customer summary stats
    const { rows: summary } = await pool.query(
      `SELECT
        COUNT(*) as total_customers,
        AVG(total_transactions) as avg_transactions_per_customer,
        AVG(total_spent) as avg_spend_per_customer
       FROM merchant_customer_stats
       WHERE merchant_id = $1`,
      [merchant.merchantId]
    );

    res.json({
      summary: {
        total_customers: parseInt(summary[0].total_customers),
        avg_transactions: parseFloat(summary[0].avg_transactions_per_customer).toFixed(2),
        avg_spend: parseFloat(summary[0].avg_spend_per_customer).toFixed(2)
      },
      top_customers: topCustomers.map(row => ({
        customer_id: row.customer_id,
        transactions: parseInt(row.total_transactions),
        total_spent: parseFloat(row.total_spent),
        first_transaction: row.first_transaction_at,
        last_transaction: row.last_transaction_at
      }))
    });
  } catch (error: any) {
    console.error('Customers error:', error);
    res.status(500).json({
      error: 'fetch_failed',
      message: error.message
    });
  }
});

export default router;
