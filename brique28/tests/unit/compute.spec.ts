// tests/unit/compute.spec.ts

import { computeCost, computeBackoff } from '../../src/worker/helpers';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('computeCost', () => {
    it('applies markup and clamps between min and max', () => {
        const providerBase = 0.02;
        const zone = { pricing_markup_pct: 50, min_fee: 0.01, max_fee: 5.0 };
        // markup 50% => cost = 0.03 -> clamps to >= min_fee, <= max_fee
        expect(computeCost(providerBase, zone)).toBeCloseTo(0.03, 6);
    });

    it('clamps to min fee if provider cost small', () => {
        const providerBase = 0.0001;
        const zone = { pricing_markup_pct: 0, min_fee: 0.01, max_fee: 5.0 };
        expect(computeCost(providerBase, zone)).toBeCloseTo(0.01, 6);
    });

    it('clamps to max fee if provider cost large', () => {
        const providerBase = 10;
        const zone = { pricing_markup_pct: 0, min_fee: 0.01, max_fee: 5.0 };
        expect(computeCost(providerBase, zone)).toBeCloseTo(5.0, 6);
    });

    it('handles missing zone config with defaults', () => {
        const providerBase = 0.02;
        const zone = {};
        expect(computeCost(providerBase, zone)).toBeCloseTo(0.02, 6);
    });
});

describe('computeBackoff', () => {
    it('returns small backoff for 0 retries', () => {
        const b = computeBackoff(0, 300);
        expect(typeof b).toBe('number');
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(10); // 2^0 * 5 + jitter(0-4)
    });

    it('increases with retries but limited by maxBackoff', () => {
        const b1 = computeBackoff(1, 60);
        const b2 = computeBackoff(6, 60);
        expect(b2).toBeGreaterThanOrEqual(b1);
        expect(b2).toBeLessThanOrEqual(60 + 10); // allow jitter
    });

    it('respects max backoff limit', () => {
        const maxBackoff = 10;
        const backoff = computeBackoff(10, maxBackoff); // would be huge without limit
        expect(backoff).toBeLessThanOrEqual(maxBackoff + 5); // jitter
    });
});