import {
  createSubscription,
  cancelSubscription,
  reactivateSubscription,
} from '../../src/services/subscriptions';

jest.mock('../../src/db/pool', () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(),
  },
}));

import { pool } from '../../src/db/pool';

describe('Subscription Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSubscription', () => {
    it('should create a subscription with trial period', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ // get plan
            rows: [{
              id: 'plan-1',
              merchant_id: 'merchant-1',
              amount: 29.99,
              currency: 'USD',
              interval: 'month',
              interval_count: 1,
              trial_period_days: 14,
            }],
          })
          .mockResolvedValueOnce({ // insert subscription
            rows: [{
              id: 'sub-1',
              plan_id: 'plan-1',
              customer_id: 'customer-1',
              status: 'trialing',
              trial_period_days: 14,
            }],
          }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await createSubscription({
        planId: 'plan-1',
        customerId: 'customer-1',
        merchantId: 'merchant-1',
      });

      expect(result.status).toBe('trialing');
      expect(result.plan_id).toBe('plan-1');
    });

    it('should create a subscription without trial', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [{
              id: 'plan-2',
              merchant_id: 'merchant-1',
              amount: 99.99,
              currency: 'USD',
              interval: 'year',
              interval_count: 1,
              trial_period_days: 0,
            }],
          })
          .mockResolvedValueOnce({
            rows: [{
              id: 'sub-2',
              plan_id: 'plan-2',
              customer_id: 'customer-1',
              status: 'active',
            }],
          }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await createSubscription({
        planId: 'plan-2',
        customerId: 'customer-1',
        merchantId: 'merchant-1',
      });

      expect(result.status).toBe('active');
    });

    it('should throw error if plan not found', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [] }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      await expect(
        createSubscription({
          planId: 'invalid-plan',
          customerId: 'customer-1',
          merchantId: 'merchant-1',
        })
      ).rejects.toThrow('Subscription plan not found or inactive');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription at period end', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [{
            id: 'sub-1',
            cancel_at_period_end: true,
            canceled_at: expect.any(Date),
          }],
        }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await cancelSubscription('sub-1', true, 'Customer request');

      expect(result.cancel_at_period_end).toBe(true);
    });

    it('should cancel subscription immediately', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [{
            id: 'sub-1',
            status: 'canceled',
            cancel_at_period_end: false,
          }],
        }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await cancelSubscription('sub-1', false, 'Immediate cancellation');

      expect(result.status).toBe('canceled');
      expect(result.cancel_at_period_end).toBe(false);
    });
  });

  describe('reactivateSubscription', () => {
    it('should reactivate a canceled subscription', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'sub-1',
          status: 'active',
          cancel_at_period_end: false,
          canceled_at: null,
        }],
      });

      const result = await reactivateSubscription('sub-1');

      expect(result.status).toBe('active');
      expect(result.cancel_at_period_end).toBe(false);
      expect(result.canceled_at).toBeNull();
    });

    it('should throw error if subscription not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(
        reactivateSubscription('invalid-sub')
      ).rejects.toThrow('Subscription not found or not canceled');
    });
  });
});
