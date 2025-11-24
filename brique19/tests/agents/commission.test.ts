import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
    getBalances,
    createStatement,
    getStatement,
    addAdjustment,
    lockStatement
} from '../../src/agents/commission.service';
import { runCommissionRollup } from '../../src/agents/commission.worker';
import { AuditService } from '../../src/common/audit';

// Définir les types pour les mocks
type MockQueryFunction = jest.MockedFunction<(query: string, params?: any[]) => Promise<any>>;
type MockPool = {
    connect: jest.MockedFunction<() => Promise<MockClient>>;
    query: MockQueryFunction;
    end: jest.MockedFunction<() => Promise<void>>;
};

type MockClient = {
    query: MockQueryFunction;
    release: jest.MockedFunction<() => void>;
};

// Mock de la base de données avec typage correct
const mockPoolQuery = jest.fn() as MockQueryFunction;
const mockClientQuery = jest.fn() as MockQueryFunction;
const mockClientRelease = jest.fn();

const mockPool = {
    connect: jest.fn(() => Promise.resolve({
        query: mockClientQuery,
        release: mockClientRelease
    })),
    query: mockPoolQuery,
    end: jest.fn()
} as MockPool;

jest.mock('pg', () => ({
    Pool: jest.fn(() => mockPool)
}));

// Mock des services de sécurité
jest.mock('../../src/common/security', () => ({
    verifyEmployeeJWT: jest.fn(),
    verifyAgentJWT: jest.fn(),
    requireFinanceRole: jest.fn()
}));

// Mock du service d'événements
jest.mock('../../src/common/events', () => ({
    publishEvent: jest.fn()
}));

// Mock du service d'audit
jest.mock('../../src/common/audit', () => ({
    AuditService: {
        log: jest.fn()
    }
}));

// Import des mocks APRÈS les déclarations
const { verifyEmployeeJWT, verifyAgentJWT, requireFinanceRole } = require('../../src/common/security');
const { publishEvent } = require('../../src/common/events');

