/**
 * SOUS-BRIQUE 140ter — Auto-Debug Worker Tests
 */

import { analyzeError, markErrorResolved, getUnresolvedErrors } from '../sira/autoDebugWorker';

describe('Auto-Debug Worker', () => {
  const testDevId = 'dev-test-debug-123';

  it('should return API key fix for 401 error', async () => {
    const fix = await analyzeError(testDevId, 'node', '401 Unauthorized', {});

    expect(fix).toBeTruthy();
    expect(fix?.action).toMatch(/Vérifier clé API/);
    expect(fix?.snippet).toContain('MOLAM_API_KEY');
    expect(fix?.category).toBe('authentication');
  });

  it('should return timeout fix for timeout error', async () => {
    const fix = await analyzeError(
      testDevId,
      'node',
      'Request timeout after 5000ms',
      {}
    );

    expect(fix).toBeTruthy();
    expect(fix?.action).toMatch(/Augmenter timeout/);
    expect(fix?.snippet).toContain('timeout');
    expect(fix?.category).toBe('network');
  });

  it('should return currency fix for invalid_currency error', async () => {
    const fix = await analyzeError(
      testDevId,
      'python',
      'Error: invalid_currency CHF not supported',
      {}
    );

    expect(fix).toBeTruthy();
    expect(fix?.action).toMatch(/Corriger devise/);
    expect(fix?.snippet).toContain('XOF');
    expect(fix?.category).toBe('validation');
  });

  it('should return HMAC fix for signature error', async () => {
    const fix = await analyzeError(
      testDevId,
      'php',
      'HMAC signature verification failed',
      {}
    );

    expect(fix).toBeTruthy();
    expect(fix?.action).toMatch(/signature HMAC/);
    expect(fix?.snippet).toContain('hmac');
    expect(fix?.category).toBe('authentication');
  });

  it('should return rate limit fix for 429 error', async () => {
    const fix = await analyzeError(testDevId, 'node', '429 Too Many Requests', {});

    expect(fix).toBeTruthy();
    expect(fix?.action).toMatch(/rate limiting/);
    expect(fix?.snippet).toContain('retry');
    expect(fix?.category).toBe('rate_limit');
  });

  it('should return validation fix for 400 error', async () => {
    const fix = await analyzeError(
      testDevId,
      'node',
      '400 Bad Request: invalid_request',
      {}
    );

    expect(fix).toBeTruthy();
    expect(fix?.action).toMatch(/format de la requête/);
    expect(fix?.category).toBe('validation');
  });

  it('should generate language-specific snippets', async () => {
    const nodeFix = await analyzeError(testDevId, 'node', '401 Unauthorized', {});
    const phpFix = await analyzeError(testDevId, 'php', '401 Unauthorized', {});
    const pythonFix = await analyzeError(testDevId, 'python', '401 Unauthorized', {});

    expect(nodeFix?.snippet).toContain('process.env.MOLAM_API_KEY');
    expect(phpFix?.snippet).toContain('getenv("MOLAM_API_KEY")');
    expect(pythonFix?.snippet).toContain('os.getenv("MOLAM_API_KEY")');
  });

  it('should retrieve unresolved errors', async () => {
    // Create some test errors
    await analyzeError(testDevId, 'node', 'Test error 1', {});
    await analyzeError(testDevId, 'node', 'Test error 2', {});

    const errors = await getUnresolvedErrors(testDevId, 10);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toHaveProperty('error_message');
    expect(errors[0]).toHaveProperty('proposed_fix');
    expect(errors[0].resolved).toBe(false);
  });

  it('should mark error as resolved', async () => {
    // Create test error
    const fix = await analyzeError(testDevId, 'node', 'Test resolve error', {});

    // Get the error ID (would need to query DB in real test)
    const errors = await getUnresolvedErrors(testDevId, 1);
    if (errors.length > 0) {
      const errorId = errors[0].id;

      // Mark as resolved
      await markErrorResolved(errorId);

      // Verify it's no longer in unresolved list
      const unresolvedAfter = await getUnresolvedErrors(testDevId);
      const stillUnresolved = unresolvedAfter.find((e) => e.id === errorId);
      expect(stillUnresolved).toBeUndefined();
    }
  });

  it('should handle multiple error patterns in one message', async () => {
    const fix = await analyzeError(
      testDevId,
      'node',
      '401 Unauthorized with HMAC signature mismatch',
      {}
    );

    // Should match first pattern (401 takes priority)
    expect(fix).toBeTruthy();
    expect(fix?.category).toBe('authentication');
  });

  it('should store context in database', async () => {
    const context = {
      endpoint: '/v1/payments',
      method: 'POST',
      status: 401,
      timestamp: new Date().toISOString(),
    };

    await analyzeError(testDevId, 'node', '401 Unauthorized', context);

    const errors = await getUnresolvedErrors(testDevId, 1);
    expect(errors[0].context).toEqual(context);
  });
});
