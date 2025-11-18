// =====================================================================
// Brique 81 — Billing Overages Tests
// =====================================================================
// Comprehensive test suite for overage billing functionality
// Date: 2025-11-12
// =====================================================================

import { Pool } from 'pg';
import { OveragePricingService } from '../src/overages/pricing';
import { ComputeAmountService } from '../src/overages/computeAmount';
import { SIRATrendAnalyzer } from '../src/sira/hook';

describe('Brique 81 — Billing Overages', () => {
  let pool: Pool;
  let pricingService: OveragePricingService;
  let computeService: ComputeAmountService;
  let trendAnalyzer: SIRATrendAnalyzer;

  const testTenantId = '00000000-0000-0000-0000-000000000001';
  const testApiKeyId = 'test_key_001';

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432'),
      database: process.env.PGDATABASE || 'molam_connect_test',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
    });

    pricingService = new OveragePricingService(pool);
    computeService = new ComputeAmountService(pool);
    trendAnalyzer = new SIRATrendAnalyzer(pool);

    // Run schema
    const schemaSQL = require('fs').readFileSync(
      __dirname + '/../sql/010_billing_overages_schema.sql',
      'utf8'
    );
    await pool.query(schemaSQL);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM billing_overages WHERE tenant_id = $1', [testTenantId]);
    await pool.query('DELETE FROM billing_overage_events WHERE tenant_id = $1', [testTenantId]);
    await pool.query('DELETE FROM overage_trends WHERE tenant_id = $1', [testTenantId]);
  });

  // ===================================================================
  // Pricing Service Tests
  // ===================================================================

  describe('Pricing Service', () => {
    test('should get pricing with fallback hierarchy', async () => {
      // Test plan+country specific pricing
      let pricing = await pricingService.getPricing({
        planId: 'free',
        country: 'US',
        metric: 'requests_per_day',
      });

      expect(pricing).toBeTruthy();
      expect(pricing?.metric).toBe('requests_per_day');
      expect(pricing?.currency).toBe('USD');
    });

    test('should fallback to global pricing if no specific match', async () => {
      const pricing = await pricingService.getPricing({
        planId: 'nonexistent_plan',
        country: 'XX',
        metric: 'requests_per_day',
      });

      // Should fallback to global default
      expect(pricing).toBeTruthy();
      expect(pricing?.plan_id).toBeNull();
      expect(pricing?.country).toBeNull();
    });

    test('should create/update pricing rule', async () => {
      const newPricing = await pricingService.upsertPricing({
        metric: 'custom_metric',
        billingModel: 'per_unit',
        currency: 'USD',
        unitPrice: 0.05,
        planId: 'starter',
        country: 'US',
        createdBy: 'test_user',
      });

      expect(newPricing.metric).toBe('custom_metric');
      expect(newPricing.unit_price).toBe(0.05);

      // Verify it was stored
      const retrieved = await pricingService.getPricing({
        planId: 'starter',
        country: 'US',
        metric: 'custom_metric',
      });

      expect(retrieved?.unit_price).toBe(0.05);
    });

    test('should get tiered pricing tiers', async () => {
      // Create tiered pricing
      await pricingService.upsertPricing({
        metric: 'tiered_metric',
        billingModel: 'tiered',
        currency: 'USD',
        planId: 'starter',
        tiers: [
          { from_units: 0, to_units: 1000, unit_price: 0.01 },
          { from_units: 1001, to_units: 5000, unit_price: 0.008 },
          { from_units: 5001, to_units: null, unit_price: 0.005 },
        ],
        createdBy: 'test_user',
      });

      const tiers = await pricingService.getTieredPricing({
        planId: 'starter',
        country: 'US',
        metric: 'tiered_metric',
      });

      expect(tiers.length).toBe(3);
      expect(tiers[0].unit_price).toBe(0.01);
      expect(tiers[2].to_units).toBeNull();
    });
  });

  // ===================================================================
  // Compute Amount Tests
  // ===================================================================

  describe('Compute Amount Service', () => {
    test('should compute per-unit billing correctly', async () => {
      const result = await computeService.computeAmount({
        tenantId: testTenantId,
        apiKeyId: testApiKeyId,
        planId: 'free',
        country: 'US',
        metric: 'requests_per_day',
        unitsExceeded: 5000,
        timestamp: new Date(),
      });

      expect(result.billingModel).toBe('per_unit');
      expect(result.units).toBe(5000);
      expect(result.amount).toBeGreaterThan(0);
      expect(result.currency).toBe('USD');
    });

    test('should compute fixed billing correctly', async () => {
      // Create fixed pricing
      await pricingService.upsertPricing({
        metric: 'fixed_metric',
        billingModel: 'fixed',
        currency: 'USD',
        fixedAmount: 50.0,
        planId: 'free',
        createdBy: 'test_user',
      });

      const result = await computeService.computeAmount({
        tenantId: testTenantId,
        apiKeyId: testApiKeyId,
        planId: 'free',
        country: 'US',
        metric: 'fixed_metric',
        unitsExceeded: 1000,
        timestamp: new Date(),
      });

      expect(result.billingModel).toBe('fixed');
      expect(result.amount).toBe(50.0);
    });

    test('should compute tiered billing correctly', async () => {
      // Create tiered pricing
      await pricingService.upsertPricing({
        metric: 'tiered_test',
        billingModel: 'tiered',
        currency: 'USD',
        planId: 'free',
        tiers: [
          { from_units: 0, to_units: 1000, unit_price: 0.01 },
          { from_units: 1001, to_units: 5000, unit_price: 0.008 },
          { from_units: 5001, to_units: null, unit_price: 0.005 },
        ],
        createdBy: 'test_user',
      });

      const result = await computeService.computeAmount({
        tenantId: testTenantId,
        apiKeyId: testApiKeyId,
        planId: 'free',
        country: 'US',
        metric: 'tiered_test',
        unitsExceeded: 6000,
        timestamp: new Date(),
      });

      expect(result.billingModel).toBe('tiered');
      expect(result.tierBreakdown).toBeTruthy();
      expect(result.tierBreakdown?.length).toBe(3);

      // Calculate expected amount:
      // Tier 1: 1000 units @ $0.01 = $10
      // Tier 2: 4000 units @ $0.008 = $32
      // Tier 3: 1000 units @ $0.005 = $5
      // Total: $47
      expect(result.amount).toBeCloseTo(47.0, 2);
    });

    test('should preview amount without saving', async () => {
      const preview = await computeService.previewAmount({
        planId: 'free',
        country: 'US',
        metric: 'requests_per_day',
        unitsExceeded: 1000,
      });

      expect(preview.amount).toBeGreaterThan(0);
      expect(preview.currency).toBe('USD');
    });

    test('should batch compute multiple overages', async () => {
      const overages = [
        {
          tenantId: testTenantId,
          apiKeyId: testApiKeyId,
          planId: 'free',
          country: 'US',
          metric: 'requests_per_day',
          unitsExceeded: 1000,
          timestamp: new Date(),
        },
        {
          tenantId: testTenantId,
          apiKeyId: testApiKeyId,
          planId: 'free',
          country: 'US',
          metric: 'requests_per_month',
          unitsExceeded: 5000,
          timestamp: new Date(),
        },
      ];

      const results = await computeService.batchCompute(overages);

      expect(results.size).toBe(2);
    });
  });

  // ===================================================================
  // Idempotency Tests
  // ===================================================================

  describe('Idempotent Event Processing', () => {
    test('should handle duplicate events idempotently', async () => {
      const eventId = `test_event_${Date.now()}`;

      // Insert first event
      await pool.query(
        `
        INSERT INTO billing_overage_events (
          event_id, tenant_id, api_key_id, plan_id, country,
          metric, quota_limit, units_exceeded, event_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `,
        [eventId, testTenantId, testApiKeyId, 'free', 'US', 'requests_per_day', 10000, 1000]
      );

      // Try to insert duplicate (should fail silently)
      const result = await pool.query(
        `
        INSERT INTO billing_overage_events (
          event_id, tenant_id, api_key_id, plan_id, country,
          metric, quota_limit, units_exceeded, event_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (event_id) DO NOTHING
        RETURNING id
        `,
        [eventId, testTenantId, testApiKeyId, 'free', 'US', 'requests_per_day', 10000, 1000]
      );

      // Should return no rows (conflict detected)
      expect(result.rows.length).toBe(0);

      // Verify only one event exists
      const count = await pool.query(
        'SELECT COUNT(*) FROM billing_overage_events WHERE event_id = $1',
        [eventId]
      );
      expect(parseInt(count.rows[0].count)).toBe(1);
    });
  });

  // ===================================================================
  // Currency Tests
  // ===================================================================

  describe('Multi-Currency Pricing', () => {
    test('should use country-specific currency', async () => {
      // Test EUR pricing for France
      const pricing = await pricingService.getPricing({
        planId: 'free',
        country: 'FR',
        metric: 'requests_per_day',
      });

      expect(pricing?.currency).toBe('EUR');
    });

    test('should use XOF for Ivory Coast', async () => {
      const pricing = await pricingService.getPricing({
        planId: 'free',
        country: 'CI',
        metric: 'requests_per_day',
      });

      expect(pricing?.currency).toBe('XOF');
    });
  });

  // ===================================================================
  // SIRA Trend Analysis Tests
  // ===================================================================

  describe('SIRA Trend Analysis', () => {
    test('should analyze trends with sufficient data', async () => {
      // Insert 6 months of mock overage data
      const months = 6;
      for (let i = 0; i < months; i++) {
        const timestamp = new Date();
        timestamp.setMonth(timestamp.getMonth() - i);

        await pool.query(
          `
          INSERT INTO billing_overages (
            event_id, tenant_id, api_key_id, plan_id, country,
            metric, units, unit_price, amount, currency,
            billing_model, overage_timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            `test_event_${i}_${Date.now()}`,
            testTenantId,
            testApiKeyId,
            'free',
            'US',
            'requests_per_day',
            1000 * (i + 1), // Increasing trend
            0.01,
            10.0 * (i + 1),
            'USD',
            'per_unit',
            timestamp,
          ]
        );
      }

      // Analyze trends
      const trends = await trendAnalyzer.analyzeTenantTrends(testTenantId);

      expect(trends.length).toBeGreaterThan(0);
      expect(trends[0].metric).toBe('requests_per_day');
      expect(trends[0].trend_direction).toBe('up');
      expect(trends[0].growth_rate_percent).toBeGreaterThan(0);
    });

    test('should generate plan recommendation for high overages', async () => {
      // Insert high overage data
      for (let i = 0; i < 3; i++) {
        const timestamp = new Date();
        timestamp.setMonth(timestamp.getMonth() - i);

        await pool.query(
          `
          INSERT INTO billing_overages (
            event_id, tenant_id, api_key_id, plan_id, country,
            metric, units, unit_price, amount, currency,
            billing_model, overage_timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            `high_overage_${i}_${Date.now()}`,
            testTenantId,
            testApiKeyId,
            'free',
            'US',
            'requests_per_day',
            50000,
            0.01,
            500.0, // $500/month in overages
            'USD',
            'per_unit',
            timestamp,
          ]
        );
      }

      // Create tenant
      await pool.query(
        `INSERT INTO tenants (id, plan_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [testTenantId, 'free']
      );

      const recommendation = await trendAnalyzer.generatePlanRecommendation(testTenantId);

      expect(recommendation).toBeTruthy();
      expect(recommendation?.recommended_plan_id).toBe('starter');
      expect(recommendation?.estimated_savings).toBeGreaterThan(0);
    });
  });

  // ===================================================================
  // Override Tests
  // ===================================================================

  describe('Ops Override Capabilities', () => {
    test('should void an overage', async () => {
      // Create overage
      const result = await pool.query(
        `
        INSERT INTO billing_overages (
          event_id, tenant_id, api_key_id, plan_id, country,
          metric, units, unit_price, amount, currency,
          billing_model, overage_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        RETURNING id::text
        `,
        [
          `void_test_${Date.now()}`,
          testTenantId,
          testApiKeyId,
          'free',
          'US',
          'requests_per_day',
          1000,
          0.01,
          10.0,
          'USD',
          'per_unit',
        ]
      );

      const overageId = result.rows[0].id;

      // Void it
      await pool.query(
        `
        UPDATE billing_overages
        SET billing_status = 'voided', override_by = $2, override_reason = $3
        WHERE id = $1
        `,
        [overageId, 'ops_user', 'Test void']
      );

      // Verify
      const voided = await pool.query(
        'SELECT billing_status FROM billing_overages WHERE id = $1',
        [overageId]
      );

      expect(voided.rows[0].billing_status).toBe('voided');
    });

    test('should adjust overage amount', async () => {
      // Create overage
      const result = await pool.query(
        `
        INSERT INTO billing_overages (
          event_id, tenant_id, api_key_id, plan_id, country,
          metric, units, unit_price, amount, currency,
          billing_model, overage_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        RETURNING id::text
        `,
        [
          `adjust_test_${Date.now()}`,
          testTenantId,
          testApiKeyId,
          'free',
          'US',
          'requests_per_day',
          1000,
          0.01,
          10.0,
          'USD',
          'per_unit',
        ]
      );

      const overageId = result.rows[0].id;

      // Adjust to $5
      await pool.query(
        `
        UPDATE billing_overages
        SET amount = $2, override_by = $3, override_reason = $4
        WHERE id = $1
        `,
        [overageId, 5.0, 'ops_user', 'Discount applied']
      );

      // Verify
      const adjusted = await pool.query('SELECT amount FROM billing_overages WHERE id = $1', [
        overageId,
      ]);

      expect(adjusted.rows[0].amount).toBe(5.0);
    });
  });

  // ===================================================================
  // SQL Function Tests
  // ===================================================================

  describe('SQL Functions', () => {
    test('get_overage_pricing function should return correct pricing', async () => {
      const result = await pool.query(
        `SELECT * FROM get_overage_pricing($1, $2, $3)`,
        ['free', 'US', 'requests_per_day']
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].currency).toBe('USD');
    });

    test('compute_overage_amount function should calculate correctly', async () => {
      const result = await pool.query(
        `SELECT compute_overage_amount($1, $2, $3, $4) as amount`,
        ['free', 'US', 'requests_per_day', 1000]
      );

      expect(result.rows[0].amount).toBeGreaterThan(0);
    });
  });

  // ===================================================================
  // Load Tests
  // ===================================================================

  describe('Load Tests', () => {
    test('should handle high volume of concurrent overage processing', async () => {
      const promises = [];

      for (let i = 0; i < 100; i++) {
        promises.push(
          pool.query(
            `
            INSERT INTO billing_overage_events (
              event_id, tenant_id, api_key_id, plan_id, country,
              metric, quota_limit, units_exceeded, event_timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (event_id) DO NOTHING
            `,
            [
              `load_test_${i}_${Date.now()}`,
              testTenantId,
              testApiKeyId,
              'free',
              'US',
              'requests_per_day',
              10000,
              Math.floor(Math.random() * 5000),
            ]
          )
        );
      }

      await Promise.all(promises);

      const count = await pool.query(
        'SELECT COUNT(*) FROM billing_overage_events WHERE tenant_id = $1',
        [testTenantId]
      );

      expect(parseInt(count.rows[0].count)).toBeGreaterThanOrEqual(100);
    }, 30000); // 30 second timeout
  });
});
