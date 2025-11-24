import request from 'supertest';
import express from 'express';
import { createServer } from '../../src/server';

// Mock de la base de données
jest.mock('../../src/db', () => ({
    pool: {
        query: jest.fn()
    }
}));

const { pool } = require('../../src/db');

describe('Templates API Integration Tests', () => {
    let app: express.Application;

    beforeEach(() => {
        app = createServer();
        jest.clearAllMocks();
    });

    describe('GET /api/templates/:key/render', () => {
        it('should render template with variables', async () => {
            // Mock de la base de données
            (pool.query as jest.Mock).mockResolvedValueOnce({
                rows: [{
                    id: 'test-id',
                    template_key: 'wallet.topup.success',
                    channel: 'sms',
                    lang: 'en',
                    version: 1,
                    content: 'Hello ${user_name}, you received ${amount} ${currency}',
                    is_active: true
                }]
            });

            const response = await request(app)
                .get('/api/templates/wallet.topup.success/render')
                .query({
                    lang: 'en',
                    channel: 'sms',
                    user_name: 'John',
                    amount: 1000,
                    currency: 'XOF'
                });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                rendered: 'Hello John, you received 1000 XOF',
                template_key: 'wallet.topup.success',
                channel: 'sms',
                lang: 'en',
                version: 1
            });
        });

        // ... autres tests
    });

    // ... autres describe
});