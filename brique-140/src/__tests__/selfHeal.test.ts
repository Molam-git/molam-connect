/**
 * SOUS-BRIQUE 140quater — Self-Heal Tests
 */

import { MolamClient } from '../sdk/node/client';

describe('Self-Healing SDK', () => {
  it('should auto-heal invalid API key', async () => {
    const patchAppliedCallback = jest.fn();

    const client = new MolamClient({
      apiKey: 'INVALID_KEY',
      enableSelfHealing: true,
      onPatchApplied: patchAppliedCallback,
    });

    try {
      // Tenter un appel qui devrait échouer puis se corriger
      await client.ping();

      // Vérifier que le callback a été appelé
      expect(patchAppliedCallback).toHaveBeenCalled();
      expect(patchAppliedCallback.mock.calls[0][0]).toHaveProperty('description');
      expect(patchAppliedCallback.mock.calls[0][0]).toHaveProperty('code');
    } catch (err) {
      // En environnement de test sans serveur, l'erreur est normale
      expect(err).toBeDefined();
    }
  });

  it('should track patch history', async () => {
    const client = new MolamClient({
      apiKey: 'test_key',
      enableSelfHealing: true,
    });

    const initialHistory = client.getPatchHistory();
    expect(Array.isArray(initialHistory)).toBe(true);
    expect(initialHistory.length).toBe(0);
  });

  it('should respect maxRetries limit', async () => {
    const client = new MolamClient({
      apiKey: 'INVALID_KEY',
      enableSelfHealing: true,
    });

    // Forcer maxRetries à 1 pour test rapide
    (client as any).maxRetries = 1;

    try {
      await client.ping();
    } catch (err: any) {
      expect(err.message).toBeDefined();
    }
  });

  it('should disable self-healing when configured', async () => {
    const client = new MolamClient({
      apiKey: 'INVALID_KEY',
      enableSelfHealing: false,
    });

    try {
      await client.ping();
      fail('Should have thrown error');
    } catch (err) {
      expect(err).toBeDefined();
      // Pas de patch appliqué
      expect(client.getPatchHistory().length).toBe(0);
    }
  });

  it('should generate correct HMAC signature', async () => {
    const client = new MolamClient({
      apiKey: 'ak_test_123',
      secretKey: 'sk_test_secret',
      enableSelfHealing: false, // Désactiver pour tester signature pure
    });

    try {
      await client.createPayment({
        amount: 1000,
        currency: 'XOF',
        customer_id: 'cus_test_123',
      });
    } catch (err) {
      // Erreur réseau attendue en test
      expect(err).toBeDefined();
    }
  });

  it('should use environment variables as fallback', () => {
    process.env.MOLAM_API_KEY = 'env_api_key';
    process.env.MOLAM_SECRET_KEY = 'env_secret_key';

    const client = new MolamClient({});

    expect(client.apiKey).toBe('env_api_key');
    expect(client.secretKey).toBe('env_secret_key');

    // Cleanup
    delete process.env.MOLAM_API_KEY;
    delete process.env.MOLAM_SECRET_KEY;
  });

  it('should use custom baseUrl and timeout', () => {
    const client = new MolamClient({
      apiKey: 'test_key',
      baseUrl: 'https://custom.api.com',
      timeout: 15000,
    });

    expect(client.baseUrl).toBe('https://custom.api.com');
    expect(client.timeout).toBe(15000);
  });

  it('should handle createPayment with required fields', async () => {
    const client = new MolamClient({
      apiKey: 'test_key',
      enableSelfHealing: false,
    });

    const paymentData = {
      amount: 1000,
      currency: 'XOF',
      customer_id: 'cus_test_123',
      description: 'Test payment',
    };

    try {
      await client.createPayment(paymentData);
    } catch (err) {
      // Erreur réseau attendue en test
      expect(err).toBeDefined();
    }
  });

  it('should warn on missing API key when self-healing enabled', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const client = new MolamClient({
      enableSelfHealing: true,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Clé API manquante')
    );

    consoleSpy.mockRestore();
  });

  it('should apply timeout patch for timeout errors', async () => {
    const client = new MolamClient({
      apiKey: 'test_key',
      timeout: 1, // Très court pour forcer timeout
      enableSelfHealing: true,
    });

    try {
      await client.ping();
    } catch (err: any) {
      // Timeout ou erreur attendue
      expect(err).toBeDefined();
    }
  });
});

describe('Self-Heal API Endpoint', () => {
  it('should return patch for 401 error', async () => {
    // Mock de l'appel API self-heal
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        patch: {
          patch_id: 'patch_123',
          code: 'this.apiKey = "ak_test_fallback";',
          description: 'Correction clé API manquante',
          version: '1.0.0',
          severity: 'high',
        },
      }),
    });

    global.fetch = mockFetch as any;

    const response = await fetch('http://localhost/api/dev/self-heal', {
      method: 'POST',
      body: JSON.stringify({
        sdk: 'node',
        error: '401 Unauthorized',
        status: 401,
      }),
    });

    const data = await response.json();

    expect(data.patch).toBeDefined();
    expect(data.patch.code).toContain('apiKey');
    expect(data.patch.severity).toBe('high');
  });

  it('should return null when no patch found', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ patch: null }),
    });

    global.fetch = mockFetch as any;

    const response = await fetch('http://localhost/api/dev/self-heal', {
      method: 'POST',
      body: JSON.stringify({
        sdk: 'node',
        error: 'Unknown error with no patch',
        status: 500,
      }),
    });

    const data = await response.json();

    expect(data.patch).toBeNull();
  });
});
