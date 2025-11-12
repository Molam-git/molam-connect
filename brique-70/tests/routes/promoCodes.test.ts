import request from 'supertest';
import express from 'express';
import promoCodesRoutes from '../../src/routes/promoCodes';

// Mock dependencies
jest.mock('../../src/db/pool');
jest.mock('../../src/services/applyPromo');

import { validatePromoCode, applyPromoCode } from '../../src/services/applyPromo';

const app = express();
app.use(express.json());
app.use('/api/promo-codes', promoCodesRoutes);

describe('Promo Codes API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/promo-codes/validate', () => {
    it('should validate a valid promo code', async () => {
      (validatePromoCode as jest.Mock).mockResolvedValue({
        valid: true,
        promo_code: {
          code: 'SUMMER2025',
          discount_type: 'percentage',
          discount_value: 20,
        },
      });

      const response = await request(app)
        .post('/api/promo-codes/validate')
        .send({ code: 'SUMMER2025' });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
    });

    it('should return 400 if code is missing', async () => {
      const response = await request(app)
        .post('/api/promo-codes/validate')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Code is required');
    });
  });

  describe('POST /api/promo-codes/apply', () => {
    it('should apply promo code successfully', async () => {
      (applyPromoCode as jest.Mock).mockResolvedValue({
        success: true,
        original_amount: 100,
        discount_amount: 20,
        final_amount: 80,
        currency: 'USD',
      });

      const response = await request(app)
        .post('/api/promo-codes/apply')
        .send({
          code: 'SAVE20',
          amount: 100,
          currency: 'USD',
          customer_id: 'customer-1',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.discount_amount).toBe(20);
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/promo-codes/apply')
        .send({ code: 'SAVE20' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });
  });
});
