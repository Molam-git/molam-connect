// =====================================================================
// Rate Limit Service Tests
// =====================================================================
// Unit and integration tests for rate limiting
// Date: 2025-11-12
// =====================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import { RateLimitService } from '../src/services/rateLimitService';
import { rateLimitRedis } from '../src/utils/redisClient';

// =====================================================================
// Test Setup
// =====================================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_TEST || 'postgresql://postgres:postgres@localhost:5432/molam_connect_test',
});

let rateLimitService: RateLimitService;

beforeAll(async () => {
  // Initialize services
  await rateLimitRedis.initialize();
  rateLimitService = new RateLimitService(pool);

  // Run schema migrations
  // (Assume schema is already created)
});

afterAll(async () => {
  await rateLimitRedis.close();
  await pool.end();
});

beforeEach(async () => {
  // Clear Redis before each test
  const client = rateLimitRedis.getClient();
  await client.flushdb();

  // Clear cache
  rateLimitService.clearCache();
});

// =====================================================================
// Test Suites
// =====================================================================

describe('RateLimitService - Plans', () => {
  it('should get all plans', async () => {
    const plans = await rateLimitService.getPlans();

    expect(plans).toBeInstanceOf(Array);
    expect(plans.length).toBeGreaterThan(0);

    // Check that default plans exist
    const planNames = plans.map((p) => p.name);
    expect(planNames).toContain('free');
    expect(planNames).toContain('starter');
    expect(planNames).toContain('business');
    expect(planNames).toContain('enterprise');
  });

  it('should get plan by name', async () => {
    const plan = await rateLimitService.getPlan('free');

    expect(plan).not.toBeNull();
    expect(plan?.name).toBe('free');
    expect(plan?.config.rate_per_second).toBe(5);
    expect(plan?.config.burst_capacity).toBe(10);
    expect(plan?.config.daily_quota).toBe(10000);
  });

  it('should create new plan', async () => {
    const plan = await rateLimitService.createPlan({
      name: 'test_plan',
      display_name: 'Test Plan',
      description: 'Test plan for testing',
      config: {
        rate_per_second: 100,
        burst_capacity: 200,
        daily_quota: 1000000,
        monthly_quota: 30000000,
      },
      price_monthly: 99.99,
      created_by: 'test-user-id',
    });

    expect(plan.name).toBe('test_plan');
    expect(plan.config.rate_per_second).toBe(100);

    // Cleanup
    await pool.query('DELETE FROM rl_plans WHERE id = $1', [plan.id]);
  });

  it('should update plan', async () => {
    const plan = await rateLimitService.getPlan('free');
    expect(plan).not.toBeNull();

    const updated = await rateLimitService.updatePlan(
      plan!.id,
      {
        description: 'Updated description',
        config: {
          ...plan!.config,
          rate_per_second: 10, // Increase from 5 to 10
        },
      },
      'test-user-id'
    );

    expect(updated.description).toBe('Updated description');
    expect(updated.config.rate_per_second).toBe(10);

    // Revert
    await rateLimitService.updatePlan(
      plan!.id,
      {
        config: plan!.config,
      },
      'test-user-id'
    );
  });
});

