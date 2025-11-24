// tests/topup.test.ts
import request from 'supertest';
import { app } from '../server';

describe('Top-up API', () => {
    test('reject invalid phone format', async () => {
        const res = await request(app)
            .post('/api/pay/topup/create')
            .set('Authorization', 'Bearer test-token')
            .send({
                operator_id: 'uuid',
                product_id: 'uuid',
                phone_number: '123ABC',
                currency: 'XOF'
            });

        expect(res.status).toBe(400);
    });

    test('accept valid E.164 number', async () => {
        const res = await request(app)
            .post('/api/pay/topup/create')
            .set('Authorization', 'Bearer test-token')
            .send({
                operator_id: 'uuid',
                product_id: 'uuid',
                phone_number: '+221771234567',
                currency: 'XOF'
            });

        expect(res.body.status).toBe('pending');
    });
});