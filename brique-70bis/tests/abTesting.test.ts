/**
 * Tests for A/B Testing Service
 */

import {
  createABTest,
  startABTest,
  stopABTest,
  recordImpression,
  recordClick,
  recordConversion,
  analyzeABTest,
  getABTest,
} from '../src/services/abTesting';

describe('A/B Testing Service', () => {
  let testId: string;

  const variantA = {
    name: 'Control - 10% discount',
    promoCode: {
      discountType: 'percentage' as const,
      discountValue: 10,
    },
    message: 'Save 10%',
  };

  const variantB = {
    name: 'Test - 15% discount',
    promoCode: {
      discountType: 'percentage' as const,
      discountValue: 15,
    },
    message: 'Save 15% - Limited Time!',
  };

  describe('createABTest', () => {
    it('should create a new A/B test', async () => {
      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'Test Discount Levels',
        description: 'Testing 10% vs 15% discount',
        variantA,
        variantB,
        startDate: new Date(),
        autoDeployWinner: true,
        createdBy: 'test-user-id',
      });

      testId = test.id;

      expect(test).toHaveProperty('id');
      expect(test.name).toBe('Test Discount Levels');
      expect(test.status).toBe('draft');
      expect(test.variantA).toEqual(variantA);
      expect(test.variantB).toEqual(variantB);
      expect(test.autoDeployWinner).toBe(true);
    });

    it('should create test with 3 variants', async () => {
      const variantC = {
        name: 'Test - 20% discount',
        promoCode: {
          discountType: 'percentage' as const,
          discountValue: 20,
        },
        message: 'Save 20%!',
      };

      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'Test 3 Variants',
        variantA,
        variantB,
        variantC,
        startDate: new Date(),
        createdBy: 'test-user-id',
      });

      expect(test.variantC).toEqual(variantC);
      expect(test.trafficSplit).toHaveProperty('a');
      expect(test.trafficSplit).toHaveProperty('b');
      expect(test.trafficSplit).toHaveProperty('c');
    });

    it('should default to 50/50 traffic split for 2 variants', async () => {
      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'Test Default Split',
        variantA,
        variantB,
        startDate: new Date(),
        createdBy: 'test-user-id',
      });

      expect(test.trafficSplit.a).toBe(50);
      expect(test.trafficSplit.b).toBe(50);
    });
  });

  describe('startABTest', () => {
    it('should start a draft test', async () => {
      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'Test to Start',
        variantA,
        variantB,
        startDate: new Date(),
        createdBy: 'test-user-id',
      });

      const startedTest = await startABTest(test.id);

      expect(startedTest.status).toBe('running');
      expect(startedTest.startDate).toBeDefined();
    });

    it('should not start already running test', async () => {
      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'Test Already Running',
        variantA,
        variantB,
        startDate: new Date(),
        createdBy: 'test-user-id',
      });

      await startABTest(test.id);

      await expect(startABTest(test.id)).rejects.toThrow();
    });
  });

  describe('Tracking', () => {
    let runningTestId: string;

    beforeEach(async () => {
      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'Tracking Test',
        variantA,
        variantB,
        startDate: new Date(),
        createdBy: 'test-user-id',
      });
      await startABTest(test.id);
      runningTestId = test.id;
    });

    it('should record impressions', async () => {
      await recordImpression(runningTestId, 'a');
      await recordImpression(runningTestId, 'b');

      const test = await getABTest(runningTestId);

      expect(test?.metricsA.impressions).toBeGreaterThan(0);
      expect(test?.metricsB.impressions).toBeGreaterThan(0);
    });

    it('should record clicks and calculate CTR', async () => {
      // Record some impressions first
      for (let i = 0; i < 10; i++) {
        await recordImpression(runningTestId, 'a');
      }

      // Record some clicks
      for (let i = 0; i < 3; i++) {
        await recordClick(runningTestId, 'a');
      }

      const test = await getABTest(runningTestId);

      expect(test?.metricsA.clicks).toBe(3);
      expect(test?.metricsA.ctr).toBeGreaterThan(0);
    });

    it('should record conversions and calculate CVR', async () => {
      // Record impressions and clicks
      for (let i = 0; i < 10; i++) {
        await recordImpression(runningTestId, 'a');
        await recordClick(runningTestId, 'a');
      }

      // Record conversions
      await recordConversion(runningTestId, 'a', 100);
      await recordConversion(runningTestId, 'a', 150);

      const test = await getABTest(runningTestId);

      expect(test?.metricsA.conversions).toBe(2);
      expect(test?.metricsA.revenue).toBe(250);
      expect(test?.metricsA.cvr).toBeGreaterThan(0);
      expect(test?.metricsA.avgOrderValue).toBe(125);
    });
  });

  describe('analyzeABTest', () => {
    it('should analyze test and determine winner', async () => {
      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'Analysis Test',
        variantA,
        variantB,
        startDate: new Date(),
        createdBy: 'test-user-id',
      });
      await startABTest(test.id);

      // Simulate variant B performing better
      for (let i = 0; i < 100; i++) {
        await recordImpression(test.id, 'a');
        await recordImpression(test.id, 'b');

        if (i % 10 === 0) {
          await recordClick(test.id, 'a');
          await recordClick(test.id, 'b');
          await recordClick(test.id, 'b'); // B gets more clicks
        }

        if (i % 20 === 0) {
          await recordConversion(test.id, 'a', 100);
          await recordConversion(test.id, 'b', 100);
          await recordConversion(test.id, 'b', 100); // B gets more conversions
        }
      }

      const result = await analyzeABTest(test.id);

      expect(result).toHaveProperty('winner');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('uplift');
      expect(result).toHaveProperty('statisticalSignificance');
      expect(result).toHaveProperty('recommendation');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('should require minimum data for statistical significance', async () => {
      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'Low Data Test',
        variantA,
        variantB,
        startDate: new Date(),
        createdBy: 'test-user-id',
      });
      await startABTest(test.id);

      // Record minimal data
      for (let i = 0; i < 10; i++) {
        await recordImpression(test.id, 'a');
        await recordImpression(test.id, 'b');
      }

      const result = await analyzeABTest(test.id);

      expect(result.statisticalSignificance).toBe(false);
      expect(result.recommendation).toContain('more data');
    });

    it('should calculate uplift correctly', async () => {
      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'Uplift Test',
        variantA,
        variantB,
        startDate: new Date(),
        createdBy: 'test-user-id',
      });
      await startABTest(test.id);

      // Simulate clear winner
      for (let i = 0; i < 200; i++) {
        await recordImpression(test.id, 'a');
        await recordImpression(test.id, 'b');

        if (i % 10 === 0) {
          await recordClick(test.id, 'a');
          await recordClick(test.id, 'b');
          await recordClick(test.id, 'b'); // B performs 2x better
        }
      }

      const result = await analyzeABTest(test.id);

      expect(result.uplift).toBeGreaterThan(0);
    });
  });

  describe('stopABTest', () => {
    it('should stop a running test', async () => {
      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'Test to Stop',
        variantA,
        variantB,
        startDate: new Date(),
        createdBy: 'test-user-id',
      });
      await startABTest(test.id);

      const stoppedTest = await stopABTest(test.id, 'completed');

      expect(stoppedTest.status).toBe('completed');
      expect(stoppedTest.endDate).toBeDefined();
    });

    it('should support auto-stop status', async () => {
      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'Auto Stop Test',
        variantA,
        variantB,
        startDate: new Date(),
        createdBy: 'test-user-id',
      });
      await startABTest(test.id);

      const stoppedTest = await stopABTest(test.id, 'auto_stopped');

      expect(stoppedTest.status).toBe('auto_stopped');
    });
  });

  describe('Edge Cases', () => {
    it('should handle equal performance variants', async () => {
      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'Equal Performance Test',
        variantA,
        variantB,
        startDate: new Date(),
        createdBy: 'test-user-id',
      });
      await startABTest(test.id);

      // Record identical metrics
      for (let i = 0; i < 100; i++) {
        await recordImpression(test.id, 'a');
        await recordImpression(test.id, 'b');

        if (i % 10 === 0) {
          await recordClick(test.id, 'a');
          await recordClick(test.id, 'b');
          await recordConversion(test.id, 'a', 100);
          await recordConversion(test.id, 'b', 100);
        }
      }

      const result = await analyzeABTest(test.id);

      expect(result.winner).toBe('no_clear_winner');
      expect(result.uplift).toBeLessThan(5);
    });

    it('should handle test with no data', async () => {
      const test = await createABTest({
        merchantId: 'test-merchant-id',
        name: 'No Data Test',
        variantA,
        variantB,
        startDate: new Date(),
        createdBy: 'test-user-id',
      });
      await startABTest(test.id);

      const result = await analyzeABTest(test.id);

      expect(result).toBeDefined();
      expect(result.statisticalSignificance).toBe(false);
    });
  });
});