describe('Commission Service Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Configuration par défaut des mocks
        mockClientRelease.mockReset();
        mockPool.connect.mockResolvedValue({
            query: mockClientQuery,
            release: mockClientRelease
        });
    });

    describe('getBalances', () => {
        it('should return balances for agent', async () => {
            const mockBalances = [
                {
                    currency: 'XOF',
                    accrued_minor: 10000,
                    locked_minor: 5000,
                    paid_minor: 2000,
                    updated_at: new Date()
                }
            ];

            mockPoolQuery.mockResolvedValue({ rows: mockBalances });

            // Mock de l'authentification agent
            verifyAgentJWT.mockResolvedValue({
                type: 'AGENT',
                agentId: 123
            });

            const mockRequest = {
                headers: { 'x-actor-type': 'AGENT' },
                query: { agentId: '123' }
            };

            const mockResponse = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await getBalances(mockRequest as any, mockResponse as any);

            expect(mockResponse.json).toHaveBeenCalledWith({
                agentId: 123,
                balances: mockBalances
            });
            expect(mockPoolQuery).toHaveBeenCalledWith(
                `SELECT currency, accrued_minor, locked_minor, paid_minor, updated_at
         FROM molam_agent_commission_balances
        WHERE agent_id=$1`,
                [123]
            );
        });

        it('should reject agent accessing other agent balances', async () => {
            verifyAgentJWT.mockResolvedValue({
                type: 'AGENT',
                agentId: 123
            });

            const mockRequest = {
                headers: { 'x-actor-type': 'AGENT' },
                query: { agentId: '124' } // Différent de l'agent authentifié
            };

            const mockResponse = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await getBalances(mockRequest as any, mockResponse as any);

            expect(mockResponse.status).toHaveBeenCalledWith(403);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'forbidden' });
        });

        it('should allow finance to view any agent balances', async () => {
            const mockBalances = [
                {
                    currency: 'XOF',
                    accrued_minor: 15000,
                    locked_minor: 7000,
                    paid_minor: 3000,
                    updated_at: new Date()
                }
            ];

            mockPoolQuery.mockResolvedValue({ rows: mockBalances });

            // Mock de l'authentification employé
            verifyEmployeeJWT.mockResolvedValue({
                type: 'EMPLOYEE',
                employeeId: 1,
                roles: ['pay_finance']
            });

            const mockRequest = {
                headers: { 'x-actor-type': 'EMPLOYEE' },
                query: { agentId: '456' }
            };

            const mockResponse = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await getBalances(mockRequest as any, mockResponse as any);

            expect(mockResponse.json).toHaveBeenCalledWith({
                agentId: 456,
                balances: mockBalances
            });
        });
    });

    describe('createStatement', () => {
        it('should create statement for valid period', async () => {
            const mockStatement = {
                statement_id: 1,
                agent_id: 123,
                currency: 'XOF',
                status: 'OPEN',
                gross_minor: 10000,
                adjustments_minor: 0,
                net_minor: 10000,
                period_start: new Date('2024-01-01'),
                period_end: new Date('2024-01-07'),
                created_at: new Date(),
                locked_at: null,
                paid_at: null
            };

            requireFinanceRole.mockResolvedValue({
                type: 'EMPLOYEE',
                employeeId: 1
            });

            mockClientQuery
                .mockResolvedValueOnce({
                    rows: [{ fn_commission_lock_period: 1 }]
                })
                .mockResolvedValueOnce({
                    rows: [mockStatement]
                });

            const mockRequest = {
                body: {
                    agentId: 123,
                    currency: 'XOF',
                    periodStart: '2024-01-01T00:00:00Z',
                    periodEnd: '2024-01-07T23:59:59Z'
                }
            };

            const mockResponse = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await createStatement(mockRequest as any, mockResponse as any);

            expect(mockResponse.status).toHaveBeenCalledWith(201);
            expect(mockResponse.json).toHaveBeenCalledWith({
                statement: mockStatement
            });
            expect(mockClientQuery).toHaveBeenCalledWith(
                `SELECT fn_commission_lock_period($1,$2,$3::timestamptz,$4::timestamptz)`,
                [123, 'XOF', '2024-01-01T00:00:00Z', '2024-01-07T23:59:59Z']
            );
        });

        it('should reject invalid parameters', async () => {
            requireFinanceRole.mockResolvedValue({
                type: 'EMPLOYEE',
                employeeId: 1
            });

            const mockRequest = {
                body: { agentId: 123 } // Paramètres manquants
            };

            const mockResponse = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await createStatement(mockRequest as any, mockResponse as any);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'bad params' });
        });

        it('should handle database errors during statement creation', async () => {
            requireFinanceRole.mockResolvedValue({
                type: 'EMPLOYEE',
                employeeId: 1
            });

            mockClientQuery.mockRejectedValueOnce(new Error('Database error'));

            const mockRequest = {
                body: {
                    agentId: 123,
                    currency: 'XOF',
                    periodStart: '2024-01-01T00:00:00Z',
                    periodEnd: '2024-01-07T23:59:59Z'
                }
            };

            const mockResponse = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await createStatement(mockRequest as any, mockResponse as any);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
        });
    });

    describe('addAdjustment', () => {
        it('should apply adjustment to OPEN statement', async () => {
            const mockStatement = {
                statement_id: 1,
                agent_id: 123,
                currency: 'XOF',
                status: 'OPEN'
            };

            requireFinanceRole.mockResolvedValue({
                type: 'EMPLOYEE',
                employeeId: 1
            });

            mockClientQuery
                .mockResolvedValueOnce({ rows: [mockStatement] }) // SELECT FOR UPDATE
                .mockResolvedValueOnce({ rows: [] }) // INSERT adjustment
                .mockResolvedValueOnce({ rows: [] }) // APPLY adjustment
                .mockResolvedValueOnce({ rows: [] }); // Audit log

            const mockRequest = {
                params: { statementId: '1' },
                body: {
                    amountMinor: -500,
                    reasonCode: 'CHARGEBACK'
                }
            };

            const mockResponse = {
                json: jest.fn()
            };

            await addAdjustment(mockRequest as any, mockResponse as any);

            expect(mockResponse.json).toHaveBeenCalledWith({ ok: true });
            expect(mockClientQuery).toHaveBeenCalledWith(
                `INSERT INTO molam_agent_commission_adjustments(agent_id, currency, amount_minor, reason_code, related_statement)
         VALUES ($1,$2,$3,$4,$5)`,
                [123, 'XOF', -500, 'CHARGEBACK', 1]
            );
        });

        it('should reject adjustment on LOCKED statement', async () => {
            const mockStatement = {
                statement_id: 1,
                agent_id: 123,
                currency: 'XOF',
                status: 'LOCKED' // Déjà verrouillé
            };

            requireFinanceRole.mockResolvedValue({
                type: 'EMPLOYEE',
                employeeId: 1
            });

            mockClientQuery.mockResolvedValue({ rows: [mockStatement] });

            const mockRequest = {
                params: { statementId: '1' },
                body: {
                    amountMinor: -500,
                    reasonCode: 'CHARGEBACK'
                }
            };

            const mockResponse = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await addAdjustment(mockRequest as any, mockResponse as any);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
        });

        it('should handle positive adjustments (bonus)', async () => {
            const mockStatement = {
                statement_id: 1,
                agent_id: 123,
                currency: 'XOF',
                status: 'OPEN'
            };

            requireFinanceRole.mockResolvedValue({
                type: 'EMPLOYEE',
                employeeId: 1
            });

            mockClientQuery
                .mockResolvedValueOnce({ rows: [mockStatement] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const mockRequest = {
                params: { statementId: '1' },
                body: {
                    amountMinor: 1000,
                    reasonCode: 'BONUS'
                }
            };

            const mockResponse = {
                json: jest.fn()
            };

            await addAdjustment(mockRequest as any, mockResponse as any);

            expect(mockResponse.json).toHaveBeenCalledWith({ ok: true });
            expect(mockClientQuery).toHaveBeenCalledWith(
                `INSERT INTO molam_agent_commission_adjustments(agent_id, currency, amount_minor, reason_code, related_statement)
         VALUES ($1,$2,$3,$4,$5)`,
                [123, 'XOF', 1000, 'BONUS', 1]
            );
        });
    });

    describe('lockStatement', () => {
        it('should lock OPEN statement successfully', async () => {
            const mockStatement = {
                statement_id: 1,
                agent_id: 123,
                currency: 'XOF',
                status: 'OPEN'
            };

            requireFinanceRole.mockResolvedValue({
                type: 'EMPLOYEE',
                employeeId: 1
            });

            mockClientQuery
                .mockResolvedValueOnce({ rows: [mockStatement] }) // SELECT FOR UPDATE
                .mockResolvedValueOnce({ rows: [] }) // LOCK function
                .mockResolvedValueOnce({ rows: [] }); // Audit log

            const mockRequest = {
                params: { statementId: '1' }
            };

            const mockResponse = {
                json: jest.fn()
            };

            await lockStatement(mockRequest as any, mockResponse as any);

            expect(mockResponse.json).toHaveBeenCalledWith({
                ok: true,
                status: 'LOCKED'
            });
            expect(publishEvent).toHaveBeenCalledWith('agent.statement.locked', { statementId: 1 });
        });

        it('should reject locking already LOCKED statement', async () => {
            const mockStatement = {
                statement_id: 1,
                agent_id: 123,
                currency: 'XOF',
                status: 'LOCKED' // Déjà verrouillé
            };

            requireFinanceRole.mockResolvedValue({
                type: 'EMPLOYEE',
                employeeId: 1
            });

            mockClientQuery.mockResolvedValue({ rows: [mockStatement] });

            const mockRequest = {
                params: { statementId: '1' }
            };

            const mockResponse = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await lockStatement(mockRequest as any, mockResponse as any);

            expect(mockResponse.status).toHaveBeenCalledWith(400);
        });
    });

    describe('getStatement', () => {
        it('should return statement details with lines', async () => {
            const mockHeader = {
                statement_id: 1,
                agent_id: 123,
                currency: 'XOF',
                status: 'OPEN',
                period_start: new Date('2024-01-01'),
                period_end: new Date('2024-01-07'),
                gross_minor: 10000,
                adjustments_minor: 0,
                net_minor: 10000,
                created_at: new Date(),
                locked_at: null,
                paid_at: null
            };

            const mockLines = [
                {
                    line_id: 1,
                    statement_id: 1,
                    op_id: 1001,
                    fee_minor: 1000,
                    agent_share_minor: 800,
                    created_at: new Date('2024-01-05'),
                    op_type: 'CASHIN'
                },
                {
                    line_id: 2,
                    statement_id: 1,
                    op_id: 1002,
                    fee_minor: 1500,
                    agent_share_minor: 1200,
                    created_at: new Date('2024-01-06'),
                    op_type: 'CASHIN'
                }
            ];

            mockPoolQuery
                .mockResolvedValueOnce({ rows: [mockHeader] })
                .mockResolvedValueOnce({ rows: mockLines });

            const mockRequest = {
                params: { statementId: '1' }
            };

            const mockResponse = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await getStatement(mockRequest as any, mockResponse as any);

            expect(mockResponse.json).toHaveBeenCalledWith({
                header: mockHeader,
                lines: mockLines
            });

            expect(mockPoolQuery).toHaveBeenCalledWith(
                `SELECT * FROM molam_agent_statements WHERE statement_id=$1`,
                [1]
            );

            expect(mockPoolQuery).toHaveBeenCalledWith(
                `SELECT l.*, o.op_type, o.created_at
         FROM molam_agent_statement_lines l
         JOIN molam_cash_operations o ON o.op_id = l.op_id
        WHERE l.statement_id=$1
        ORDER BY l.line_id ASC`,
                [1]
            );
        });

        it('should return 404 for non-existent statement', async () => {
            mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // Aucun statement trouvé

            const mockRequest = {
                params: { statementId: '999' }
            };

            const mockResponse = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await getStatement(mockRequest as any, mockResponse as any);

            expect(mockResponse.status).toHaveBeenCalledWith(404);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: "not found" });
        });
    });
});

