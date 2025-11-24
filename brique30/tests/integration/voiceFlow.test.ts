// tests/integration/voiceFlow.test.ts
import request from 'supertest';
import { app } from '../../src/index';
import { pool } from '../../src/db';
import { publishKafka } from '../../src/lib/kafka';

jest.mock('../../src/db');
jest.mock('../../src/lib/kafka');

describe('Voice Flow Integration', () => {
    it('should send voice message', async () => {
        const mockUser = {
            id: 'user123',
            language: 'fr',
            country: 'SN',
            phone: '+221771234567',
            region: 'CEDEAO',
            first_name: 'Jean'
        };

        const mockTemplate = {
            id: 'tpl123',
            template_key: 'test_voice',
            channel: 'voice',
            lang: 'fr',
            content: 'Bonjour {{user_name}}',
            is_active: true,
            version: 1
        };

        const mockProvider = {
            id: 'twilio',
            name: 'Twilio',
            endpoint: 'https://api.twilio.com',
            per_minute_usd: 0.05,
            supported_langs: ['en', 'fr'],
            regions_supported: ['SN'],
            is_active: true
        };

        (pool.query as jest.Mock)
            .mockResolvedValueOnce({ rows: [mockUser] }) // User query
            .mockResolvedValueOnce({ rows: [mockTemplate] }) // Template query
            .mockResolvedValueOnce({ rows: [mockProvider] }); // Provider query

        const response = await request(app)
            .post('/api/voice/send')
            .send({
                user_id: 'user123',
                template_key: 'test_voice',
                vars: { user_name: 'Jean' },
                prefer_voice: true
            });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true });
    });
});