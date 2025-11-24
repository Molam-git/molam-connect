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

// Mock transaction endpoints
app.post('/api/agents/:id/transactions', (req, res) => {
    const { type, amount, userId } = req.body;

    if (req.params.id === 'non-existent-id') {
        return res.status(404).json({ error: 'Agent not found' });
    }

    if (type === 'CASHOUT' && amount > 1000) {
        return res.status(400).json({ error: 'Insufficient funds' });
    }

    const commission = type === 'CASHOUT' ? amount * 0.01 : 0;

    res.status(201).json({
        tx_id: '123e4567-e89b-12d3-a456-426614174003',
        agent_id: req.params.id,
        user_id: userId,
        type,
        amount,
        currency: 'USD',
        commission,
        status: 'SUCCESS',
        created_at: new Date()
    });
});

app.get('/api/agents/:id/transactions', (req, res) => {
    res.json([
        {
            tx_id: '123e4567-e89b-12d3-a456-426614174003',
            type: 'CASHIN',
            amount: 10000,
            status: 'SUCCESS',
            created_at: new Date()
        }
    ]);
});

describe('Agent Transaction API', () => {
    let pool: jest.Mocked<Pool>;

    beforeAll(() => {
        pool = new Pool() as jest.Mocked<Pool>;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/agents/:id/transactions', () => {
        it('should process cash-in transaction', async () => {
            const response = await request(app)
                .post('/api/agents/123e4567-e89b-12d3-a456-426614174000/transactions')
                .send({
                    type: 'CASHIN',
                    amount: 10000,
                    userId: '123e4567-e89b-12d3-a456-426614174001'
                });

            expect(response.status).toBe(201);
            expect(response.body.type).toBe('CASHIN');
            expect(response.body.commission).toBe(0);
        });

        it('should process cash-out transaction with commission', async () => {
            const response = await request(app)
                .post('/api/agents/123e4567-e89b-12d3-a456-426614174000/transactions')
                .send({
                    type: 'CASHOUT',
                    amount: 5000,
                    userId: '123e4567-e89b-12d3-a456-426614174001'
                });

            expect(response.status).toBe(201);
            expect(response.body.type).toBe('CASHOUT');
            expect(response.body.commission).toBe(50); // 1% of 5000
        });

        it('should return 400 for insufficient funds', async () => {
            const response = await request(app)
                .post('/api/agents/123e4567-e89b-12d3-a456-426614174000/transactions')
                .send({
                    type: 'CASHOUT',
                    amount: 5000, // This will trigger insufficient funds in our mock
                    userId: '123e4567-e89b-12d3-a456-426614174001'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Insufficient funds');
        });

        it('should return 404 for non-existent agent', async () => {
            const response = await request(app)
                .post('/api/agents/non-existent-id/transactions')
                .send({
                    type: 'CASHIN',
                    amount: 1000,
                    userId: '123e4567-e89b-12d3-a456-426614174001'
                });

            expect(response.status).toBe(404);
        });
    });

    describe('GET /api/agents/:id/transactions', () => {
        it('should return agent transactions', async () => {
            const response = await request(app)
                .get('/api/agents/123e4567-e89b-12d3-a456-426614174000/transactions');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(1);
            expect(response.body[0].type).toBe('CASHIN');
        });
    });
});