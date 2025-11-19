/**
 * Brique 116: Routing Logs Tests
 * Tests pour valider le système de logging de routing
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');

describe('Charge Routing Logs System', () => {
  let pool;

  before(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/molam_test'
    });

    // Run migration
    const fs = require('fs');
    const migration = fs.readFileSync('./brique-116/migrations/001_charge_routing_logs.sql', 'utf8');
    await pool.query(migration);
  });

  after(async () => {
    await pool.query('DROP TABLE IF EXISTS charge_routing_logs CASCADE');
    await pool.end();
  });

  /**
   * Test Case 1: Log successful routing
   */
  describe('Case 1: Log Successful Routing', () => {
    it('should log a successful payment routing', async () => {
      const { rows } = await pool.query(
        `INSERT INTO charge_routing_logs (
          transaction_id, merchant_id, user_id, method, route,
          amount, currency, status, latency_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          '550e8400-e29b-41d4-a716-446655440000',
          'merchant-001',
          'user-001',
          'card',
          'VISA_US',
          100.50,
          'USD',
          'success',
          450
        ]
      );

      assert.strictEqual(rows[0].status, 'success');
      assert.strictEqual(rows[0].route, 'VISA_US');
      assert.strictEqual(parseFloat(rows[0].amount), 100.50);
      assert.strictEqual(rows[0].latency_ms, 450);

      console.log('✅ Successful routing logged: VISA_US, 100.50 USD, 450ms');
    });
  });

  /**
   * Test Case 2: Log failed routing with fallback
   */
  describe('Case 2: Failed Routing with Fallback', () => {
    it('should log a failed routing and fallback route', async () => {
      const txId = '660e8400-e29b-41d4-a716-446655440001';

      // Log initial failure
      await pool.query(
        `INSERT INTO charge_routing_logs (
          transaction_id, merchant_id, method, route,
          amount, currency, status, latency_ms, error_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [txId, 'merchant-001', 'wallet', 'MTN_SN', 50.00, 'XOF', 'failed', 1200, 'INSUFFICIENT_BALANCE']
      );

      // Log fallback success
      await pool.query(
        `INSERT INTO charge_routing_logs (
          transaction_id, merchant_id, method, route,
          amount, currency, status, latency_ms, fallback_route
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [txId, 'merchant-001', 'wallet', 'ORANGE_SN', 50.00, 'XOF', 'success', 800, 'MTN_SN']
      );

      // Verify both logs exist
      const { rows } = await pool.query(
        'SELECT * FROM charge_routing_logs WHERE transaction_id = $1 ORDER BY created_at',
        [txId]
      );

      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0].status, 'failed');
      assert.strictEqual(rows[0].error_code, 'INSUFFICIENT_BALANCE');
      assert.strictEqual(rows[1].status, 'success');
      assert.strictEqual(rows[1].fallback_route, 'MTN_SN');

      console.log('✅ Failed routing with fallback: MTN_SN → ORANGE_SN');
    });
  });

  /**
   * Test Case 3: Calculate route statistics
   */
  describe('Case 3: Route Statistics', () => {
    it('should calculate correct statistics for a route', async () => {
      const merchantId = 'merchant-stats-test';
      const route = 'SEPA_FR';

      // Insert test data
      for (let i = 0; i < 20; i++) {
        await pool.query(
          `INSERT INTO charge_routing_logs (
            transaction_id, merchant_id, method, route, amount, currency, status, latency_ms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            `tx-${i}`,
            merchantId,
            'bank',
            route,
            100.00,
            'EUR',
            i < 18 ? 'success' : 'failed',  // 90% success rate
            500 + (i * 50)  // Varying latency
          ]
        );
      }

      // Query statistics view
      const { rows } = await pool.query(
        `SELECT * FROM v_routing_stats_by_route
         WHERE merchant_id = $1 AND route = $2`,
        [merchantId, route]
      );

      assert.strictEqual(rows[0].total_attempts, 20);
      assert.strictEqual(rows[0].successful_attempts, 18);
      assert.strictEqual(rows[0].failed_attempts, 2);
      assert.strictEqual(parseFloat(rows[0].success_rate_pct), 90.00);
      assert.ok(rows[0].avg_latency_ms > 0);

      console.log(`✅ Route stats: ${route} - ${rows[0].success_rate_pct}% success, avg ${rows[0].avg_latency_ms}ms`);
    });
  });

  /**
   * Test Case 4: Detect failing routes
   */
  describe('Case 4: Detect Failing Routes', () => {
    it('should detect routes with high failure rate', async () => {
      const merchantId = 'merchant-failing-test';
      const route = 'MTN_CI';

      // Insert data with 30% failure rate (> 10% threshold)
      for (let i = 0; i < 30; i++) {
        await pool.query(
          `INSERT INTO charge_routing_logs (
            transaction_id, merchant_id, method, route, amount, currency, status, latency_ms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [`tx-failing-${i}`, merchantId, 'wallet', route, 50.00, 'XOF', i < 21 ? 'success' : 'failed', 600]
        );
      }

      // Check failing routes view
      const { rows } = await pool.query(
        `SELECT * FROM v_failing_routes
         WHERE merchant_id = $1 AND route = $2`,
        [merchantId, route]
      );

      assert.ok(rows.length > 0);
      assert.ok(parseFloat(rows[0].failure_rate_pct) > 10);

      console.log(`✅ Failing route detected: ${route} - ${rows[0].failure_rate_pct}% failure rate`);
    });
  });

  /**
   * Test Case 5: Detect slow routes
   */
  describe('Case 5: Detect Slow Routes', () => {
    it('should detect routes with high latency', async () => {
      const merchantId = 'merchant-slow-test';
      const route = 'WIRE_US';

      // Insert data with high latency
      for (let i = 0; i < 20; i++) {
        await pool.query(
          `INSERT INTO charge_routing_logs (
            transaction_id, merchant_id, method, route, amount, currency, status, latency_ms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [`tx-slow-${i}`, merchantId, 'bank', route, 200.00, 'USD', 'success', 2500 + (i * 100)]
        );
      }

      // Check slow routes view
      const { rows } = await pool.query(
        `SELECT * FROM v_slow_routes
         WHERE merchant_id = $1 AND route = $2`,
        [merchantId, route]
      );

      assert.ok(rows.length > 0);
      assert.ok(parseFloat(rows[0].p95_latency_ms) > 2000);

      console.log(`✅ Slow route detected: ${route} - P95: ${rows[0].p95_latency_ms}ms`);
    });
  });

  /**
   * Test Case 6: Sira recommendations
   */
  describe('Case 6: Sira Route Recommendations', () => {
    it('should provide recommendations based on performance', async () => {
      const merchantId = 'merchant-recs-test';

      // Route 1: Excellent performance
      for (let i = 0; i < 100; i++) {
        await pool.query(
          `INSERT INTO charge_routing_logs (
            transaction_id, merchant_id, method, route, amount, currency, status, latency_ms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [`tx-good-${i}`, merchantId, 'card', 'VISA_OPTIMIZED', 100.00, 'USD', i < 97 ? 'success' : 'failed', 300 + (i * 5)]
        );
      }

      // Route 2: Poor performance
      for (let i = 0; i < 50; i++) {
        await pool.query(
          `INSERT INTO charge_routing_logs (
            transaction_id, merchant_id, method, route, amount, currency, status, latency_ms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [`tx-bad-${i}`, merchantId, 'card', 'SLOW_PROVIDER', 100.00, 'USD', i < 30 ? 'success' : 'failed', 3000]
        );
      }

      // Get recommendations
      const { rows } = await pool.query(
        `SELECT * FROM get_route_recommendations($1, NULL)`,
        [merchantId]
      );

      assert.ok(rows.length >= 2);

      const prioritizeRec = rows.find(r => r.recommendation === 'prioritize');
      const disableRec = rows.find(r => r.recommendation === 'disable');

      assert.ok(prioritizeRec !== undefined);
      assert.ok(disableRec !== undefined);

      console.log(`✅ Recommendations generated:`);
      console.log(`   - Prioritize: ${prioritizeRec.route} (${prioritizeRec.reason})`);
      console.log(`   - Disable: ${disableRec.route} (${disableRec.reason})`);
    });
  });

  /**
   * Test Case 7: Anomaly detection
   */
  describe('Case 7: Real-time Anomaly Detection', () => {
    it('should detect failure spikes in last 15 minutes', async () => {
      const merchantId = 'merchant-anomaly-test';
      const route = 'SPIKE_ROUTE';

      // Insert recent failures (> 15% failure rate)
      for (let i = 0; i < 30; i++) {
        await pool.query(
          `INSERT INTO charge_routing_logs (
            transaction_id, merchant_id, method, route, amount, currency, status, latency_ms, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() - INTERVAL '5 minutes')`,
          [`tx-spike-${i}`, merchantId, 'card', route, 100.00, 'USD', i < 20 ? 'success' : 'failed', 500]
        );
      }

      // Detect anomalies
      const { rows } = await pool.query('SELECT * FROM detect_routing_anomalies()');

      const failureSpike = rows.find(r => r.merchant_id === merchantId && r.route === route && r.anomaly_type === 'failure_spike');
      assert.ok(failureSpike !== undefined);
      assert.ok(parseFloat(failureSpike.current_value) > 15);

      console.log(`✅ Anomaly detected: ${route} - ${failureSpike.anomaly_type} (${failureSpike.current_value}%)`);
    });
  });

  /**
   * Test Case 8: Multi-currency support
   */
  describe('Case 8: Multi-Currency Routing', () => {
    it('should handle multiple currencies correctly', async () => {
      const merchantId = 'merchant-multi-currency';

      // USD transactions
      await pool.query(
        `INSERT INTO charge_routing_logs (
          transaction_id, merchant_id, method, route, amount, currency, status, latency_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['tx-usd', merchantId, 'card', 'VISA_US', 100.00, 'USD', 'success', 400]
      );

      // EUR transactions
      await pool.query(
        `INSERT INTO charge_routing_logs (
          transaction_id, merchant_id, method, route, amount, currency, status, latency_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['tx-eur', merchantId, 'bank', 'SEPA_FR', 85.50, 'EUR', 'success', 600]
      );

      // XOF transactions
      await pool.query(
        `INSERT INTO charge_routing_logs (
          transaction_id, merchant_id, method, route, amount, currency, status, latency_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['tx-xof', merchantId, 'wallet', 'ORANGE_SN', 50000, 'XOF', 'success', 350]
      );

      // Query by method (should aggregate by currency)
      const { rows } = await pool.query(
        `SELECT * FROM v_routing_stats_by_method WHERE merchant_id = $1`,
        [merchantId]
      );

      assert.strictEqual(rows.length, 3);  // 3 different methods
      const currencies = rows.map(r => r.currency);
      assert.ok(currencies.includes('USD'));
      assert.ok(currencies.includes('EUR'));
      assert.ok(currencies.includes('XOF'));

      console.log('✅ Multi-currency routing supported: USD, EUR, XOF');
    });
  });
});
