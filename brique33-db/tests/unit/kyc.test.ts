// tests/unit/kyc.test.ts
import { computeSHA256FromString, generateSecureToken } from '../../api/src/utils/crypto';

// Import explicite de Jest
import { describe, test, expect } from '@jest/globals';

describe('KYC Utilities', () => {
    test('SHA256 computation from string', () => {
        const hash = computeSHA256FromString('test content');
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('Secure token generation', () => {
        const token = generateSecureToken(16);
        expect(token).toHaveLength(32);
        expect(token).toMatch(/^[a-f0-9]{32}$/);
    });

    test('Different tokens are generated', () => {
        const token1 = generateSecureToken();
        const token2 = generateSecureToken();
        expect(token1).not.toBe(token2);
    });
});