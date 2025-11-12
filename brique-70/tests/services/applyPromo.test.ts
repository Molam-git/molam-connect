import { validatePromoCode, applyPromoCode, refundPromoCodeUsage } from '../../src/services/applyPromo';

// Mock the database pool
jest.mock('../../src/db/pool', () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(),
  },
}));

import { pool } from '../../src/db/pool';

describe('Promo Code Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validatePromoCode', () => {
    it('should validate a valid promo code', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ valid: true }] }) // is_promo_code_valid result
          .mockResolvedValueOnce({ // promo code details
            rows: [{
              id: 'promo-1',
              code: 'SUMMER2025',
              discount_type: 'percentage',
              discount_value: 20,
              is_active: true,
              campaign: {
                id: 'campaign-1',
                status: 'active',
              },
            }],
          }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await validatePromoCode('SUMMER2025', 'customer-1');

      expect(result.valid).toBe(true);
      expect(result.promo_code).toBeDefined();
      expect(result.promo_code?.code).toBe('SUMMER2025');
    });

    it('should reject invalid promo code', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [{ valid: false }] }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await validatePromoCode('INVALID', 'customer-1');

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('applyPromoCode', () => {
    it('should apply percentage discount correctly', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ valid: true }] }) // validation
          .mockResolvedValueOnce({ // promo code details
            rows: [{
              id: 'promo-1',
              code: 'SAVE20',
              discount_type: 'percentage',
              discount_value: 20,
              campaign_id: 'campaign-1',
            }],
          })
          .mockResolvedValueOnce({ rows: [{ // campaign details
            min_purchase_amount: null,
            max_discount_amount: null,
            applicable_products: null,
            excluded_products: null,
          }] })
          .mockResolvedValueOnce({ rowCount: 1 }) // increment usage
          .mockResolvedValueOnce({ rowCount: 1 }) // increment campaign usage
          .mockResolvedValueOnce({ rows: [{ id: 'usage-1' }] }), // log usage
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await applyPromoCode(
        'SAVE20',
        100,
        'USD',
        'customer-1',
        'order-1'
      );

      expect(result.success).toBe(true);
      expect(result.discount_amount).toBe(20); // 20% of 100
      expect(result.final_amount).toBe(80);
    });

    it('should apply fixed discount correctly', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ valid: true }] })
          .mockResolvedValueOnce({
            rows: [{
              id: 'promo-2',
              code: 'FLAT10',
              discount_type: 'fixed',
              discount_value: 10,
              currency: 'USD',
              campaign_id: 'campaign-1',
            }],
          })
          .mockResolvedValueOnce({ rows: [{}] })
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ id: 'usage-2' }] }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await applyPromoCode(
        'FLAT10',
        100,
        'USD',
        'customer-1',
        'order-1'
      );

      expect(result.success).toBe(true);
      expect(result.discount_amount).toBe(10);
      expect(result.final_amount).toBe(90);
    });

    it('should handle free shipping discount', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ valid: true }] })
          .mockResolvedValueOnce({
            rows: [{
              id: 'promo-3',
              code: 'FREESHIP',
              discount_type: 'free_shipping',
              discount_value: 0,
              campaign_id: 'campaign-1',
            }],
          })
          .mockResolvedValueOnce({ rows: [{}] })
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ id: 'usage-3' }] }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await applyPromoCode(
        'FREESHIP',
        100,
        'USD',
        'customer-1',
        'order-1'
      );

      expect(result.success).toBe(true);
      expect(result.free_shipping).toBe(true);
      expect(result.discount_amount).toBe(0);
    });

    it('should enforce max discount limit', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ valid: true }] })
          .mockResolvedValueOnce({
            rows: [{
              id: 'promo-4',
              code: 'BIGDISCOUNT',
              discount_type: 'percentage',
              discount_value: 50,
              campaign_id: 'campaign-1',
            }],
          })
          .mockResolvedValueOnce({ rows: [{
            max_discount_amount: 20,
          }] })
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ id: 'usage-4' }] }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await applyPromoCode(
        'BIGDISCOUNT',
        100,
        'USD',
        'customer-1',
        'order-1'
      );

      expect(result.success).toBe(true);
      expect(result.discount_amount).toBe(20); // Capped at max_discount_amount
      expect(result.final_amount).toBe(80);
    });
  });

  describe('refundPromoCodeUsage', () => {
    it('should refund promo code usage successfully', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ // get usage log
            promo_code_id: 'promo-1',
            status: 'applied',
          }] })
          .mockResolvedValueOnce({ rowCount: 1 }) // decrement promo code usage
          .mockResolvedValueOnce({ rows: [{ campaign_id: 'campaign-1' }] }) // get campaign
          .mockResolvedValueOnce({ rowCount: 1 }) // decrement campaign usage
          .mockResolvedValueOnce({ rowCount: 1 }), // mark as refunded
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await refundPromoCodeUsage('usage-1');

      expect(result.success).toBe(true);
    });

    it('should not refund already refunded usage', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({ rows: [{
          promo_code_id: 'promo-1',
          status: 'refunded',
        }] }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await refundPromoCodeUsage('usage-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Usage already refunded');
    });
  });
});
