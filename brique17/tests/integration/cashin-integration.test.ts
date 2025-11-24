import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { cashinRouter } from '../../src/routes/cashinRoutes';

// Définir le type pour le mock
type MockQueryFunction = jest.MockedFunction<(query: string, params?: any[]) => Promise<any>>;

// Mock des middlewares d'authentification
const mockAuthUserJWT = jest.fn((req: any, res: any, next: any) => {
    req.user = {
        sub: 'user-123',
        email: 'user@molam.com',
        kyc_status: 'VERIFIED'
    };
    next();
});

const mockAuthAgentJWT = jest.fn((req: any, res: any, next: any) => {
    req.agent = {
        sub: 'agent-456',
        business_name: 'Test Agent',
        kyc_status: 'VERIFIED'
    };
    next();
});

jest.mock('../../src/middleware/auth', () => ({
    authUserJWT: mockAuthUserJWT,
    authAgentJWT: mockAuthAgentJWT
}));

// Mock de la base de données avec typage correct
const mockDbQuery = jest.fn() as MockQueryFunction;

jest.mock('../../src/utils/database', () => ({
    db: {
        query: mockDbQuery,
    },
    testConnection: jest.fn(),
    healthCheck: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use(cashinRouter);

describe('Cash-In Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    describe('POST /api/agents/:agentId/cashin', () => {
        it('should process cash-in successfully with valid data', async () => {
            // Mock des appels à la base de données avec typage correct
            mockDbQuery
                .mockResolvedValueOnce({
                    rows: [{
                        code: '123456',
                        expires_at: new Date(Date.now() + 60000),
                        used: false
                    }]
                }) // OTP valide
                .mockResolvedValueOnce({
                    rows: [{ kyc_status: 'VERIFIED', status: 'ACTIVE' }]
                }) // Agent KYC
                .mockResolvedValueOnce({
                    rows: [{ balance: 50000 }]
                }) // Solde agent
                .mockResolvedValueOnce({
                    rows: [{ tx_id: 'tx-uuid-123' }]
                }) // Transaction
                .mockResolvedValueOnce({ rows: [] }) // Marquer OTP utilisé
                .mockResolvedValueOnce({ rows: [] }) // Notification user
                .mockResolvedValueOnce({ rows: [] }); // Notification agent

            const response = await request(app)
                .post('/api/agents/agent-456/cashin')
                .set('Authorization', 'Bearer user-jwt')
                .set('X-Agent-JWT', 'agent-jwt')
                .send({
                    amount: 10000,
                    currency: 'XOF',
                    otp: '123456'
                });

            expect(response.status).toBe(201);
            expect(response.body).toEqual({
                txId: 'tx-uuid-123',
                status: 'SUCCESS',
                message: 'Cash-in processed successfully'
            });
        });

        it('should reject cash-in with invalid OTP', async () => {
            mockDbQuery
                .mockResolvedValueOnce({ rows: [] }); // Aucun OTP trouvé

            const response = await request(app)
                .post('/api/agents/agent-456/cashin')
                .set('Authorization', 'Bearer user-jwt')
                .set('X-Agent-JWT', 'agent-jwt')
                .send({
                    amount: 10000,
                    currency: 'XOF',
                    otp: 'wrong-otp'
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error', 'Invalid OTP');
        });

        it('should reject cash-in with insufficient agent balance', async () => {
            mockDbQuery
                .mockResolvedValueOnce({
                    rows: [{
                        code: '123456',
                        expires_at: new Date(Date.now() + 60000),
                        used: false
                    }]
                }) // OTP valide
                .mockResolvedValueOnce({
                    rows: [{ kyc_status: 'VERIFIED', status: 'ACTIVE' }]
                }) // Agent KYC
                .mockResolvedValueOnce({
                    rows: [{ balance: 5000 }]
                }) // Solde agent insuffisant
                .mockRejectedValueOnce(new Error('Insufficient agent float')); // Transaction échoue

            const response = await request(app)
                .post('/api/agents/agent-456/cashin')
                .set('Authorization', 'Bearer user-jwt')
                .set('X-Agent-JWT', 'agent-jwt')
                .send({
                    amount: 10000,
                    currency: 'XOF',
                    otp: '123456'
                });

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error', 'Cash-in failed');
        });

        it('should reject cash-in with invalid currency', async () => {
            const response = await request(app)
                .post('/api/agents/agent-456/cashin')
                .set('Authorization', 'Bearer user-jwt')
                .set('X-Agent-JWT', 'agent-jwt')
                .send({
                    amount: 10000,
                    currency: 'INVALID', // Devrait être 3 caractères
                    otp: '123456'
                });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('errors');
        });

        it('should reject cash-in with negative amount', async () => {
            const response = await request(app)
                .post('/api/agents/agent-456/cashin')
                .set('Authorization', 'Bearer user-jwt')
                .set('X-Agent-JWT', 'agent-jwt')
                .send({
                    amount: -100,
                    currency: 'XOF',
                    otp: '123456'
                });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('errors');
        });
    });

    describe('GET /api/transactions/cashin/:transactionId', () => {
        it('should return transaction status for valid transaction', async () => {
            const mockTransaction = {
                tx_id: 'tx-uuid-123',
                agent_id: 'agent-456',
                user_id: 'user-123',
                type: 'CASHIN',
                amount: 10000,
                currency: 'XOF',
                status: 'SUCCESS',
                created_at: new Date()
            };

            mockDbQuery
                .mockResolvedValueOnce({ rows: [mockTransaction] });

            const response = await request(app)
                .get('/api/transactions/cashin/tx-uuid-123')
                .set('Authorization', 'Bearer user-jwt');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                transactionId: 'tx-uuid-123',
                status: 'SUCCESS'
            });
        });

        it('should return 404 for non-existent transaction', async () => {
            mockDbQuery
                .mockResolvedValueOnce({ rows: [] });

            const response = await request(app)
                .get('/api/transactions/cashin/non-existent')
                .set('Authorization', 'Bearer user-jwt');

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'Transaction not found');
        });
    });
});