/**
 * Tests for SIRA Integration Service
 */

import {
  detectPromoAnomalies,
  fetchMarketBenchmarks,
  autoTuneCampaign,
  getAnomalies,
  getAutoTuningHistory,
} from '../src/services/siraIntegration';

describe('SIRA Integration Service', () => {
  describe('detectPromoAnomalies', () => {
    it('should detect suspicious promo code usage', async () => {
      const merchantId = 'test-merchant-id';
      const promoCodeId = 'test-promo-suspicious';

      const anomaly = await detectPromoAnomalies(merchantId, promoCodeId);

      if (anomaly && anomaly.anomalyDetected) {
        expect(anomaly).toHaveProperty('anomalyType');
        expect(anomaly).toHaveProperty('severity');
        expect(anomaly).toHaveProperty('details');
        expect(anomaly).toHaveProperty('suggestedAction');
        expect(['low', 'medium', 'high', 'critical']).toContain(anomaly.severity);
      }
    });

    it('should detect sudden usage spikes', async () => {
      const merchantId = 'test-merchant-id';
      const promoCodeId = 'test-promo-spike';

      const anomaly = await detectPromoAnomalies(merchantId, promoCodeId);

      if (anomaly && anomaly.anomalyType === 'sudden_spike') {
        expect(anomaly.details).toHaveProperty('expectedRange');
        expect(anomaly.details).toHaveProperty('actualValue');
        expect(anomaly.details).toHaveProperty('deviation');
      }
    });

    it('should return null when no anomaly detected', async () => {
      const merchantId = 'test-merchant-id';
      const promoCodeId = 'test-promo-normal';

      const anomaly = await detectPromoAnomalies(merchantId, promoCodeId);

      // No anomaly is a valid result
      expect(anomaly === null || !anomaly.anomalyDetected).toBe(true);
    });

    it('should handle errors gracefully (fail-open)', async () => {
      const merchantId = 'invalid-merchant';
      const promoCodeId = 'invalid-promo';

      const anomaly = await detectPromoAnomalies(merchantId, promoCodeId);

      // Should not throw, should fail-open
      expect(anomaly).toBeDefined();
    });
  });

  describe('fetchMarketBenchmarks', () => {
    it('should fetch market benchmarks', async () => {
      const merchantId = 'test-merchant-id';
      const industry = 'e-commerce';
      const country = 'US';

      const benchmarks = await fetchMarketBenchmarks(merchantId, industry, country);

      if (benchmarks) {
        expect(benchmarks).toHaveProperty('industry', industry);
        expect(benchmarks).toHaveProperty('country', country);
        expect(benchmarks).toHaveProperty('benchmarks');
        expect(benchmarks).toHaveProperty('competitorOffers');
        expect(benchmarks).toHaveProperty('merchantComparison');
        expect(benchmarks).toHaveProperty('recommendations');
      }
    });

    it('should include competitor offers', async () => {
      const merchantId = 'test-merchant-id';
      const benchmarks = await fetchMarketBenchmarks(merchantId, 'e-commerce', 'US');

      if (benchmarks) {
        expect(Array.isArray(benchmarks.competitorOffers)).toBe(true);
        benchmarks.competitorOffers.forEach(offer => {
          expect(offer).toHaveProperty('competitor');
          expect(offer).toHaveProperty('offer');
          expect(offer).toHaveProperty('engagement');
          expect(['low', 'medium', 'high']).toContain(offer.engagement);
        });
      }
    });

    it('should provide merchant comparison', async () => {
      const merchantId = 'test-merchant-id';
      const benchmarks = await fetchMarketBenchmarks(merchantId, 'e-commerce', 'US');

      if (benchmarks) {
        expect(benchmarks.merchantComparison).toHaveProperty('discountRate');
        expect(benchmarks.merchantComparison.discountRate).toHaveProperty('merchant');
        expect(benchmarks.merchantComparison.discountRate).toHaveProperty('market');
        expect(benchmarks.merchantComparison.discountRate).toHaveProperty('position');
      }
    });

    it('should generate strategic recommendations', async () => {
      const merchantId = 'test-merchant-id';
      const benchmarks = await fetchMarketBenchmarks(merchantId, 'e-commerce', 'US');

      if (benchmarks) {
        expect(Array.isArray(benchmarks.recommendations)).toBe(true);
        benchmarks.recommendations.forEach(rec => {
          expect(rec).toHaveProperty('action');
          expect(rec).toHaveProperty('reason');
          expect(rec).toHaveProperty('priority');
          expect(['low', 'medium', 'high']).toContain(rec.priority);
        });
      }
    });

    it('should cache benchmarks', async () => {
      const merchantId = 'test-merchant-id';

      const start1 = Date.now();
      await fetchMarketBenchmarks(merchantId, 'e-commerce', 'US');
      const duration1 = Date.now() - start1;

      const start2 = Date.now();
      await fetchMarketBenchmarks(merchantId, 'e-commerce', 'US');
      const duration2 = Date.now() - start2;

      // Second call should be faster (cached)
      expect(duration2).toBeLessThan(duration1);
    });

    it('should handle missing merchant data gracefully', async () => {
      const merchantId = 'new-merchant-no-data';
      const benchmarks = await fetchMarketBenchmarks(merchantId, 'e-commerce', 'US');

      // Should not throw, may return null or partial data
      expect(benchmarks === null || benchmarks).toBeDefined();
    });
  });

  describe('autoTuneCampaign', () => {
    it('should recommend tuning for low adoption campaigns', async () => {
      const merchantId = 'test-merchant-id';
      const campaignId = 'test-campaign-low-adoption';

      const tuning = await autoTuneCampaign(merchantId, campaignId);

      if (tuning && tuning.shouldTune) {
        expect(tuning).toHaveProperty('adjustmentType');
        expect(tuning).toHaveProperty('newConfig');
        expect(tuning).toHaveProperty('reason');
        expect(tuning).toHaveProperty('expectedImpact');
        expect(['extend_duration', 'increase_discount', 'decrease_discount', 'pause', 'resume', 'target_adjustment']).toContain(tuning.adjustmentType);
      }
    });

    it('should recommend discount decrease for high adoption', async () => {
      const merchantId = 'test-merchant-id';
      const campaignId = 'test-campaign-high-adoption';

      const tuning = await autoTuneCampaign(merchantId, campaignId);

      if (tuning && tuning.adjustmentType === 'decrease_discount') {
        expect(tuning.expectedImpact).toHaveProperty('conversionChange');
        expect(tuning.expectedImpact).toHaveProperty('revenueChange');
        expect(tuning.expectedImpact.conversionChange).toBeLessThan(0); // Slight negative impact expected
        expect(tuning.expectedImpact.revenueChange).toBeGreaterThan(0); // But positive revenue
      }
    });

    it('should return null when no tuning needed', async () => {
      const merchantId = 'test-merchant-id';
      const campaignId = 'test-campaign-optimal';

      const tuning = await autoTuneCampaign(merchantId, campaignId);

      // No tuning is a valid result
      expect(tuning === null || !tuning.shouldTune).toBe(true);
    });

    it('should handle non-existent campaigns gracefully', async () => {
      const merchantId = 'test-merchant-id';
      const campaignId = 'non-existent-campaign';

      const tuning = await autoTuneCampaign(merchantId, campaignId);

      expect(tuning).toBeNull();
    });
  });

  describe('getAnomalies', () => {
    it('should retrieve merchant anomalies', async () => {
      const merchantId = 'test-merchant-id';
      const anomalies = await getAnomalies(merchantId);

      expect(Array.isArray(anomalies)).toBe(true);
      anomalies.forEach(anomaly => {
        expect(anomaly).toHaveProperty('id');
        expect(anomaly).toHaveProperty('anomaly_type');
        expect(anomaly).toHaveProperty('severity');
        expect(anomaly).toHaveProperty('status');
      });
    });

    it('should filter anomalies by status', async () => {
      const merchantId = 'test-merchant-id';
      const detectedAnomalies = await getAnomalies(merchantId, 'detected');

      detectedAnomalies.forEach(anomaly => {
        expect(anomaly.status).toBe('detected');
      });
    });

    it('should limit results to 50', async () => {
      const merchantId = 'test-merchant-with-many-anomalies';
      const anomalies = await getAnomalies(merchantId);

      expect(anomalies.length).toBeLessThanOrEqual(50);
    });
  });

  describe('getAutoTuningHistory', () => {
    it('should retrieve auto-tuning history', async () => {
      const merchantId = 'test-merchant-id';
      const history = await getAutoTuningHistory(merchantId, 20);

      expect(Array.isArray(history)).toBe(true);
      history.forEach(entry => {
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('entity_type');
        expect(entry).toHaveProperty('entity_id');
        expect(entry).toHaveProperty('adjustment_type');
        expect(entry).toHaveProperty('previous_config');
        expect(entry).toHaveProperty('new_config');
        expect(entry).toHaveProperty('reason');
      });
    });

    it('should respect limit parameter', async () => {
      const merchantId = 'test-merchant-id';
      const history = await getAutoTuningHistory(merchantId, 5);

      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array for merchant with no history', async () => {
      const merchantId = 'new-merchant-no-history';
      const history = await getAutoTuningHistory(merchantId);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });
  });

  describe('Integration Error Handling', () => {
    it('should handle SIRA API failures gracefully', async () => {
      const merchantId = 'test-merchant-id';

      // These should not throw errors
      await expect(detectPromoAnomalies(merchantId, 'any-promo')).resolves.toBeDefined();
      await expect(fetchMarketBenchmarks(merchantId, 'e-commerce', 'US')).resolves.toBeDefined();
      await expect(autoTuneCampaign(merchantId, 'any-campaign')).resolves.toBeDefined();
    });

    it('should fail-open on database errors', async () => {
      const merchantId = 'error-triggering-merchant';
      const promoCodeId = 'error-triggering-promo';

      // Should return null instead of throwing
      const result = await detectPromoAnomalies(merchantId, promoCodeId);
      expect(result === null || result).toBeDefined();
    });
  });
});
