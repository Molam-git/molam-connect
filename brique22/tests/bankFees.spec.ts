// tests/bankFees.spec.ts
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { selectBestRoute, execute } from '../src/services/bankInteropService';
import { QuoteRequest, ExecuteRequest } from '../src/contracts/banks.dto';

// Définir les types pour les mocks
type MockQueryFunction = jest.MockedFunction<(query: string, params?: any[]) => Promise<any>>;
type MockTxFunction = jest.MockedFunction<(callback: (tx: any) => Promise<any>) => Promise<any>>;

// Mock de la base de données avec typage correct
const mockDbAny = jest.fn() as MockQueryFunction;
const mockDbOne = jest.fn() as MockQueryFunction;
const mockDbNone = jest.fn() as MockQueryFunction;
const mockDbTx = jest.fn() as MockTxFunction;

const mockDb = {
    any: mockDbAny,
    one: mockDbOne,
    none: mockDbNone,
    tx: mockDbTx
};

jest.mock('../src/utils/db', () => ({
    db: mockDb
}));

// Mock des autres services
jest.mock('../src/utils/sira', () => ({
    siraScore: jest.fn()
}));

jest.mock('../src/utils/ledger', () => ({
    postLedger: jest.fn()
}));

jest.mock('../src/utils/audit', () => ({
    emitAudit: jest.fn()
}));

jest.mock('../src/utils/bus', () => ({
    publish: jest.fn()
}));

jest.mock('uuid', () => ({
    v4: jest.fn()
}));

// Import des mocks APRÈS les déclarations
const { siraScore } = require('../src/utils/sira');
const { postLedger } = require('../src/utils/ledger');
const { emitAudit } = require('../src/utils/audit');
const { publish } = require('../src/utils/bus');
const { v4 } = require('uuid');

