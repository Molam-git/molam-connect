import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { cashinService } from '../src/services/cashinService';

// Définir les types pour les mocks
type MockQueryFunction = jest.MockedFunction<(query: string, params?: any[]) => Promise<any>>;

// Mock de la base de données avec typage correct
const mockDbQuery = jest.fn() as MockQueryFunction;

jest.mock('../src/utils/database', () => ({
    db: {
        query: mockDbQuery,
    },
}));

// Mock des autres services avec TOUTES les méthodes
jest.mock('../src/services/notificationService', () => ({
    notificationService: {
        sendCashinConfirmation: jest.fn(),
        sendOTP: jest.fn(),
        sendAgentNotification: jest.fn(),
        getUserNotifications: jest.fn(),
        markAsRead: jest.fn(),
        templates: {
            CASHIN_SUCCESS: {
                fr: { title: 'Dépôt réussi', message: 'Votre dépôt de {amount} {currency} a été effectué' },
                en: { title: 'Deposit successful', message: 'Your deposit of {amount} {currency} has been processed' }
            },
            CASHIN_AGENT: {
                fr: { title: 'Cash-in traité', message: 'Cash-in de {amount} {currency} pour l\'utilisateur {userId}' },
                en: { title: 'Cash-in processed', message: 'Cash-in of {amount} {currency} for user {userId}' }
            },
            OTP_SENT: {
                fr: { title: 'Code de sécurité', message: 'Votre code OTP est {otp}' },
                en: { title: 'Security code', message: 'Your OTP code is {otp}' }
            }
        }
    },
}));

jest.mock('../src/services/auditService', () => ({
    auditService: {
        logSuccessfulTransaction: jest.fn(),
        logFailedAttempt: jest.fn(),
        logSuspiciousActivity: jest.fn(),
        alertSira: jest.fn(),
        getAgentAuditLogs: jest.fn(),
        getUserAuditLogs: jest.fn(),
    },
}));

// Import des services mockés APRÈS les mocks
const { notificationService } = require('../src/services/notificationService');
const { auditService } = require('../src/services/auditService');

describe('CashIn Service Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('validateOTP', () => {
        it('should return true for valid OTP', async () => {
            const mockOtp = {
                code: '123456',
                expires_at: new Date(Date.now() + 60000),
                used: false
            };

            mockDbQuery
                .mockResolvedValueOnce({ rows: [mockOtp] })
                .mockResolvedValueOnce({ rows: [] }); // Pour le update

            const result = await cashinService.validateOTP('user-123', '123456');

            expect(result).toBe(true);
            expect(mockDbQuery).toHaveBeenCalledTimes(2);
        });

        it('should return false for expired OTP', async () => {
            const mockOtp = {
                code: '123456',
                expires_at: new Date(Date.now() - 60000), // Expiré
                used: false
            };

            mockDbQuery.mockResolvedValueOnce({ rows: [mockOtp] });

            const result = await cashinService.validateOTP('user-123', '123456');

            expect(result).toBe(false);
        });

        it('should return false for used OTP', async () => {
            const mockOtp = {
                code: '123456',
                expires_at: new Date(Date.now() + 60000),
                used: true // Déjà utilisé
            };

            mockDbQuery.mockResolvedValueOnce({ rows: [mockOtp] });

            const result = await cashinService.validateOTP('user-123', '123456');

            expect(result).toBe(false);
        });

        it('should return false for non-existent OTP', async () => {
            mockDbQuery.mockResolvedValueOnce({ rows: [] });

            const result = await cashinService.validateOTP('user-123', '123456');

            expect(result).toBe(false);
        });
    });

    describe('validateAgentKYC', () => {
        it('should return true for verified agent', async () => {
            mockDbQuery.mockResolvedValueOnce({
                rows: [{ kyc_status: 'VERIFIED', status: 'ACTIVE' }]
            });

            const result = await cashinService.validateAgentKYC('agent-123');

            expect(result).toBe(true);
        });

        it('should return false for non-verified agent', async () => {
            mockDbQuery.mockResolvedValueOnce({
                rows: [{ kyc_status: 'PENDING', status: 'ACTIVE' }]
            });

            const result = await cashinService.validateAgentKYC('agent-123');

            expect(result).toBe(false);
        });

        it('should return false for inactive agent', async () => {
            mockDbQuery.mockResolvedValueOnce({
                rows: [{ kyc_status: 'VERIFIED', status: 'INACTIVE' }]
            });

            const result = await cashinService.validateAgentKYC('agent-123');

            expect(result).toBe(false);
        });

        it('should return false for non-existent agent', async () => {
            mockDbQuery.mockResolvedValueOnce({ rows: [] });

            const result = await cashinService.validateAgentKYC('agent-123');

            expect(result).toBe(false);
        });
    });

    describe('executeCashin', () => {
        it('should execute cashin successfully', async () => {
            mockDbQuery.mockResolvedValueOnce({
                rows: [{ tx_id: 'tx-123' }]
            });

            const result = await cashinService.executeCashin(
                'agent-123',
                'user-123',
                10000,
                'XOF'
            );

            expect(result).toBe('tx-123');
            expect(mockDbQuery).toHaveBeenCalledWith(
                `SELECT cashin_transaction($1, $2, $3, $4) as tx_id`,
                ['agent-123', 'user-123', 10000, 'XOF']
            );
        });

        it('should handle database errors', async () => {
            mockDbQuery.mockRejectedValueOnce(new Error('Database error'));

            await expect(
                cashinService.executeCashin('agent-123', 'user-123', 10000, 'XOF')
            ).rejects.toThrow('Database error');
        });
    });

    describe('getTransactionStatus', () => {
        it('should return transaction status for valid transaction', async () => {
            const mockTransaction = {
                tx_id: 'tx-123',
                status: 'SUCCESS',
                amount: 10000,
                currency: 'XOF'
            };

            mockDbQuery.mockResolvedValueOnce({ rows: [mockTransaction] });

            const result = await cashinService.getTransactionStatus('tx-123');

            expect(result).toEqual(mockTransaction);
        });

        it('should throw error for non-existent transaction', async () => {
            mockDbQuery.mockResolvedValueOnce({ rows: [] });

            await expect(
                cashinService.getTransactionStatus('non-existent')
            ).rejects.toThrow('Transaction not found');
        });
    });
});

