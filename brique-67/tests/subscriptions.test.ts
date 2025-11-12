import { Pool } from 'pg';
import {
  createSubscriptionForMerchant,
  changePlan,
  cancelSubscription,
  recordUsage,
  getSubscriptionById,
  listSubscriptionsByMerchant,
  getSubscriptionStats,
} from '../src/subscriptions/service';

// Mock the database pool
jest.mock('../src/utils/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require('../src/utils/db');

describe('Subscriptions & Recurring Billing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSubscriptionForMerchant', () => {
    it('should create a new subscription', async () => {
      const mockPlan = {
        id: 'plan-123',
        slug: 'starter-monthly',
        name: 'Starter Monthly',
        billing_interval: 'monthly',
        interval_count: 1,
        currency: 'USD',
        unit_amount: 29.00,
        is_active: true,
        is_metered: false,
        trial_period_days: 14,
      };

      const mockSubscription = {
        id: 'sub-123',
        merchant_id: 'merchant-456',
        plan_id: 'plan-123',
        status: 'trialing',
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      pool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Idempotency check
        .mockResolvedValueOnce({ rows: [mockPlan] }) // Get plan
        .mockResolvedValueOnce({ rows: [mockSubscription], rowCount: 1 }) // Insert subscription
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert dunning
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert log

      const result = await createSubscriptionForMerchant({
        merchantId: 'merchant-456',
        payload: {
          plan_id: 'plan-123',
          trial_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
        idempotency: 'test-key-1',
      });

      expect(result.id).toBe('sub-123');
      expect(result.status).toBe('trialing');
      expect(pool.query).toHaveBeenCalledTimes(5);
    });

    it('should return existing subscription for duplicate idempotency key', async () => {
      const existingSubscription = {
        id: 'sub-existing',
        merchant_id: 'merchant-456',
        status: 'active',
      };

      pool.query.mockResolvedValueOnce({ rows: [existingSubscription], rowCount: 1 });

      const result = await createSubscriptionForMerchant({
        merchantId: 'merchant-456',
        payload: { plan_id: 'plan-123' },
        idempotency: 'duplicate-key',
      });

      expect(result.id).toBe('sub-existing');
      expect(pool.query).toHaveBeenCalledTimes(1); // Only idempotency check
    });

    it('should throw error for inactive plan', async () => {
      const inactivePlan = {
        id: 'plan-inactive',
        is_active: false,
      };

      pool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Idempotency check
        .mockResolvedValueOnce({ rows: [inactivePlan] }); // Get inactive plan

      await expect(
        createSubscriptionForMerchant({
          merchantId: 'merchant-456',
          payload: { plan_id: 'plan-inactive' },
          idempotency: 'test-key-2',
        })
      ).rejects.toThrow('plan_inactive');
    });
  });

  describe('changePlan', () => {
    it('should schedule plan change for next period', async () => {
      const mockSubscription = {
        id: 'sub-123',
        merchant_id: 'merchant-456',
        plan_snapshot: { unit_amount: '29.00' },
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      };

      const mockNewPlan = {
        id: 'plan-pro',
        slug: 'pro-monthly',
        name: 'Pro Monthly',
        unit_amount: 99.00,
        billing_interval: 'monthly',
        interval_count: 1,
        currency: 'USD',
        is_metered: false,
      };

      pool.query
        .mockResolvedValueOnce({ rows: [mockSubscription] }) // Get subscription
        .mockResolvedValueOnce({ rows: [mockNewPlan] }) // Get new plan
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert schedule
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert log

      const result = await changePlan('sub-123', 'user-1', 'plan-pro', {
        effectiveImmediately: false,
      });

      expect(result.scheduled).toBe(true);
      expect(result.effective_at).toBeDefined();
    });

    it('should apply proration for immediate plan change', async () => {
      const now = new Date();
      const periodStart = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const periodEnd = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000); // 20 days from now

      const mockSubscription = {
        id: 'sub-123',
        merchant_id: 'merchant-456',
        plan_snapshot: { unit_amount: '29.00' },
        current_period_start: periodStart,
        current_period_end: periodEnd,
      };

      const mockNewPlan = {
        id: 'plan-pro',
        unit_amount: 99.00,
        billing_interval: 'monthly',
        currency: 'USD',
        is_metered: false,
      };

      pool.query
        .mockResolvedValueOnce({ rows: [mockSubscription] }) // Get subscription
        .mockResolvedValueOnce({ rows: [mockNewPlan] }) // Get new plan
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Update subscription
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert log

      const result = await changePlan('sub-123', 'user-1', 'plan-pro', {
        effectiveImmediately: true,
      });

      expect(result.immediate).toBe(true);
      expect(result.chargeAmount).toBeGreaterThan(0);
      expect(result.credit).toBeGreaterThan(0);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription at period end', async () => {
      const mockSubscription = {
        id: 'sub-123',
        merchant_id: 'merchant-456',
        status: 'active',
        cancel_at_period_end: true,
      };

      pool.query
        .mockResolvedValueOnce({ rows: [mockSubscription] }) // Update subscription
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert log

      const result = await cancelSubscription('sub-123', 'user-1', {
        cancel_at_period_end: true,
        reason: 'User requested',
      });

      expect(result.cancel_at_period_end).toBe(true);
      expect(result.status).toBe('active'); // Still active until period end
    });

    it('should cancel subscription immediately', async () => {
      const mockSubscription = {
        id: 'sub-123',
        merchant_id: 'merchant-456',
        status: 'canceled',
        cancel_at_period_end: false,
        canceled_at: new Date(),
      };

      pool.query
        .mockResolvedValueOnce({ rows: [mockSubscription] }) // Update subscription
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert log

      const result = await cancelSubscription('sub-123', 'user-1', {
        cancel_at_period_end: false,
        reason: 'Immediate cancellation',
      });

      expect(result.status).toBe('canceled');
      expect(result.canceled_at).toBeDefined();
    });
  });

  describe('recordUsage', () => {
    it('should record usage for metered subscription', async () => {
      const mockSubscription = {
        id: 'sub-metered',
        plan_snapshot: { is_metered: true },
      };

      const mockUsageRecord = {
        id: 'usage-1',
        subscription_id: 'sub-metered',
        unit_count: 1000,
        period_start: '2025-01-01',
        period_end: '2025-01-31',
      };

      pool.query
        .mockResolvedValueOnce({ rows: [mockSubscription] }) // Get subscription
        .mockResolvedValueOnce({ rows: [mockUsageRecord] }); // Insert usage

      const result = await recordUsage('sub-metered', {
        period_start: '2025-01-01',
        period_end: '2025-01-31',
        unit_count: 1000,
        description: 'API calls',
      });

      expect(result.id).toBe('usage-1');
      expect(result.unit_count).toBe(1000);
    });

    it('should throw error for non-metered subscription', async () => {
      const mockSubscription = {
        id: 'sub-fixed',
        plan_snapshot: { is_metered: false },
      };

      pool.query.mockResolvedValueOnce({ rows: [mockSubscription] });

      await expect(
        recordUsage('sub-fixed', {
          period_start: '2025-01-01',
          period_end: '2025-01-31',
          unit_count: 100,
        })
      ).rejects.toThrow('subscription_not_metered');
    });
  });

  describe('getSubscriptionById', () => {
    it('should return subscription by ID', async () => {
      const mockSubscription = {
        id: 'sub-123',
        merchant_id: 'merchant-456',
        status: 'active',
      };

      pool.query.mockResolvedValueOnce({ rows: [mockSubscription] });

      const result = await getSubscriptionById('sub-123');

      expect(result?.id).toBe('sub-123');
      expect(result?.status).toBe('active');
    });

    it('should return null if subscription not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await getSubscriptionById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('listSubscriptionsByMerchant', () => {
    it('should list all subscriptions for merchant', async () => {
      const mockSubscriptions = [
        { id: 'sub-1', status: 'active' },
        { id: 'sub-2', status: 'trialing' },
      ];

      pool.query.mockResolvedValueOnce({ rows: mockSubscriptions });

      const result = await listSubscriptionsByMerchant('merchant-456');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('sub-1');
    });

    it('should filter subscriptions by status', async () => {
      const mockSubscriptions = [{ id: 'sub-active', status: 'active' }];

      pool.query.mockResolvedValueOnce({ rows: mockSubscriptions });

      const result = await listSubscriptionsByMerchant('merchant-456', {
        status: 'active',
      });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('active');
    });
  });

  describe('getSubscriptionStats', () => {
    it('should return subscription statistics', async () => {
      const mockStats = {
        total_subscriptions: 25,
        active_count: 20,
        trial_count: 3,
        past_due_count: 1,
        canceled_count: 1,
        mrr_total: 2475.00,
      };

      pool.query.mockResolvedValueOnce({ rows: [mockStats] });

      const result = await getSubscriptionStats('merchant-456');

      expect(result.total_subscriptions).toBe(25);
      expect(result.active_count).toBe(20);
      expect(result.mrr_total).toBe(2475.00);
    });

    it('should return zero stats for merchant with no subscriptions', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await getSubscriptionStats('merchant-new');

      expect(result.total_subscriptions).toBe(0);
      expect(result.mrr_total).toBe(0);
    });
  });
});