describe('Bank Services Unit Tests', () => {
    let mockTx: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Configuration du mock de transaction
        mockTx = {
            one: jest.fn(),
            none: jest.fn()
        };

        mockDbTx.mockImplementation(async (callback: any) => {
            return await callback(mockTx);
        });

        // Configuration par défaut des mocks
        mockDbAny.mockResolvedValue([
            {
                route_id: 1,
                name: 'Test Bank',
                rail: 'SWIFT',
                currency: 'USD',
                fee_fixed_bank: 2.00,
                fee_percent_bank: 0.0100,
                fee_fixed_molam: 0.00,
                fee_percent_molam: 0.0090,
                sla_seconds: 86400,
                success_rate_30d: 98.50
            }
        ]);

        siraScore.mockReturnValue(0.85);
        v4.mockReturnValue('test-uuid-123');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('selectBestRoute', () => {
        it('should return best route for deposit', async () => {
            const quoteRequest: QuoteRequest = {
                direction: 'deposit',
                amount: 100,
                currency: 'USD',
                fromCountry: 'US',
                toCountry: 'SN'
            };

            const result = await selectBestRoute(quoteRequest);

            expect(result).toEqual({
                routeId: 1,
                bankName: 'Test Bank',
                rail: 'SWIFT',
                currency: 'USD',
                amount: 100,
                feeBankFixed: 2.00,
                feeBankPercent: 0.0100,
                feeMolamFixed: 0.00,
                feeMolamPercent: 0.0090,
                feeTotal: expect.any(Number),
                amountNet: expect.any(Number),
                etaSeconds: 86400,
                breakdown: {
                    bank: expect.any(Number),
                    molam: expect.any(Number)
                },
                policyNotes: ['Fees = bank + Molam', 'Emitter pays fees', '10% cheaper than market']
            });

            // Vérifier que les frais sont calculés correctement
            expect(result.feeTotal).toBeCloseTo(2.00 + (100 * 0.0100) + (100 * 0.0090), 2);
            expect(result.amountNet).toBeCloseTo(100 - result.feeTotal, 2);
        });

        it('should return best route for withdraw', async () => {
            const quoteRequest: QuoteRequest = {
                direction: 'withdraw',
                amount: 100,
                currency: 'USD',
                fromCountry: 'US',
                toCountry: 'SN'
            };

            const result = await selectBestRoute(quoteRequest);

            expect(result.amountNet).toBeCloseTo(100 + result.feeTotal, 2);
        });

        it('should throw error when no routes found', async () => {
            mockDbAny.mockResolvedValueOnce([]);

            const quoteRequest: QuoteRequest = {
                direction: 'deposit',
                amount: 100,
                currency: 'USD',
                fromCountry: 'US',
                toCountry: 'SN'
            };

            await expect(selectBestRoute(quoteRequest)).rejects.toThrow('NO_ROUTE');
        });
    });

    describe('execute', () => {
        it('should create bank transfer order for deposit', async () => {
            const mockQuote = {
                routeId: 1,
                bankName: 'Test Bank',
                rail: 'SWIFT',
                currency: 'USD',
                amount: 100,
                feeBankFixed: 2.00,
                feeBankPercent: 0.0100,
                feeMolamFixed: 0.00,
                feeMolamPercent: 0.0090,
                feeTotal: 3.90,
                amountNet: 96.10,
                etaSeconds: 86400,
                breakdown: { bank: 3.00, molam: 0.90 },
                policyNotes: ['Fees = bank + Molam', 'Emitter pays fees', '10% cheaper than market']
            };

            const executeRequest: ExecuteRequest = {
                quote: mockQuote,
                userId: 123,
                walletId: 456,
                beneficiary: {
                    name: 'John Doe',
                    iban: 'FR7630001007941234567890185'
                }
            };

            // Mock de la création d'ordre
            mockTx.one.mockResolvedValue({ id: 1 });
            mockTx.none.mockResolvedValue(null);

            const result = await execute(executeRequest);

            expect(result).toEqual({
                orderUuid: 'test-uuid-123',
                status: 'pending'
            });

            // Vérifier que l'ordre a été créé
            expect(mockTx.one).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO bank_transfer_orders'),
                expect.arrayContaining([
                    'test-uuid-123',
                    123,
                    456,
                    'deposit',
                    100,
                    'USD',
                    2.00,
                    0.0100,
                    0.00,
                    0.0090,
                    3.90,
                    96.10,
                    1
                ])
            );

            // Vérifier que le ledger a été posté
            expect(postLedger).toHaveBeenCalledWith(
                mockTx,
                expect.objectContaining({
                    walletId: 456,
                    currency: 'USD',
                    type: 'BANK_DEPOSIT_HOLD'
                })
            );

            // Vérifier que l'audit a été émis
            expect(emitAudit).toHaveBeenCalledWith(
                mockTx,
                expect.objectContaining({
                    actorUserId: 123,
                    action: 'BANK_INTEROP_EXECUTE'
                })
            );

            // Vérifier que l'événement a été publié
            expect(publish).toHaveBeenCalledWith(
                'bank.interop.execute',
                expect.objectContaining({
                    orderUuid: 'test-uuid-123',
                    direction: 'deposit'
                })
            );
        });

        it('should create bank transfer order for withdraw', async () => {
            const mockQuote = {
                routeId: 1,
                bankName: 'Test Bank',
                rail: 'SWIFT',
                currency: 'USD',
                amount: 100,
                feeBankFixed: 2.00,
                feeBankPercent: 0.0100,
                feeMolamFixed: 0.00,
                feeMolamPercent: 0.0090,
                feeTotal: 3.90,
                amountNet: 103.90, // Pour le withdraw, amountNet > amount
                etaSeconds: 86400,
                breakdown: { bank: 3.00, molam: 0.90 },
                policyNotes: ['Fees = bank + Molam', 'Emitter pays fees', '10% cheaper than market']
            };

            const executeRequest: ExecuteRequest = {
                quote: mockQuote,
                userId: 123,
                walletId: 456
            };

            mockTx.one.mockResolvedValue({ id: 1 });
            mockTx.none.mockResolvedValue(null);

            const result = await execute(executeRequest);

            expect(result.orderUuid).toBe('test-uuid-123');

            // Vérifier que le ledger a été débité pour le withdraw
            expect(postLedger).toHaveBeenCalledWith(
                mockTx,
                expect.objectContaining({
                    walletId: 456,
                    currency: 'USD',
                    amount: -(100 + 3.90), // Montant négatif pour le débit
                    type: 'BANK_WITHDRAW'
                })
            );
        });

        it('should throw error for invalid amount', async () => {
            const mockQuote = {
                routeId: 1,
                bankName: 'Test Bank',
                rail: 'SWIFT',
                currency: 'USD',
                amount: 0, // Montant invalide
                feeBankFixed: 0,
                feeBankPercent: 0,
                feeMolamFixed: 0,
                feeMolamPercent: 0,
                feeTotal: 0,
                amountNet: 0,
                etaSeconds: 86400,
                breakdown: { bank: 0, molam: 0 },
                policyNotes: []
            };

            const executeRequest: ExecuteRequest = {
                quote: mockQuote,
                userId: 123,
                walletId: 456
            };

            await expect(execute(executeRequest)).rejects.toThrow('INVALID_AMOUNT');
        });

        it('should throw error for negative net amount', async () => {
            const mockQuote = {
                routeId: 1,
                bankName: 'Test Bank',
                rail: 'SWIFT',
                currency: 'USD',
                amount: 100,
                feeBankFixed: 0,
                feeBankPercent: 0,
                feeMolamFixed: 0,
                feeMolamPercent: 0,
                feeTotal: 150, // Frais plus élevés que le montant
                amountNet: -50, // Montant net négatif
                etaSeconds: 86400,
                breakdown: { bank: 100, molam: 50 },
                policyNotes: []
            };

            const executeRequest: ExecuteRequest = {
                quote: mockQuote,
                userId: 123,
                walletId: 456
            };

            await expect(execute(executeRequest)).rejects.toThrow('NEGATIVE_NET');
        });
    });
});