describe('Commission Worker Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('runCommissionRollup', () => {
        it('should create statements for all agents', async () => {
            const mockAgents = [
                { agent_id: 1, currency: 'XOF', freq: 'WEEKLY' },
                { agent_id: 2, currency: 'XOF', freq: 'MONTHLY' }
            ];

            mockPoolQuery
                .mockResolvedValueOnce({ rows: mockAgents }) // SELECT agents
                .mockResolvedValueOnce({ rows: [] }) // WEEKLY statement
                .mockResolvedValueOnce({ rows: [] }); // MONTHLY statement

            await runCommissionRollup(new Date('2024-01-15'));

            expect(mockPoolQuery).toHaveBeenCalledTimes(3);
            expect(mockPoolQuery).toHaveBeenCalledWith(
                `SELECT agent_id, country_code, currencies[1] AS currency, 
                COALESCE(metadata->>'payout_frequency','WEEKLY') AS freq
           FROM molam_agents`
            );
        });

        it('should handle statement creation errors gracefully', async () => {
            const mockAgents = [
                { agent_id: 1, currency: 'XOF', freq: 'WEEKLY' }
            ];

            mockPoolQuery
                .mockResolvedValueOnce({ rows: mockAgents })
                .mockRejectedValueOnce(new Error('UNIQUE constraint')); // Duplicate statement

            // Ne devrait pas throw d'erreur
            await expect(runCommissionRollup(new Date())).resolves.not.toThrow();
        });

        it('should handle agents without currency', async () => {
            const mockAgents = [
                { agent_id: 1, currency: null, freq: 'WEEKLY' } // Currency null
            ];

            mockPoolQuery
                .mockResolvedValueOnce({ rows: mockAgents })
                .mockResolvedValueOnce({ rows: [] });

            await runCommissionRollup(new Date());

            expect(mockPoolQuery).toHaveBeenCalledTimes(2);
        });
    });
});

