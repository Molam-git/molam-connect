import request from 'supertest';
import { app } from '../backend/src/app';
import { db } from '../backend/config/database';

describe('Molam Rewards API', () => {
    beforeAll(async () => {
        // Setup test data
        await db.query(`
      INSERT INTO molam_rewards 
      (id, type, name, reward_value, percentage, currency, valid_from, is_active, category)
      VALUES 
      ('test-cashback-1', 'cashback', '{"en":"1% Cashback","fr":"1% Cashback"}', 0, 1.0, 'USD', NOW(), true, 'bill_payment'),
      ('test-points-1', 'points', '{"en":"Welcome Points","fr":"Points Bienvenue"}', 100, NULL, 'USD', NOW(), true, 'registration')
    `);
    });

    afterAll(async () => {
        // Cleanup test data
        await db.query(`
      DELETE FROM molam_user_rewards WHERE reward_id IN ('test-cashback-1', 'test-points-1');
      DELETE FROM molam_rewards WHERE id IN ('test-cashback-1', 'test-points-1');
    `);
        await db.end();
    });

    describe('GET /api/pay/rewards/active', () => {
        it('should return active rewards', async () => {
            const response = await request(app)
                .get('/api/pay/rewards/active')
                .query({ currency: 'USD' });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
        });
    });

    describe('POST /api/pay/rewards/apply', () => {
        it('should apply cashback reward to transaction', async () => {
            const transactionData = {
                transaction_id: 'test-trx-1',
                user_id: 'test-user-1',
                amount: 100.00,
                currency: 'USD',
                category: 'bill_payment'
            };

            const response = await request(app)
                .post('/api/pay/rewards/apply')
                .send(transactionData);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('reward_assigned');
            expect(response.body.amount).toBe('1.00 USD');
        });

        it('should return no_reward_applied for ineligible transaction', async () => {
            const transactionData = {
                transaction_id: 'test-trx-2',
                user_id: 'test-user-1',
                amount: 5.00, // Montant trop bas
                currency: 'USD',
                category: 'bill_payment'
            };

            const response = await request(app)
                .post('/api/pay/rewards/apply')
                .send(transactionData);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('no_reward_applied');
        });
    });

    describe('GET /api/pay/rewards/balance', () => {
        it('should return user rewards balance', async () => {
            const response = await request(app)
                .get('/api/pay/rewards/balance')
                .query({ user_id: 'test-user-1' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('cashback');
            expect(response.body).toHaveProperty('vouchers');
            expect(response.body).toHaveProperty('points');
            expect(Array.isArray(response.body.vouchers)).toBe(true);
        });
    });

    describe('POST /api/pay/rewards/convert', () => {
        it('should convert cashback to wallet credit', async () => {
            const convertData = {
                user_id: 'test-user-1',
                reward_type: 'cashback',
                amount: 5.00,
                target: 'wallet'
            };

            const response = await request(app)
                .post('/api/pay/rewards/convert')
                .send(convertData);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('converted');
            expect(response.body.wallet_credit).toBe('5.00 USD');
        });
    });
});