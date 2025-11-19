/**
 * Brique 113: Router Tests
 * Test deterministic canary routing logic
 */

import { deterministicPercent } from '../src/inference/router';

describe('Canary Router', () => {
  describe('deterministicPercent()', () => {
    it('should return consistent percentage for same event_id', () => {
      const eventId = '123e4567-e89b-12d3-a456-426614174000';

      const pct1 = deterministicPercent(eventId);
      const pct2 = deterministicPercent(eventId);
      const pct3 = deterministicPercent(eventId);

      expect(pct1).toBe(pct2);
      expect(pct2).toBe(pct3);
    });

    it('should return different percentages for different event_ids', () => {
      const eventId1 = '123e4567-e89b-12d3-a456-426614174000';
      const eventId2 = '987f6543-e21c-34d5-b678-537625285111';

      const pct1 = deterministicPercent(eventId1);
      const pct2 = deterministicPercent(eventId2);

      // Very unlikely to be equal (1/100 chance)
      expect(pct1).not.toBe(pct2);
    });

    it('should return percentage in range 0-99', () => {
      for (let i = 0; i < 1000; i++) {
        const eventId = `event-${i}`;
        const pct = deterministicPercent(eventId);

        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThan(100);
      }
    });

    it('should distribute percentages uniformly', () => {
      const buckets: number[] = Array(10).fill(0); // 0-9, 10-19, ..., 90-99

      for (let i = 0; i < 10000; i++) {
        const eventId = `event-${i}`;
        const pct = deterministicPercent(eventId);
        const bucket = Math.floor(pct / 10);
        buckets[bucket]++;
      }

      // Each bucket should have roughly 1000 items (±20%)
      buckets.forEach((count, idx) => {
        expect(count).toBeGreaterThan(800);
        expect(count).toBeLessThan(1200);
      });
    });
  });

  describe('canary routing distribution', () => {
    it('should route ~10% to canary when canary_percent=10', () => {
      const canaryPercent = 10;
      const sampleSize = 10000;
      let canaryCount = 0;

      for (let i = 0; i < sampleSize; i++) {
        const eventId = `event-${i}`;
        const pct = deterministicPercent(eventId);

        if (pct < canaryPercent) {
          canaryCount++;
        }
      }

      const actualPercent = (canaryCount / sampleSize) * 100;

      // Should be within ±2% of target
      expect(actualPercent).toBeGreaterThan(8);
      expect(actualPercent).toBeLessThan(12);
    });

    it('should route ~50% to canary when canary_percent=50', () => {
      const canaryPercent = 50;
      const sampleSize = 10000;
      let canaryCount = 0;

      for (let i = 0; i < sampleSize; i++) {
        const eventId = `event-${i}`;
        const pct = deterministicPercent(eventId);

        if (pct < canaryPercent) {
          canaryCount++;
        }
      }

      const actualPercent = (canaryCount / sampleSize) * 100;

      // Should be within ±2% of target
      expect(actualPercent).toBeGreaterThan(48);
      expect(actualPercent).toBeLessThan(52);
    });

    it('should route 0% to canary when canary_percent=0', () => {
      const canaryPercent = 0;
      const sampleSize = 1000;
      let canaryCount = 0;

      for (let i = 0; i < sampleSize; i++) {
        const eventId = `event-${i}`;
        const pct = deterministicPercent(eventId);

        if (pct < canaryPercent) {
          canaryCount++;
        }
      }

      expect(canaryCount).toBe(0);
    });

    it('should route 100% to canary when canary_percent=100', () => {
      const canaryPercent = 100;
      const sampleSize = 1000;
      let canaryCount = 0;

      for (let i = 0; i < sampleSize; i++) {
        const eventId = `event-${i}`;
        const pct = deterministicPercent(eventId);

        if (pct < canaryPercent) {
          canaryCount++;
        }
      }

      expect(canaryCount).toBe(sampleSize);
    });
  });
});
