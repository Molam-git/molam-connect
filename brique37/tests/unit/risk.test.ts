import { computeRiskScore } from '../../src/utils/risk';

describe('computeRiskScore', () => {
    it('should compute risk score correctly', () => {
        const input = { volume: 100000, volatility: 5000, disputes: 10 };
        const score = computeRiskScore(input);

        // Vérifier que le score est dans l'intervalle [0, 100]
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);

        // Vérifier que le score est un nombre
        expect(typeof score).toBe('number');

        // Snapshot test ou valeurs attendues basées sur la formule
        // Ici, on calcule la valeur attendue manuellement
        const v = Math.min(1, Math.log10(1 + input.volume) / 6);
        const vol = Math.min(1, input.volatility / Math.max(1, Math.sqrt(input.volume)));
        const d = Math.min(1, input.disputes / 50);
        const raw = 0.5 * v + 0.3 * vol + 0.2 * d;
        const expected = Math.round(raw * 100 * 100) / 100;

        expect(score).toBe(expected);
    });

    it('should handle zero values', () => {
        const input = { volume: 0, volatility: 0, disputes: 0 };
        const score = computeRiskScore(input);

        expect(score).toBe(0);
    });
});