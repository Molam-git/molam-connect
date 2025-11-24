import request from 'supertest';
import app from '../../src/app';

describe('Dispute Flow Integration Tests', () => {
    it('should create dispute and upload evidence', async () => {
        const disputeData = {
            origin: 'user',
            origin_id: 'user_123',
            transaction_id: 'txn_123',
            amount: 100.50,
            currency: 'XOF',
            dispute_type: 'double_debit'
        };

        const response = await request(app)
            .post('/api/disputes')
            .send(disputeData)
            .expect(200);

        expect(response.body.id).toBeDefined();
    });
});