// Tests séparés pour Audit Service
describe('Audit Service Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should log audit with chained hash', async () => {
        const mockAuditData = {
            actor_type: 'EMPLOYEE' as const,
            actor_id: 1,
            action: 'AGENT_COMM_ADJUST',
            target_id: 123,
            context: { amountMinor: -500, reasonCode: 'CHARGEBACK' }
        };

        mockPoolQuery
            .mockResolvedValueOnce({ rows: [] }) // No previous hash
            .mockResolvedValueOnce({ rows: [{ hash_curr: 'abc123' }] }) // Hash calculation
            .mockResolvedValueOnce({ rows: [] }); // INSERT

        await AuditService.log(mockAuditData);

        expect(mockPoolQuery).toHaveBeenCalledTimes(3);
        expect(AuditService.log).toHaveBeenCalledWith(mockAuditData);
    });

    it('should handle audit log errors gracefully', async () => {
        const mockAuditData = {
            actor_type: 'EMPLOYEE' as const,
            actor_id: 1,
            action: 'AGENT_COMM_ADJUST',
            target_id: 123,
            context: { amountMinor: -500, reasonCode: 'CHARGEBACK' }
        };

        mockPoolQuery.mockRejectedValueOnce(new Error('Database error'));

        await expect(AuditService.log(mockAuditData)).rejects.toThrow('Database error');
    });
});

