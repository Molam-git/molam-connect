import axios from 'axios';
import {
  checkFraud,
  checkPromoCodeFraud,
  checkSubscriptionFraud,
} from '../../src/services/siraIntegration';

jest.mock('axios');
jest.mock('../../src/config', () => ({
  config: {
    sira: {
      enabled: true,
      apiUrl: 'http://localhost:8084',
    },
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SIRA Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkFraud', () => {
    it('should return low risk for normal transaction', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          risk_score: 15,
          risk_level: 'low',
          flags: [],
          recommendations: [],
          should_block: false,
        },
      });

      const result = await checkFraud({
        event_type: 'promo_code_usage',
        customer_id: 'customer-1',
        merchant_id: 'merchant-1',
        amount: 100,
        currency: 'USD',
      });

      expect(result.risk_level).toBe('low');
      expect(result.should_block).toBe(false);
    });

    it('should return high risk and block suspicious transaction', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          risk_score: 95,
          risk_level: 'high',
          flags: ['suspicious_ip', 'multiple_accounts'],
          recommendations: ['Block transaction', 'Review customer'],
          should_block: true,
          reason: 'Multiple fraud indicators detected',
        },
      });

      const result = await checkFraud({
        event_type: 'promo_code_usage',
        customer_id: 'customer-1',
        merchant_id: 'merchant-1',
        amount: 1000,
        currency: 'USD',
      });

      expect(result.risk_level).toBe('high');
      expect(result.should_block).toBe(true);
      expect(result.flags).toContain('suspicious_ip');
    });

    it('should fail open if SIRA is unavailable', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const result = await checkFraud({
        event_type: 'promo_code_usage',
        customer_id: 'customer-1',
        merchant_id: 'merchant-1',
        amount: 100,
        currency: 'USD',
      });

      expect(result.risk_level).toBe('low');
      expect(result.should_block).toBe(false);
      expect(result.flags).toContain('sira_unavailable');
    });
  });

  describe('checkPromoCodeFraud', () => {
    it('should check promo code usage for fraud', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          risk_score: 25,
          risk_level: 'low',
          flags: [],
          recommendations: [],
          should_block: false,
        },
      });

      const result = await checkPromoCodeFraud({
        code: 'SAVE20',
        customer_id: 'customer-1',
        merchant_id: 'merchant-1',
        amount: 100,
        currency: 'USD',
        ip_address: '192.168.1.1',
      });

      expect(result.risk_level).toBe('low');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/fraud/check'),
        expect.objectContaining({
          event_type: 'promo_code_usage',
          metadata: expect.objectContaining({
            promo_code: 'SAVE20',
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('checkSubscriptionFraud', () => {
    it('should check subscription signup for fraud', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          risk_score: 30,
          risk_level: 'medium',
          flags: ['new_customer'],
          recommendations: ['Monitor for first few months'],
          should_block: false,
        },
      });

      const result = await checkSubscriptionFraud({
        customer_id: 'customer-1',
        merchant_id: 'merchant-1',
        plan_amount: 99.99,
        currency: 'USD',
      });

      expect(result.risk_level).toBe('medium');
      expect(result.flags).toContain('new_customer');
    });
  });
});
