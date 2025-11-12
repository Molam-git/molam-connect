/**
 * Tests for AI Engine Service
 */

import { generateRecommendations, fetchMerchantMetrics, calculateConfidence } from '../src/services/aiEngine';

describe('AI Engine Service', () => {
  describe('fetchMerchantMetrics', () => {
    it('should fetch comprehensive merchant metrics', async () => {
      const merchantId = 'test-merchant-id';
      const metrics = await fetchMerchantMetrics(merchantId, '30d');

      expect(metrics).toHaveProperty('merchantId', merchantId);
      expect(metrics).toHaveProperty('totalOrders');
      expect(metrics).toHaveProperty('abandonmentRate');
      expect(metrics).toHaveProperty('avgOrderValue');
      expect(metrics).toHaveProperty('churnRate');
      expect(metrics).toHaveProperty('totalCustomers');
    });

    it('should calculate abandonment rate correctly', async () => {
      const merchantId = 'test-merchant-id';
      const metrics = await fetchMerchantMetrics(merchantId, '30d');

      expect(metrics.abandonmentRate).toBeGreaterThanOrEqual(0);
      expect(metrics.abandonmentRate).toBeLessThanOrEqual(1);
    });

    it('should support different timeframes', async () => {
      const merchantId = 'test-merchant-id';

      const metrics7d = await fetchMerchantMetrics(merchantId, '7d');
      const metrics30d = await fetchMerchantMetrics(merchantId, '30d');
      const metrics90d = await fetchMerchantMetrics(merchantId, '90d');

      expect(metrics7d.timeframe).toBe('7d');
      expect(metrics30d.timeframe).toBe('30d');
      expect(metrics90d.timeframe).toBe('90d');
    });
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations for high abandonment rate', async () => {
      const merchantId = 'test-merchant-high-abandonment';
      const recommendations = await generateRecommendations(merchantId);

      const abandonmentRec = recommendations.find(
        r => r.recommendation.target === 'abandoned_carts'
      );

      expect(abandonmentRec).toBeDefined();
      expect(abandonmentRec?.recommendation.type).toBe('promo_code');
      expect(abandonmentRec?.confidence).toBeGreaterThan(0);
    });

    it('should generate recommendations for inactive customers', async () => {
      const merchantId = 'test-merchant-inactive-customers';
      const recommendations = await generateRecommendations(merchantId);

      const inactiveRec = recommendations.find(
        r => r.recommendation.target === 'inactive_customers'
      );

      if (inactiveRec) {
        expect(inactiveRec.recommendation.type).toBe('coupon');
        expect(inactiveRec.confidence).toBeGreaterThan(0);
        expect(inactiveRec.confidence).toBeLessThanOrEqual(100);
      }
    });

    it('should generate multiple recommendations', async () => {
      const merchantId = 'test-merchant-id';
      const recommendations = await generateRecommendations(merchantId);

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);

      recommendations.forEach(rec => {
        expect(rec).toHaveProperty('id');
        expect(rec).toHaveProperty('merchantId', merchantId);
        expect(rec).toHaveProperty('recommendation');
        expect(rec).toHaveProperty('confidence');
        expect(rec).toHaveProperty('dataPoints');
      });
    });

    it('should include expected impact in recommendations', async () => {
      const merchantId = 'test-merchant-id';
      const recommendations = await generateRecommendations(merchantId);

      recommendations.forEach(rec => {
        expect(rec.recommendation.expectedImpact).toHaveProperty('conversionUplift');
        expect(rec.recommendation.expectedImpact).toHaveProperty('revenueImpact');
        expect(rec.recommendation.expectedImpact.conversionUplift).toBeGreaterThan(0);
      });
    });

    it('should set appropriate confidence scores', async () => {
      const merchantId = 'test-merchant-id';
      const recommendations = await generateRecommendations(merchantId);

      recommendations.forEach(rec => {
        expect(rec.confidence).toBeGreaterThanOrEqual(0);
        expect(rec.confidence).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Recommendation Types', () => {
    it('should generate promo code recommendations', async () => {
      const merchantId = 'test-merchant-id';
      const recommendations = await generateRecommendations(merchantId);

      const promoRecs = recommendations.filter(
        r => r.recommendation.type === 'promo_code'
      );

      promoRecs.forEach(rec => {
        expect(rec.recommendation).toHaveProperty('discountType');
        expect(rec.recommendation).toHaveProperty('discountValue');
        expect(['percentage', 'fixed', 'free_shipping']).toContain(
          rec.recommendation.discountType
        );
      });
    });

    it('should generate coupon recommendations', async () => {
      const merchantId = 'test-merchant-id';
      const recommendations = await generateRecommendations(merchantId);

      const couponRecs = recommendations.filter(
        r => r.recommendation.type === 'coupon'
      );

      couponRecs.forEach(rec => {
        expect(rec.recommendation.target).toBeDefined();
        expect(rec.recommendation.durationDays).toBeGreaterThan(0);
      });
    });

    it('should generate subscription plan recommendations', async () => {
      const merchantId = 'test-merchant-id';
      const recommendations = await generateRecommendations(merchantId);

      const subRecs = recommendations.filter(
        r => r.recommendation.type === 'subscription_plan'
      );

      subRecs.forEach(rec => {
        expect(rec.recommendation.target).toBeDefined();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle merchant with no orders', async () => {
      const merchantId = 'test-merchant-no-orders';
      const recommendations = await generateRecommendations(merchantId);

      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should handle merchant with perfect metrics', async () => {
      const merchantId = 'test-merchant-perfect';
      const recommendations = await generateRecommendations(merchantId);

      expect(Array.isArray(recommendations)).toBe(true);
    });
  });
});
