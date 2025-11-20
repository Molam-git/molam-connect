/**
 * BRIQUE 147 — SIRA Integration Tests
 */
import { getOptimalVariant, updateBanditState, shouldStopExperiment, getExperimentInsights } from '../src/services/sira';
import { pool } from '../src/db';

describe('SIRA Service', () => {
  let experimentId: string;
  let variantAId: string;
  let variantBId: string;

  beforeAll(async () => {
    // Create test experiment
    const { rows: [exp] } = await pool.query(
      `INSERT INTO experiments (name, status, created_by)
       VALUES ('SIRA Test', 'running', '00000000-0000-0000-0000-000000000001')
       RETURNING id`
    );
    experimentId = exp.id;

    // Create variants
    const { rows: [varA] } = await pool.query(
      `INSERT INTO experiment_variants (experiment_id, name, config, traffic_share, is_control)
       VALUES ($1, 'Control', '{}', 50, true)
       RETURNING id`,
      [experimentId]
    );
    variantAId = varA.id;

    const { rows: [varB] } = await pool.query(
      `INSERT INTO experiment_variants (experiment_id, name, config, traffic_share, is_control)
       VALUES ($1, 'Variant B', '{"button_color":"blue"}', 50, false)
       RETURNING id`,
      [experimentId]
    );
    variantBId = varB.id;

    // Initialize bandit state
    await pool.query(
      `INSERT INTO experiment_bandit_state (experiment_id, variant_id, alpha, beta, total_samples)
       VALUES ($1, $2, 1, 1, 0), ($1, $3, 1, 1, 0)`,
      [experimentId, variantAId, variantBId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM experiments WHERE id = $1', [experimentId]);
    await pool.end();
  });

  describe('getOptimalVariant', () => {
    it('should return a variant ID', async () => {
      const variantId = await getOptimalVariant(experimentId, 'test_user_1');

      expect(variantId).toBeTruthy();
      expect([variantAId, variantBId]).toContain(variantId);
    });

    it('should initialize bandit state if missing', async () => {
      // Create new experiment without bandit state
      const { rows: [newExp] } = await pool.query(
        `INSERT INTO experiments (name, status, created_by)
         VALUES ('New Exp', 'running', '00000000-0000-0000-0000-000000000001')
         RETURNING id`
      );

      await pool.query(
        `INSERT INTO experiment_variants (experiment_id, name, config, traffic_share)
         VALUES ($1, 'A', '{}', 50), ($1, 'B', '{}', 50)`,
        [newExp.id]
      );

      const variantId = await getOptimalVariant(newExp.id, 'test_user_2');

      expect(variantId).toBeTruthy();

      // Cleanup
      await pool.query('DELETE FROM experiments WHERE id = $1', [newExp.id]);
    });
  });

  describe('updateBanditState', () => {
    it('should increment alpha on success', async () => {
      const { rows: [before] } = await pool.query(
        `SELECT alpha, beta, total_samples FROM experiment_bandit_state
         WHERE experiment_id = $1 AND variant_id = $2`,
        [experimentId, variantAId]
      );

      await updateBanditState(experimentId, variantAId, true);

      const { rows: [after] } = await pool.query(
        `SELECT alpha, beta, total_samples FROM experiment_bandit_state
         WHERE experiment_id = $1 AND variant_id = $2`,
        [experimentId, variantAId]
      );

      expect(parseFloat(after.alpha)).toBe(parseFloat(before.alpha) + 1);
      expect(parseFloat(after.beta)).toBe(parseFloat(before.beta));
      expect(after.total_samples).toBe(before.total_samples + 1);
    });

    it('should increment beta on failure', async () => {
      const { rows: [before] } = await pool.query(
        `SELECT alpha, beta, total_samples FROM experiment_bandit_state
         WHERE experiment_id = $1 AND variant_id = $2`,
        [experimentId, variantBId]
      );

      await updateBanditState(experimentId, variantBId, false);

      const { rows: [after] } = await pool.query(
        `SELECT alpha, beta, total_samples FROM experiment_bandit_state
         WHERE experiment_id = $1 AND variant_id = $2`,
        [experimentId, variantBId]
      );

      expect(parseFloat(after.alpha)).toBe(parseFloat(before.alpha));
      expect(parseFloat(after.beta)).toBe(parseFloat(before.beta) + 1);
      expect(after.total_samples).toBe(before.total_samples + 1);
    });
  });

  describe('shouldStopExperiment', () => {
    it('should not stop with insufficient samples', async () => {
      const result = await shouldStopExperiment(experimentId, 0.95, 100);

      expect(result.shouldStop).toBe(false);
    });

    it('should detect losing variant', async () => {
      // Simulate variant A winning heavily
      await pool.query(
        `UPDATE experiment_bandit_state
         SET alpha = 100, beta = 10, total_samples = 110
         WHERE experiment_id = $1 AND variant_id = $2`,
        [experimentId, variantAId]
      );

      await pool.query(
        `UPDATE experiment_bandit_state
         SET alpha = 10, beta = 100, total_samples = 110
         WHERE experiment_id = $1 AND variant_id = $2`,
        [experimentId, variantBId]
      );

      const result = await shouldStopExperiment(experimentId, 0.95, 100);

      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBeTruthy();
      expect(result.variantId).toBe(variantBId);
    });
  });

  describe('getExperimentInsights', () => {
    it('should return insights with confidence intervals', async () => {
      // Add some data
      await pool.query(
        `UPDATE experiment_bandit_state
         SET alpha = 50, beta = 50, total_samples = 100
         WHERE experiment_id = $1 AND variant_id = $2`,
        [experimentId, variantAId]
      );

      const insights = await getExperimentInsights(experimentId);

      expect(insights.insights).toBeTruthy();
      expect(Array.isArray(insights.insights)).toBe(true);
      expect(insights.recommendation).toBeTruthy();

      if (insights.insights.length > 0) {
        const firstInsight = insights.insights[0];
        expect(firstInsight.variant).toBeTruthy();
        expect(firstInsight.conversion_rate).toBeGreaterThanOrEqual(0);
        expect(firstInsight.conversion_rate).toBeLessThanOrEqual(1);
        expect(firstInsight.confidence_interval).toBeTruthy();
        expect(firstInsight.confidence_interval.lower).toBeGreaterThanOrEqual(0);
        expect(firstInsight.confidence_interval.upper).toBeLessThanOrEqual(1);
      }
    });

    it('should recommend collecting more data with few samples', async () => {
      // Reset to minimal samples
      await pool.query(
        `UPDATE experiment_bandit_state
         SET alpha = 2, beta = 2, total_samples = 4
         WHERE experiment_id = $1`,
        [experimentId]
      );

      const insights = await getExperimentInsights(experimentId);

      expect(insights.recommendation).toContain('more data');
    });
  });
});
