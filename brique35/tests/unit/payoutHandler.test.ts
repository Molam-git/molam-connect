import request from 'supertest';
import { app } from '../../src/server';
import { pool } from '../../src/db';

// Mock des services
jest.mock('../../src/services/ledger');
jest.mock('../../src/services/routing');
jest.mock('../../src/services/sira');

describe('Payout Handler', () => {
    beforeEach(async () => {
        // Nettoyer la base de données avant chaque test
        await pool.query('DELETE FROM payouts');
        await pool.query('DELETE FROM idempotency_keys');
    });

    afterAll(async () => {
        await pool.end();
    });

    it('should create a payout', async () => {
        const response = await request(app)
            .post('/api/treasury/payouts')
            .set('Idempotency-Key', 'test-key-123')
            .set('Authorization', 'Bearer fake-jwt')
            .send({
                origin_module: 'shop',
                origin_entity_id: '123',
                amount: 1000,
                currency: 'XOF',
                beneficiary: {
                    name: 'Test Merchant',
                    account_number: '123456',
                    type: 'business'
                }
            });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('reference_code');
        expect(response.body.status).toBe('pending');
    });

    it('should reject duplicate idempotency key', async () => {
        const payload = {
            origin_module: 'shop',
            origin_entity_id: '123',
            amount: 1000,
            currency: 'XOF',
            beneficiary: {
                name: 'Test Merchant',
                account_number: '123456',
                type: 'business'
            }
        };

        const firstResponse = await request(app)
            .post('/api/treasury/payouts')
            .set('Idempotency-Key', 'duplicate-key')
            .set('Authorization', 'Bearer fake-jwt')
            .send(payload);

        const secondResponse = await request(app)
            .post('/api/treasury/payouts')
            .set('Idempotency-Key', 'duplicate-key')
            .set('Authorization', 'Bearer fake-jwt')
            .send(payload);

        expect(secondResponse.status).toBe(200);
        // La réponse doit être la même que la première
        expect(secondResponse.body.reference_code).toBe(firstResponse.body.reference_code);
    });
});