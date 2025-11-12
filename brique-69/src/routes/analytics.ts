/**
 * Analytics API Routes
 * Provides endpoints for dashboard queries with RBAC
 */

import { Router } from 'express';
import { AuthenticatedRequest, requirePermission, getMerchantFilter } from '../middleware/auth';
import { query } from '../services/db';
import { getCached, setCached } from '../services/redis';
import { apiRequestDuration, apiRequestsTotal, cacheHitsCounter, cacheMissesCounter } from '../utils/metrics';

const router = Router();

/**
 * GET /api/analytics/summary
 * Returns aggregated KPIs for a given time range
 */
router.get('/summary', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/summary' });

  try {
    const {
      merchantId,
      from,
      to,
      granularity = 'day',
      region,
      country,
    } = req.query as any;

    // Apply merchant filter based on user role
    const effectiveMerchantId = getMerchantFilter(req, merchantId);

    // Build cache key
    const cacheKey = `analytics:summary:${effectiveMerchantId || 'all'}:${from}:${to}:${granularity}:${region || 'all'}:${country || 'all'}`;

    // Check cache
    const cached = await getCached(cacheKey);
    if (cached) {
      cacheHitsCounter.inc({ cache_type: 'summary' });
      apiRequestsTotal.inc({ method: 'GET', route: '/summary', status: '200' });
      endTimer({ status: '200' });
      return res.json(cached);
    }

    cacheMissesCounter.inc({ cache_type: 'summary' });

    // Query based on granularity
    let queryText: string;
    let params: any[];

    if (granularity === 'hour') {
      queryText = `
        SELECT
          hour,
          region,
          country,
          merchant_id,
          SUM(gross_volume_local) as gross_local,
          SUM(gross_volume_usd) as gross_usd,
          SUM(net_revenue_local) as net_local,
          SUM(net_revenue_usd) as net_usd,
          SUM(fees_molam_local) as fees_local,
          SUM(fees_molam_usd) as fees_usd,
          SUM(refunds_local) as refunds_local,
          SUM(refunds_usd) as refunds_usd,
          SUM(tx_count) as tx_count,
          SUM(success_count) as success_count,
          SUM(failed_count) as failed_count
        FROM txn_hourly_agg
        WHERE
          ($1::uuid IS NULL OR merchant_id = $1)
          AND hour >= $2::timestamptz
          AND hour <= $3::timestamptz
          AND ($4::text IS NULL OR region = $4)
          AND ($5::text IS NULL OR country = $5)
        GROUP BY hour, region, country, merchant_id
        ORDER BY hour DESC
        LIMIT 1000
      `;
      params = [effectiveMerchantId, from, to, region || null, country || null];
    } else {
      queryText = `
        SELECT
          day,
          region,
          country,
          merchant_id,
          SUM(gross_volume_local) as gross_local,
          SUM(gross_volume_usd) as gross_usd,
          SUM(net_revenue_local) as net_local,
          SUM(net_revenue_usd) as net_usd,
          SUM(fees_molam_local) as fees_local,
          SUM(fees_molam_usd) as fees_usd,
          SUM(refunds_local) as refunds_local,
          SUM(tx_count) as tx_count,
          SUM(success_count) as success_count,
          SUM(failed_count) as failed_count
        FROM mv_txn_daily_agg
        WHERE
          ($1::uuid IS NULL OR merchant_id = $1)
          AND day BETWEEN $2::date AND $3::date
          AND ($4::text IS NULL OR region = $4)
          AND ($5::text IS NULL OR country = $5)
        GROUP BY day, region, country, merchant_id
        ORDER BY day DESC
        LIMIT 1000
      `;
      params = [effectiveMerchantId, from, to, region || null, country || null];
    }

    const result = await query(queryText, params);

    // Cache for appropriate duration
    const cacheTtl = granularity === 'hour' ? 30 : 120;
    await setCached(cacheKey, result.rows, cacheTtl);

    apiRequestsTotal.inc({ method: 'GET', route: '/summary', status: '200' });
    endTimer({ status: '200' });
    res.json(result.rows);
  } catch (error) {
    console.error('Error in /summary:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/summary', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/timeseries
 * Returns time-series data for charting
 */
router.get('/timeseries', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/timeseries' });

  try {
    const {
      merchantId,
      metric = 'gross',
      from,
      to,
      interval = 'day',
    } = req.query as any;

    const effectiveMerchantId = getMerchantFilter(req, merchantId);

    const col = metric === 'net' ? 'net_revenue_usd' :
                metric === 'fees' ? 'fees_molam_usd' :
                'gross_volume_usd';

    const table = interval === 'hour' ? 'txn_hourly_agg' : 'mv_txn_daily_agg';
    const timecol = interval === 'hour' ? 'hour' : 'day';

    const queryText = `
      SELECT ${timecol} as t, SUM(${col}) as v
      FROM ${table}
      WHERE
        ($1::uuid IS NULL OR merchant_id = $1)
        AND ${timecol} BETWEEN $2::timestamptz AND $3::timestamptz
      GROUP BY ${timecol}
      ORDER BY ${timecol} ASC
    `;

    const result = await query(queryText, [effectiveMerchantId, from, to]);

    apiRequestsTotal.inc({ method: 'GET', route: '/timeseries', status: '200' });
    endTimer({ status: '200' });
    res.json(result.rows);
  } catch (error) {
    console.error('Error in /timeseries:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/timeseries', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/top/merchants
 * Returns top merchants by volume
 */
router.get('/top/merchants', requirePermission('analytics:ops'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/top/merchants' });

  try {
    const { from, to, limit = 10 } = req.query as any;

    const queryText = `
      SELECT
        merchant_id,
        SUM(gross_volume_usd) as gross,
        SUM(net_revenue_usd) as net,
        SUM(fees_molam_usd) as fees,
        SUM(tx_count) as tx_count
      FROM mv_txn_daily_agg
      WHERE day BETWEEN $1::date AND $2::date
      GROUP BY merchant_id
      ORDER BY gross DESC
      LIMIT $3
    `;

    const result = await query(queryText, [from, to, limit]);

    apiRequestsTotal.inc({ method: 'GET', route: '/top/merchants', status: '200' });
    endTimer({ status: '200' });
    res.json(result.rows);
  } catch (error) {
    console.error('Error in /top/merchants:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/top/merchants', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/top/countries
 * Returns top countries by volume
 */
router.get('/top/countries', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/top/countries' });

  try {
    const { from, to, limit = 10, merchantId } = req.query as any;
    const effectiveMerchantId = getMerchantFilter(req, merchantId);

    const queryText = `
      SELECT
        country,
        region,
        SUM(gross_volume_usd) as gross,
        SUM(net_revenue_usd) as net,
        SUM(tx_count) as tx_count
      FROM mv_txn_daily_agg
      WHERE
        day BETWEEN $1::date AND $2::date
        AND ($3::uuid IS NULL OR merchant_id = $3)
      GROUP BY country, region
      ORDER BY gross DESC
      LIMIT $4
    `;

    const result = await query(queryText, [from, to, effectiveMerchantId, limit]);

    apiRequestsTotal.inc({ method: 'GET', route: '/top/countries', status: '200' });
    endTimer({ status: '200' });
    res.json(result.rows);
  } catch (error) {
    console.error('Error in /top/countries:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/top/countries', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/kpis
 * Returns aggregated KPIs
 */
router.get('/kpis', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/kpis' });

  try {
    const { from, to, merchantId } = req.query as any;
    const effectiveMerchantId = getMerchantFilter(req, merchantId);

    const queryText = `
      SELECT
        SUM(gross_volume_usd) as gross_volume,
        SUM(net_revenue_usd) as net_revenue,
        SUM(fees_molam_usd) as fees_collected,
        SUM(refunds_local) as refunds,
        SUM(tx_count) as tx_count,
        SUM(success_count) as success_count,
        CASE
          WHEN SUM(tx_count) > 0 THEN (SUM(success_count)::float / SUM(tx_count)::float * 100)
          ELSE 0
        END as success_rate
      FROM mv_txn_daily_agg
      WHERE
        day BETWEEN $1::date AND $2::date
        AND ($3::uuid IS NULL OR merchant_id = $3)
    `;

    const result = await query(queryText, [from, to, effectiveMerchantId]);

    apiRequestsTotal.inc({ method: 'GET', route: '/kpis', status: '200' });
    endTimer({ status: '200' });
    res.json(result.rows[0] || {});
  } catch (error) {
    console.error('Error in /kpis:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/kpis', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/live
 * Returns live counters from Redis
 */
router.get('/live', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/live' });

  try {
    const { merchantId } = req.query as any;
    const effectiveMerchantId = getMerchantFilter(req, merchantId);

    const redis = (await import('../services/redis')).getRedisClient();

    let gross = 0, net = 0, fees = 0;

    if (effectiveMerchantId) {
      const [g, n, f] = await Promise.all([
        redis.get(`live:merchant:${effectiveMerchantId}:gross`),
        redis.get(`live:merchant:${effectiveMerchantId}:net`),
        redis.get(`live:merchant:${effectiveMerchantId}:fees`),
      ]);
      gross = parseFloat(g || '0');
      net = parseFloat(n || '0');
      fees = parseFloat(f || '0');
    } else {
      const [g, n] = await Promise.all([
        redis.get('live:global:gross'),
        redis.get('live:global:net'),
      ]);
      gross = parseFloat(g || '0');
      net = parseFloat(n || '0');
    }

    apiRequestsTotal.inc({ method: 'GET', route: '/live', status: '200' });
    endTimer({ status: '200' });
    res.json({ gross, net, fees });
  } catch (error) {
    console.error('Error in /live:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/live', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
