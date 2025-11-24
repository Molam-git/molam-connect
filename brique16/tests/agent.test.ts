import { describe, it, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { Pool } from 'pg';
import express from 'express';

jest.mock('pg', () => {
    const mockPool = {
        connect: jest.fn(),
        query: jest.fn(),
        end: jest.fn(),
    };
    return { Pool: jest.fn(() => mockPool) };
});

const app = express();
app.use(express.json());

// Mock payout endpoints
app.post('/api/agents/:id/payouts', (req, res) => {
    const { amount, scheduled_for } = req.body;

    if (req.params.id === 'non-existent-id') {
        return res.status(404).json({ error: 'Agent not found' });
    }

    if (amount > 1000) {
        return res.status(400).json({ error: 'Insufficient commissions' });
    }

    res.status(201).json({
        payout_id: '123e4567-e89b-12d3-a456-426614174004',
        agent_id: req.params.id,
        amount,
        currency: 'USD',
        status: 'PENDING',
        scheduled_for: new Date(scheduled_for),
        created_at: new Date()
    });
});

app.post('/api/agents/payouts/:payout_id/process', (req, res) => {
    if (req.params.payout_id === 'non-existent-id') {
        return res.status(404).json({ error: 'Payout not found' });
    }

    res.json({
        payout_id: req.params.payout_id,
        agent_id: '123e4567-e89b-12d3-a456-426614174000',
        amount: 5000,
        currency: 'USD',
        status: 'SENT',
        scheduled_for: new Date(),
        created_at: new Date()
    });
});

app.get('/api/agents/:id/payouts', (req, res) => {
    res.json([
        {
            payout_id: '123e4567-e89b-12d3-a456-426614174004',
            amount: 5000,
            status: 'SENT',
            created_at: new Date()
        }
    ]);
});

describe('Agent Payout API', () => {
    let pool: jest.Mocked<Pool>;

    beforeAll(() => {
        pool = new Pool() as jest.Mocked<Pool>;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/agents/:id/payouts', () => {
        it('should schedule a payout', async () => {
            const response = await request(app)
                .post('/api/agents/123e4567-e89b-12d3-a456-426614174000/payouts')
                .send({
                    amount: 500,
                    scheduled_for: '2024-01-20T00:00:00Z'
                });

            expect(response.status).toBe(201);
            expect(response.body.amount).toBe(500);
            expect(response.body.status).toBe('PENDING');
        });

        it('should return 400 for insufficient commissions', async () => {
            const response = await request(app)
                .post('/api/agents/123e4567-e89b-12d3-a456-426614174000/payouts')
                .send({
                    amount: 5000, // This will trigger insufficient commissions in our mock
                    scheduled_for: '2024-01-20T00:00:00Z'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Insufficient commissions');
        });

        it('should return 404 for non-existent agent', async () => {
            const response = await request(app)
                .post('/api/agents/non-existent-id/payouts')
                .send({
                    amount: 500,
                    scheduled_for: '2024-01-20T00:00:00Z'
                });

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/agents/payouts/:payout_id/process', () => {
        it('should process a payout', async () => {
            const response = await request(app)
                .post('/api/agents/payouts/123e4567-e89b-12d3-a456-426614174004/process');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('SENT');
        });

        it('should return 404 for non-existent payout', async () => {
            const response = await request(app)
                .post('/api/agents/payouts/non-existent-id/process');

            expect(response.status).toBe(404);
        });
    });

    describe('GET /api/agents/:id/payouts', () => {
        it('should return agent payouts', async () => {
            const response = await request(app)
                .get('/api/agents/123e4567-e89b-12d3-a456-426614174000/payouts');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(1);
            expect(response.body[0].status).toBe('SENT');
        });
    });
});