describe('RateLimitService - Rate Limit Checking', () => {
  const testApiKeyId = 'TK_test_UNITTEST123';
  const testTenantId = '00000000-0000-0000-0000-000000000001';

  it('should allow request within rate limit', async () => {
    const result = await rateLimitService.checkRateLimit({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });

    expect(result.allowed).toBe(true);
    expect(result.tokensRemaining).toBeDefined();
    expect(result.dailyUsage).toBe(1);
  });

  it('should enforce rate limit after burst', async () => {
    const config = await rateLimitService.getEffectiveConfig({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });

    // Consume all burst capacity
    const burstRequests = [];
    for (let i = 0; i < config.burst_capacity + 1; i++) {
      burstRequests.push(
        rateLimitService.checkRateLimit({
          apiKeyId: testApiKeyId,
          tenantId: testTenantId,
        })
      );
    }

    const results = await Promise.all(burstRequests);

    // First N requests should be allowed (burst)
    expect(results.slice(0, config.burst_capacity).every((r) => r.allowed)).toBe(true);

    // Subsequent requests should be denied
    expect(results[config.burst_capacity].allowed).toBe(false);
    expect(results[config.burst_capacity].reason).toBe('rate_limit');
    expect(results[config.burst_capacity].retry_after).toBeGreaterThan(0);
  });

  it('should enforce daily quota', async () => {
    // Mock high daily usage by directly setting Redis counter
    const date = new Date().toISOString().slice(0, 10);
    const keyQuotaDaily = `rl:quota:${testApiKeyId}:${date}`;

    const client = rateLimitRedis.getClient();
    await client.set(keyQuotaDaily, '9999'); // Near quota limit (10000)

    const result = await rateLimitService.checkRateLimit({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });

    expect(result.allowed).toBe(true); // Should still allow 1 more
    expect(result.dailyUsage).toBe(10000);

    // Next request should be denied
    const result2 = await rateLimitService.checkRateLimit({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });

    expect(result2.allowed).toBe(false);
    expect(result2.reason).toBe('daily_quota');
  });

  it('should respect idempotency key', async () => {
    const idempotencyKey = 'test-idem-key-123';

    // First request with idempotency key
    const result1 = await rateLimitService.checkRateLimit({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
      idempotencyKey,
    });

    expect(result1.allowed).toBe(true);
    const usage1 = result1.dailyUsage!;

    // Second request with same idempotency key should not increment quota
    const result2 = await rateLimitService.checkRateLimit({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
      idempotencyKey,
    });

    expect(result2.allowed).toBe(true);
    expect(result2.dailyUsage).toBe(usage1); // Should be same as first request
  });
});

describe('RateLimitService - Overrides', () => {
  const testApiKeyId = 'TK_test_OVERRIDE123';
  const testTenantId = '00000000-0000-0000-0000-000000000002';

  it('should create and apply API key override', async () => {
    // Create override
    const override = await rateLimitService.createOverride({
      target_type: 'api_key',
      target_id: testApiKeyId,
      config: {
        rate_per_second: 1000, // Much higher than default
        burst_capacity: 2000,
      },
      reason: 'Test override',
      created_by: 'test-user-id',
    });

    expect(override.target_id).toBe(testApiKeyId);

    // Get effective config (should include override)
    const config = await rateLimitService.getEffectiveConfig({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });

    expect(config.rate_per_second).toBe(1000);
    expect(config.burst_capacity).toBe(2000);

    // Cleanup
    await rateLimitService.removeOverride(override.id, 'test-user-id');
  });

  it('should apply overrides in correct precedence order', async () => {
    // Create tenant override
    const tenantOverride = await rateLimitService.createOverride({
      target_type: 'tenant',
      target_id: testTenantId,
      config: { rate_per_second: 50 },
      reason: 'Tenant override',
      created_by: 'test-user-id',
    });

    // Create API key override (higher precedence)
    const keyOverride = await rateLimitService.createOverride({
      target_type: 'api_key',
      target_id: testApiKeyId,
      config: { rate_per_second: 100 },
      reason: 'Key override',
      created_by: 'test-user-id',
    });

    // Get effective config
    const config = await rateLimitService.getEffectiveConfig({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });

    // API key override should win
    expect(config.rate_per_second).toBe(100);

    // Cleanup
    await rateLimitService.removeOverride(tenantOverride.id, 'test-user-id');
    await rateLimitService.removeOverride(keyOverride.id, 'test-user-id');
  });
});

