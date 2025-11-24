// tests/unit/transferService.test.ts
import { TransferService } from '../../src/services/transferService';
import { db } from '../../src/utils/db';

jest.mock('../../src/utils/db');

describe('TransferService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createTransfer', () => {
        it('should create a transfer successfully', async () => {
            const mockRequest = {
                sender_wallet_id: 'wallet-1',
                receiver_wallet_id: 'wallet-2',
                currency: 'XAF',
                amount: 1000
            };

            // Mock database responses
            (db.one as jest.Mock).mockResolvedValueOnce({
                id: 'wallet-1',
                user_id: 'user-1',
                currency: 'XAF',
                balance: 5000,
                country_code: 'CM'
            });

            (db.one as jest.Mock).mockResolvedValueOnce({
                id: 'wallet-2',
                user_id: 'user-2',
                currency: 'XAF'
            });

            (db.one as jest.Mock).mockResolvedValueOnce({
                kyc_level: 'P1'
            });

            (db.oneOrNone as jest.Mock).mockResolvedValueOnce({
                per_tx_max: 5000,
                daily_max: 10000
            });

            (db.tx as jest.Mock).mockImplementation((callback) => {
                return callback({
                    query: jest.fn().mockResolvedValue({ rows: [{}] })
                });
            });

            const transfer = await TransferService.createTransfer(
                mockRequest,
                'user-1',
                'idemp-key-123',
                'app'
            );

            expect(transfer).toBeDefined();
        });
    });
});