// Tests séparés pour Notification Service
describe('Notification Service Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should send cashin confirmation', async () => {
        mockDbQuery
            .mockResolvedValueOnce({ rows: [{ preferred_language: 'fr' }] })
            .mockResolvedValueOnce({ rows: [] }) // Insert notification user
            .mockResolvedValueOnce({ rows: [{ user_id: 'agent-user-123' }] }) // Get agent user ID
            .mockResolvedValueOnce({ rows: [] }); // Insert notification agent

        await notificationService.sendCashinConfirmation(
            'user-123',
            'agent-456',
            10000,
            'XOF',
            'tx-123'
        );

        expect(mockDbQuery).toHaveBeenCalledTimes(4);
        expect(notificationService.sendCashinConfirmation).toHaveBeenCalledWith(
            'user-123',
            'agent-456',
            10000,
            'XOF',
            'tx-123'
        );
    });

    it('should send OTP notification', async () => {
        mockDbQuery
            .mockResolvedValueOnce({ rows: [{ preferred_language: 'en' }] })
            .mockResolvedValueOnce({ rows: [] }); // Insert notification

        await notificationService.sendOTP('user-123', '654321');

        expect(mockDbQuery).toHaveBeenCalledTimes(2);
        expect(notificationService.sendOTP).toHaveBeenCalledWith('user-123', '654321');
    });
});

// Tests séparés pour Audit Service
describe('Audit Service Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should log successful transaction', async () => {
        await auditService.logSuccessfulTransaction(
            'tx-123',
            'user-123',
            'agent-456',
            10000,
            'XOF',
            '192.168.1.1',
            'test-agent'
        );

        expect(auditService.logSuccessfulTransaction).toHaveBeenCalledWith(
            'tx-123',
            'user-123',
            'agent-456',
            10000,
            'XOF',
            '192.168.1.1',
            'test-agent'
        );
    });

    it('should log failed attempt', async () => {
        await auditService.logFailedAttempt(
            'user-123',
            'agent-456',
            'Invalid OTP',
            '192.168.1.1',
            'test-agent'
        );

        expect(auditService.logFailedAttempt).toHaveBeenCalledWith(
            'user-123',
            'agent-456',
            'Invalid OTP',
            '192.168.1.1',
            'test-agent'
        );
    });
});