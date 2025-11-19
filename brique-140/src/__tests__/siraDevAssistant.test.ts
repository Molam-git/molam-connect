/**
 * SOUS-BRIQUE 140bis — Sira Dev Assistant Tests
 */

import { siraAssist } from '../ai/siraDevAssistant';

describe('Sira Dev Assistant', () => {
  it('should return a Node.js snippet', async () => {
    const result = await siraAssist({
      developerId: 'dev-test-123',
      query: 'Créer un paiement en XOF',
      lang: 'node',
    });

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    // Should contain common Node patterns
    expect(
      result.includes('fetch') ||
        result.includes('axios') ||
        result.includes('await')
    ).toBe(true);
  });

  it('should fallback to static snippet when API fails', async () => {
    // Mock API failure
    const originalEnv = process.env.SIRA_API_KEY;
    delete process.env.SIRA_API_KEY;

    const result = await siraAssist({
      developerId: 'dev-test-123',
      query: 'Créer un paiement',
      lang: 'node',
    });

    expect(result).toContain('Fallback snippet');

    // Restore
    process.env.SIRA_API_KEY = originalEnv;
  });

  it('should generate PHP snippet', async () => {
    const result = await siraAssist({
      developerId: 'dev-test-123',
      query: 'Créer un client',
      lang: 'php',
    });

    expect(result).toBeTruthy();
    expect(result.includes('<?php') || result.includes('function')).toBe(true);
  });

  it('should generate Python snippet', async () => {
    const result = await siraAssist({
      developerId: 'dev-test-123',
      query: 'Lister les paiements',
      lang: 'python',
    });

    expect(result).toBeTruthy();
    expect(result.includes('import') || result.includes('def')).toBe(true);
  });
});