describe('RateLimitService - Blocks', () => {
  const testApiKeyId = 'TK_test_BLOCK123';
  const testTenantId = '00000000-0000-0000-0000-000000000003';

  it('should create and apply block', async () => {
    // Create block
    const block = await rateLimitService.createBlock({
      target_type: 'api_key',
      target_id: testApiKeyId,
      reason: 'ops_manual',
      reason_detail: 'Test block',
      created_by: 'test-user-id',
    });

    expect(block.target_id).toBe(testApiKeyId);

    // Check rate limit (should be blocked)
    const result = await rateLimitService.checkRateLimit({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('blocked');
    expect(result.blockInfo).toBeDefined();

    // Cleanup
    await rateLimitService.removeBlock(block.id, 'test-user-id', 'Test cleanup');
  });

  it('should respect block expiry', async () => {
    // Create block that expires in 1 second
    const expiresAt = new Date(Date.now() + 1000);

    const block = await rateLimitService.createBlock({
      target_type: 'api_key',
      target_id: testApiKeyId,
      reason: 'ops_manual',
      reason_detail: 'Temporary block',
      expires_at: expiresAt,
      auto_remove: true,
      created_by: 'test-user-id',
    });

    // Should be blocked immediately
    const result1 = await rateLimitService.checkRateLimit({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });

    expect(result1.allowed).toBe(false);

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Clear cache (to force fresh DB lookup)
    rateLimitService.clearCache();

    // Should not be blocked anymore
    const result2 = await rateLimitService.checkRateLimit({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });

    expect(result2.allowed).toBe(true);

    // Cleanup
    await pool.query('DELETE FROM rl_blocks WHERE id = $1', [block.id]);
  });
});

describe('RateLimitService - Redis Integration', () => {
  const testApiKeyId = 'TK_test_REDIS123';
  const testTenantId = '00000000-0000-0000-0000-000000000004';

  it('should handle Redis failure gracefully (fail-open)', async () => {
    // Simulate Redis failure by closing connection
    await rateLimitRedis.close();

    // Request should still be allowed (fail-open)
    const result = await rateLimitService.checkRateLimit({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });

    // Should fail-open
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('service_unavailable');

    // Reconnect Redis
    await rateLimitRedis.initialize();
  });

  it('should get current rate limit status', async () => {
    // Make a request to initialize counters
    await rateLimitService.checkRateLimit({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });

    // Get status
    const status = await rateLimitRedis.getRateLimitStatus(testApiKeyId);

    expect(status.tokensAvailable).toBeGreaterThan(0);
    expect(status.dailyUsage).toBe(1);
    expect(status.monthlyUsage).toBe(1);
  });

  it('should reset rate limit', async () => {
    // Make requests to create usage
    await rateLimitService.checkRateLimit({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });
    await rateLimitService.checkRateLimit({
      apiKeyId: testApiKeyId,
      tenantId: testTenantId,
    });

    // Verify usage
    const status1 = await rateLimitRedis.getRateLimitStatus(testApiKeyId);
    expect(status1.dailyUsage).toBe(2);

    // Reset
    await rateLimitRedis.resetRateLimit(testApiKeyId);

    // Verify reset
    const status2 = await rateLimitRedis.getRateLimitStatus(testApiKeyId);
    expect(status2.dailyUsage).toBe(0);
  });
});

// =====================================================================
// Load Testing Script (Manual/Optional)
// =====================================================================

describe.skip('Load Testing (Manual)', () => {
  it('should handle concurrent requests', async () => {
    const testApiKeyId = 'TK_test_LOAD123';
    const testTenantId = '00000000-0000-0000-0000-000000000005';

    const concurrentRequests = 1000;
    const requests = [];

    console.time('load-test');

    for (let i = 0; i < concurrentRequests; i++) {
      requests.push(
        rateLimitService.checkRateLimit({
          apiKeyId: testApiKeyId,
          tenantId: testTenantId,
        })
      );
    }

    const results = await Promise.all(requests);

    console.timeEnd('load-test');

    const allowed = results.filter((r) => r.allowed).length;
    const denied = results.filter((r) => !r.allowed).length;

    console.log(`Allowed: ${allowed}, Denied: ${denied}`);

    expect(allowed + denied).toBe(concurrentRequests);
  });
});
