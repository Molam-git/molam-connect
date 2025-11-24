// tests/setupJest.ts
// Minimal env setup for tests
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/testdb';
process.env.MOLAM_ID_JWT_PUBLIC = 'test-public-key';
process.env.KAFKA_BROKERS = 'localhost:9092';
process.env.TWILIO_API_KEY = 'test-twilio-key';

// Global test timeout
jest.setTimeout(30000);

// Provide a mock for authz middleware
jest.mock('../src/utils/authz', () => {
    return {
        authzMiddleware: (req: any, res: any, next: any) => {
            // attach synthetic user compatible with tests
            req.user = {
                id: 'test-user-id',
                roles: ['pay_admin', 'agent_ops'],
                country: 'SN',
                currency: 'XOF',
                lang: 'fr',
                agentId: 123
            };
            return next();
        },
        requireRole: (roles: string[]) => (req: any, res: any, next: any) => {
            const user = req.user;
            if (!user || !user.roles.some((r: string) => roles.includes(r))) {
                return res.status(403).json({ error: 'forbidden' });
            }
            return next();
        }
    };
});