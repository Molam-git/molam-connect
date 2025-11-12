/**
 * Tests for AI Trainer Service
 */

import { fetchMerchantTrainingData, trainLocalModel, aggregateFederatedModels } from '../src/services/aiTrainer';

describe('AI Trainer Service', () => {
  describe('fetchMerchantTrainingData', () => {
    it('should fetch comprehensive training data', async () => {
      const merchantId = 'test-merchant-id';
      const data = await fetchMerchantTrainingData(merchantId, 90);

      expect(data).toHaveProperty('ordersCount');
      expect(data).toHaveProperty('dateRange');
      expect(data).toHaveProperty('features');
      expect(data.features).toHaveProperty('avgOrderValue');
      expect(data.features).toHaveProperty('abandonmentRate');
      expect(data.features).toHaveProperty('churnRate');
    });

    it('should calculate seasonal peaks', async () => {
      const merchantId = 'test-merchant-id';
      const data = await fetchMerchantTrainingData(merchantId, 90);

      expect(Array.isArray(data.features.seasonalPeaks)).toBe(true);
    });
  });

  describe('trainLocalModel', () => {
    it('should train local model and return metrics', async () => {
      const merchantId = 'test-merchant-id';
      const run = await trainLocalModel(merchantId, 'v1.0-test', 'internal');

      expect(run).toHaveProperty('id');
      expect(run).toHaveProperty('metrics');
      expect(run.metrics).toHaveProperty('accuracy');
      expect(run.metrics).toHaveProperty('predictedUplift');
      expect(run.metrics).toHaveProperty('confidence');
      expect(run.metrics.accuracy).toBeGreaterThan(0);
      expect(run.metrics.accuracy).toBeLessThanOrEqual(1);
    });

    it('should store training run in database', async () => {
      const merchantId = 'test-merchant-id';
      const run = await trainLocalModel(merchantId);

      expect(run.id).toBeDefined();
      expect(run.merchantId).toBe(merchantId);
      expect(run.modelType).toBe('local');
    });
  });

  describe('aggregateFederatedModels', () => {
    it('should aggregate multiple local models', async () => {
      // Train multiple local models first
      const merchants = ['merchant-1', 'merchant-2', 'merchant-3', 'merchant-4', 'merchant-5'];

      for (const merchantId of merchants) {
        await trainLocalModel(merchantId);
      }

      const globalModel = await aggregateFederatedModels(5);

      expect(globalModel).toHaveProperty('version');
      expect(globalModel).toHaveProperty('metrics');
      expect(globalModel.metrics.contributing_merchants).toBeGreaterThanOrEqual(5);
    });

    it('should throw error if not enough contributors', async () => {
      await expect(aggregateFederatedModels(100)).rejects.toThrow('Not enough contributors');
    });
  });
});
