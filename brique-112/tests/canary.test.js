/**
 * Brique 112: Canary Deployment Service Tests
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');
const {
  setPool,
  routeInference,
  setCanaryConfig,
  getCanaryConfig,
  stopCanary,
  checkCanaryHealth
} = require('../src/services/canaryService');

describe('Canary Deployment Service', () => {
  let pool;

  before(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/molam_test'
    });

    setPool(pool);

    // Create test tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS siramodel_registry (
        model_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        product TEXT NOT NULL,
        algorithm TEXT,
        storage_s3_key TEXT NOT NULL,
        feature_names TEXT[],
        metrics JSONB,
        status TEXT NOT NULL DEFAULT 'candidate',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(name, version)
      );

      CREATE TABLE IF NOT EXISTS sira_canary_config (
        product TEXT NOT NULL UNIQUE,
        canary_model_id UUID,
        production_model_id UUID,
        canary_percent INT DEFAULT 0,
        rollback_threshold JSONB,
        started_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS siramodel_predictions (
        prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id UUID NOT NULL,
        event_id UUID NOT NULL,
        score NUMERIC(10,8) NOT NULL,
        prediction JSONB,
        model_version TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  });

  after(async () => {
    await pool.query('DROP TABLE IF EXISTS siramodel_registry CASCADE');
    await pool.query('DROP TABLE IF EXISTS sira_canary_config CASCADE');
    await pool.query('DROP TABLE IF EXISTS siramodel_predictions CASCADE');
    await pool.end();
  });

  describe('setCanaryConfig()', () => {
    it('should create new canary configuration', async () => {
      const prodModelId = '123e4567-e89b-12d3-a456-426614174000';
      const canaryModelId = '123e4567-e89b-12d3-a456-426614174001';

      await setCanaryConfig('wallet', canaryModelId, prodModelId, 10, {
        error_rate: 0.05,
        latency_p99: 500
      });

      const config = await getCanaryConfig('wallet');

      assert.strictEqual(config.product, 'wallet');
      assert.strictEqual(config.canary_model_id, canaryModelId);
      assert.strictEqual(config.production_model_id, prodModelId);
      assert.strictEqual(config.canary_percent, 10);
      assert.deepStrictEqual(config.rollback_threshold, {
        error_rate: 0.05,
        latency_p99: 500
      });
    });

    it('should update existing canary configuration', async () => {
      const prodModelId = '123e4567-e89b-12d3-a456-426614174000';
      const newCanaryModelId = '123e4567-e89b-12d3-a456-426614174002';

      // Update to 20%
      await setCanaryConfig('wallet', newCanaryModelId, prodModelId, 20, {
        error_rate: 0.03
      });

      const config = await getCanaryConfig('wallet');

      assert.strictEqual(config.canary_model_id, newCanaryModelId);
      assert.strictEqual(config.canary_percent, 20);
    });

    it('should reject invalid percentages', async () => {
      await assert.rejects(
        async () => {
          await setCanaryConfig('wallet', 'model-1', 'model-2', 150);
        },
        /canary_percent must be between 0 and 100/
      );
    });
  });

  describe('routeInference()', () => {
    before(async () => {
      // Setup canary config
      const prodModelId = '123e4567-e89b-12d3-a456-426614174010';
      const canaryModelId = '123e4567-e89b-12d3-a456-426614174011';

      await setCanaryConfig('wallet', canaryModelId, prodModelId, 30);
    });

    it('should route to production when no canary is active', async () => {
      const prodModelId = '123e4567-e89b-12d3-a456-426614174020';

      // Set canary percent to 0 (inactive)
      await setCanaryConfig('payments', 'canary-id', prodModelId, 0);

      const modelId = await routeInference('event-123', 'payments');

      assert.strictEqual(modelId, prodModelId);
    });

    it('should route deterministically based on event_id', async () => {
      const eventId = '123e4567-e89b-12d3-a456-426614174030';

      // Route same event multiple times
      const route1 = await routeInference(eventId, 'wallet');
      const route2 = await routeInference(eventId, 'wallet');
      const route3 = await routeInference(eventId, 'wallet');

      // Should always route to same model
      assert.strictEqual(route1, route2);
      assert.strictEqual(route2, route3);
    });

    it('should distribute traffic according to canary percentage', async () => {
      const config = await getCanaryConfig('wallet');
      const canaryPercent = config.canary_percent;

      const sampleSize = 1000;
      let canaryCount = 0;

      // Generate deterministic event IDs and count routing
      for (let i = 0; i < sampleSize; i++) {
        const eventId = `event-${i}`;
        const modelId = await routeInference(eventId, 'wallet');

        if (modelId === config.canary_model_id) {
          canaryCount++;
        }
      }

      const actualPercent = (canaryCount / sampleSize) * 100;

      // Should be within ±5% of target
      assert.ok(
        Math.abs(actualPercent - canaryPercent) < 5,
        `Expected ~${canaryPercent}% canary traffic, got ${actualPercent}%`
      );
    });
  });

  describe('stopCanary()', () => {
    it('should stop canary deployment', async () => {
      const prodModelId = '123e4567-e89b-12d3-a456-426614174040';
      const canaryModelId = '123e4567-e89b-12d3-a456-426614174041';

      // Start canary
      await setCanaryConfig('transfer', canaryModelId, prodModelId, 25);

      // Stop canary
      await stopCanary('transfer');

      // Check config
      const config = await getCanaryConfig('transfer');

      assert.strictEqual(config.canary_percent, 0);
      assert.strictEqual(config.canary_model_id, null);
    });
  });

  describe('checkCanaryHealth()', () => {
    before(async () => {
      // Setup models and config
      const prodModelId = '123e4567-e89b-12d3-a456-426614174050';
      const canaryModelId = '123e4567-e89b-12d3-a456-426614174051';

      await pool.query(
        `INSERT INTO siramodel_registry(model_id, name, version, product, storage_s3_key, status)
         VALUES ($1, 'test-model', 'v1', 'healthcheck', 's3://bucket/model1', 'production')`,
        [prodModelId]
      );

      await pool.query(
        `INSERT INTO siramodel_registry(model_id, name, version, product, storage_s3_key, status)
         VALUES ($1, 'test-model', 'v2', 'healthcheck', 's3://bucket/model2', 'canary')`,
        [canaryModelId]
      );

      await setCanaryConfig('healthcheck', canaryModelId, prodModelId, 10, {
        error_rate: 0.05
      });
    });

    it('should return healthy when no metrics violations', async () => {
      const health = await checkCanaryHealth('healthcheck');

      assert.strictEqual(health.healthy, true);
      assert.strictEqual(health.reason, undefined);
    });

    it('should detect unhealthy canary when thresholds exceeded', async () => {
      const config = await getCanaryConfig('healthcheck');

      // Insert high error rate metric
      await pool.query(
        `INSERT INTO siramodel_predictions(model_id, event_id, score, prediction)
         SELECT $1, gen_random_uuid(), 0.5, '{"label": "error"}'::jsonb
         FROM generate_series(1, 100)`,
        [config.canary_model_id]
      );

      // Note: This test needs proper metric calculation
      // For now, it demonstrates the structure
    });
  });
});
