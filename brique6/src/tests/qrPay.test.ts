import request from 'supertest';
import app from '../app';

describe('QR Payment API', () => {
    it('should generate QR code', async () => {
        const res = await request(app)
            .post('/api/pay/qr/generate')
            .set('Authorization', 'Bearer valid-token')
            .send({ amount: 2500, currency: 'XOF', expires_in: 120 });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('qr_value');
    });

    it('should return error without auth', async () => {
        const res = await request(app)
            .post('/api/pay/qr/generate')
            .send({ amount: 2500, currency: 'XOF' });

        expect(res.status).toBe(401);
    });
});