// Tests de sécurité
describe('Security Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should enforce finance role for createStatement', async () => {
        requireFinanceRole.mockRejectedValue(new Error('Insufficient permissions'));

        const mockRequest = {
            body: {
                agentId: 123,
                currency: 'XOF',
                periodStart: '2024-01-01T00:00:00Z',
                periodEnd: '2024-01-07T23:59:59Z'
            }
        };

        const mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await expect(createStatement(mockRequest as any, mockResponse as any))
            .rejects.toThrow('Insufficient permissions');
    });

    it('should enforce finance role for adjustments', async () => {
        requireFinanceRole.mockRejectedValue(new Error('Insufficient permissions'));

        const mockRequest = {
            params: { statementId: '1' },
            body: {
                amountMinor: -500,
                reasonCode: 'CHARGEBACK'
            }
        };

        const mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await expect(addAdjustment(mockRequest as any, mockResponse as any))
            .rejects.toThrow('Insufficient permissions');
    });

    it('should enforce finance role for lock statement', async () => {
        requireFinanceRole.mockRejectedValue(new Error('Insufficient permissions'));

        const mockRequest = {
            params: { statementId: '1' }
        };

        const mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await expect(lockStatement(mockRequest as any, mockResponse as any))
            .rejects.toThrow('Insufficient permissions');
    });
});

// Tests multi-devises
describe('Multi-Currency Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should handle multiple currencies in balances', async () => {
        const mockBalances = [
            { currency: 'XOF', accrued_minor: 10000, locked_minor: 5000, paid_minor: 2000, updated_at: new Date() },
            { currency: 'EUR', accrued_minor: 5000, locked_minor: 2000, paid_minor: 1000, updated_at: new Date() }
        ];

        mockPoolQuery.mockResolvedValue({ rows: mockBalances });
        verifyAgentJWT.mockResolvedValue({ type: 'AGENT', agentId: 123 });

        const mockRequest = {
            headers: { 'x-actor-type': 'AGENT' },
            query: { agentId: '123' }
        };

        const mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await getBalances(mockRequest as any, mockResponse as any);

        expect(mockResponse.json).toHaveBeenCalledWith({
            agentId: 123,
            balances: mockBalances
        });
    });

    it('should create statement for specific currency', async () => {
        const mockStatement = {
            statement_id: 1,
            agent_id: 123,
            currency: 'EUR',
            status: 'OPEN'
        };

        requireFinanceRole.mockResolvedValue({ type: 'EMPLOYEE', employeeId: 1 });
        mockClientQuery
            .mockResolvedValueOnce({ rows: [{ fn_commission_lock_period: 1 }] })
            .mockResolvedValueOnce({ rows: [mockStatement] });

        const mockRequest = {
            body: {
                agentId: 123,
                currency: 'EUR',
                periodStart: '2024-01-01T00:00:00Z',
                periodEnd: '2024-01-07T23:59:59Z'
            }
        };

        const mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await createStatement(mockRequest as any, mockResponse as any);

        expect(mockClientQuery).toHaveBeenCalledWith(
            `SELECT fn_commission_lock_period($1,$2,$3::timestamptz,$4::timestamptz)`,
            [123, 'EUR', '2024-01-01T00:00:00Z', '2024-01-07T23:59:59Z']
        );
    });
});

// Tests de validation des données
describe('Data Validation Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should validate statement ID is number', async () => {
        const mockRequest = {
            params: { statementId: 'invalid' } // ID non numérique
        };

        const mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await getStatement(mockRequest as any, mockResponse as any);

        expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should validate agent ID is number', async () => {
        verifyAgentJWT.mockResolvedValue({ type: 'AGENT', agentId: 123 });

        const mockRequest = {
            headers: { 'x-actor-type': 'AGENT' },
            query: { agentId: 'invalid' } // ID non numérique
        };

        const mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await getBalances(mockRequest as any, mockResponse as any);

        expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
});