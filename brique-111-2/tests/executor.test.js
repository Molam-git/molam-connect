/**
 * Brique 111-2: AI Config Advisor - Executor Unit Tests
 */

const {
  snapshotTarget,
  restoreFromSnapshot,
  validateParams,
  pushConfigToTarget,
  waitForTargetHealthy,
  executeRecommendation,
  getOpsPolicy
} = require('../src/services/recommendationExecutor');

describe('Recommendation Executor', () => {
  let mockPool;

  beforeEach(() => {
    // Mock database pool
    mockPool = {
      query: jest.fn(),
      connect: jest.fn()
    };
  });

  describe('validateParams', () => {
    test('should validate webhook timeout params', () => {
      const params = {
        timeout: 120000,
        retry: 5
      };

      const result = validateParams('webhook', params);
      expect(result).toBe(true);
    });

    test('should reject invalid webhook timeout', () => {
      const params = {
        timeout: -1000 // negative timeout
      };

      const result = validateParams('webhook', params);
      expect(result).toBe(false);
    });

    test('should reject timeout exceeding max', () => {
      const params = {
        timeout: 400000 // > 300000 max
      };

      const result = validateParams('webhook', params);
      expect(result).toBe(false);
    });

    test('should validate plugin config params', () => {
      const params = {
        config: {
          memory_limit: 1024,
          timeout: 30
        }
      };

      const result = validateParams('plugin', params);
      expect(result).toBe(true);
    });
  });

  describe('snapshotTarget', () => {
    test('should snapshot webhook configuration', async () => {
      const mockWebhook = {
        url: 'https://example.com/webhook',
        timeout_ms: 30000,
        retry_config: { max_attempts: 3 },
        headers: { 'Content-Type': 'application/json' }
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockWebhook] });

      // Mock setPool
      const executor = require('../src/services/recommendationExecutor');
      executor.setPool(mockPool);

      const snapshot = await snapshotTarget('webhook', 'webhook-123', 'user-1');

      expect(snapshot).toEqual(mockWebhook);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('webhook_endpoints'),
        ['webhook-123']
      );
    });

    test('should snapshot plugin configuration', async () => {
      const mockPlugin = {
        config: { memory_limit: 512 },
        version: '1.2.3',
        status: 'active'
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockPlugin] });

      const executor = require('../src/services/recommendationExecutor');
      executor.setPool(mockPool);

      const snapshot = await snapshotTarget('plugin', 'plugin-123', 'user-1');

      expect(snapshot).toEqual(mockPlugin);
    });
  });

  describe('pushConfigToTarget', () => {
    test('should update webhook configuration', async () => {
      const params = {
        timeout: 120000,
        retry_config: { max_attempts: 5 }
      };

      const mockUpdated = {
        id: 'webhook-123',
        timeout_ms: 120000,
        retry_config: { max_attempts: 5 }
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockUpdated] });

      const executor = require('../src/services/recommendationExecutor');
      executor.setPool(mockPool);

      const result = await pushConfigToTarget('webhook', 'webhook-123', params);

      expect(result.ok).toBe(true);
      expect(result.data).toEqual(mockUpdated);
    });

    test('should handle target not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const executor = require('../src/services/recommendationExecutor');
      executor.setPool(mockPool);

      const result = await pushConfigToTarget('webhook', 'nonexistent', {});

      expect(result.ok).toBe(false);
      expect(result.logs).toContain('not found');
    });
  });

  describe('executeRecommendation', () => {
    test('should execute suggest_config recommendation successfully', async () => {
      const recommendation = {
        id: 'rec-123',
        target_type: 'webhook',
        target_id: 'webhook-123',
        action: 'suggest_config',
        params: {
          timeout: 120000
        }
      };

      // Mock client transaction
      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'snapshot-123' }] }) // Insert snapshot
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.connect.mockResolvedValueOnce(mockClient);
      mockPool.query.mockResolvedValueOnce({ rows: [{ timeout_ms: 120000 }] }); // Push config

      // Mock health check
      jest.spyOn(global, 'setTimeout').mockImplementation((fn) => fn());

      const executor = require('../src/services/recommendationExecutor');
      executor.setPool(mockPool);

      // Mock waitForTargetHealthy
      jest.spyOn(executor, 'waitForTargetHealthy').mockResolvedValueOnce(true);

      const result = await executeRecommendation(recommendation, 'user-1');

      expect(result.ok).toBe(true);
      expect(result.details).toBe('applied');
      expect(result.snapshot_id).toBeDefined();
    });

    test('should rollback on health check failure', async () => {
      const recommendation = {
        id: 'rec-123',
        target_type: 'webhook',
        target_id: 'webhook-123',
        action: 'suggest_config',
        params: {
          timeout: 120000
        }
      };

      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'snapshot-123' }] }) // Insert snapshot
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.connect.mockResolvedValueOnce(mockClient);
      mockPool.query.mockResolvedValueOnce({ rows: [{ timeout_ms: 120000 }] }); // Push config

      const executor = require('../src/services/recommendationExecutor');
      executor.setPool(mockPool);

      // Mock health check failure
      jest.spyOn(executor, 'waitForTargetHealthy').mockResolvedValueOnce(false);
      jest.spyOn(executor, 'restoreFromSnapshot').mockResolvedValueOnce({ ok: true });

      const result = await executeRecommendation(recommendation, 'user-1');

      expect(result.ok).toBe(false);
      expect(result.details).toBe('health_check_failed');
      expect(result.auto_rolled_back).toBe(true);
    });

    test('should reject invalid params', async () => {
      const recommendation = {
        id: 'rec-123',
        target_type: 'webhook',
        target_id: 'webhook-123',
        action: 'suggest_config',
        params: {
          timeout: -1000 // Invalid
        }
      };

      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };

      mockClient.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      mockPool.connect.mockResolvedValueOnce(mockClient);

      const executor = require('../src/services/recommendationExecutor');
      executor.setPool(mockPool);

      const result = await executeRecommendation(recommendation, 'user-1');

      expect(result.ok).toBe(false);
      expect(result.details).toBe('invalid_params');
    });

    test('should reject unsupported action', async () => {
      const recommendation = {
        id: 'rec-123',
        target_type: 'webhook',
        target_id: 'webhook-123',
        action: 'unsupported_action',
        params: {}
      };

      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };

      mockClient.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      mockPool.connect.mockResolvedValueOnce(mockClient);

      const executor = require('../src/services/recommendationExecutor');
      executor.setPool(mockPool);

      const result = await executeRecommendation(recommendation, 'user-1');

      expect(result.ok).toBe(false);
      expect(result.details).toBe('unsupported_action');
    });
  });

  describe('getOpsPolicy', () => {
    test('should return configured policy', async () => {
      const mockPolicy = {
        require_multisig_for_major: true,
        auto_apply_enabled: true,
        auto_apply_max_priority: 'low',
        auto_apply_min_confidence: 0.95,
        min_approvals: 2
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [{ value: mockPolicy }]
      });

      const executor = require('../src/services/recommendationExecutor');
      executor.setPool(mockPool);

      const policy = await getOpsPolicy();

      expect(policy).toEqual(mockPolicy);
    });

    test('should return default policy if not configured', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const executor = require('../src/services/recommendationExecutor');
      executor.setPool(mockPool);

      const policy = await getOpsPolicy();

      expect(policy.require_multisig_for_major).toBe(true);
      expect(policy.auto_apply_enabled).toBe(true);
      expect(policy.min_approvals).toBe(2);
    });
  });
});
