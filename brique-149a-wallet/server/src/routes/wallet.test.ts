/**
 * Wallet Routes Integration Tests
 * Tests wallet API endpoints with mocked authentication
 */
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import walletRouter from './wallet';
import { pool, withTransaction } from '../utils/db';
import { generateQrToken, verifyQrToken, markQrTokenUsed } from '../services/qrService';
import { publishLedgerEvent } from '../utils/ledgerPublisher';

// Mock dependencies
jest.mock('../utils/db');
jest.mock('../services/qrService');
jest.mock('../utils/ledgerPublisher');
jest.mock('../utils/molamIdAuth', () => ({
  molamIdAuth: (req: any, res: any, next: any) => {
    req.user = {
      id: 'test-user-123',
      roles: ['customer'],
      country: 'SN',
      currency: 'XOF',
      locale: 'fr'
    };
    next();
  }
}));

const app = express();
app.use(bodyParser.json());
app.use('/api/wallet', walletRouter);

describe('Wallet Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/wallet/home', () => {
    it('should return wallet data successfully', async () => {
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({
          // Wallet query
          rows: [{
            balance: '5000.00',
            currency: 'XOF',
            status: 'active'
          }]
        })
        .mockResolvedValueOnce({
          // History query
          rows: [
            {
              id: 'tx-1',
              label: 'Test Transaction',
              amount: '-100.00',
              currency: 'XOF',
              type: 'debit',
              category: 'transfer',
              created_at: new Date()
            }
          ]
        });

      (pool.query as jest.Mock) = mockQuery;

      const response = await request(app)
        .get('/api/wallet/home')
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe('test-user-123');
      expect(response.body).toHaveProperty('balance');
      expect(response.body.balance.balance).toBe(5000);
      expect(response.body).toHaveProperty('actions');
      expect(response.body.actions.length).toBeGreaterThan(0);
      expect(response.body).toHaveProperty('history');
      expect(response.body.history.length).toBe(1);
    });

    it('should handle database errors', async () => {
      const mockQuery = jest.fn().mockRejectedValue(new Error('DB Error'));
      (pool.query as jest.Mock) = mockQuery;

      const response = await request(app)
        .get('/api/wallet/home')
        .expect(500);

      expect(response.body.error).toBe('internal_error');
    });
  });

  describe('POST /api/wallet/qr/generate', () => {
    it('should generate QR token successfully', async () => {
      const mockToken = {
        token: 'test-qr-token-123',
        expiresAt: new Date(Date.now() + 900000)
      };

      (generateQrToken as jest.Mock).mockResolvedValue(mockToken);
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
      (publishLedgerEvent as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/wallet/qr/generate')
        .send({
          purpose: 'receive',
          amount: 1000,
          expiryMinutes: 15
        })
        .expect(200);

      expect(response.body.token).toBe('test-qr-token-123');
      expect(response.body).toHaveProperty('qr_url');
      expect(response.body).toHaveProperty('deep_link');
      expect(response.body.qr_url).toContain('molam://pay/');

      expect(generateQrToken).toHaveBeenCalledWith(
        'test-user-123',
        'receive',
        'XOF',
        1000,
        15
      );

      expect(publishLedgerEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'wallet.qr.generated',
          userId: 'test-user-123'
        })
      );
    });

    it('should reject invalid input', async () => {
      const response = await request(app)
        .post('/api/wallet/qr/generate')
        .send({
          purpose: 'invalid-purpose',
          amount: -100
        })
        .expect(400);

      expect(response.body.error).toBe('invalid_input');
    });

    it('should use default values', async () => {
      const mockToken = {
        token: 'test-qr-token-123',
        expiresAt: new Date(Date.now() + 900000)
      };

      (generateQrToken as jest.Mock).mockResolvedValue(mockToken);
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
      (publishLedgerEvent as jest.Mock).mockResolvedValue(undefined);

      await request(app)
        .post('/api/wallet/qr/generate')
        .send({})
        .expect(200);

      expect(generateQrToken).toHaveBeenCalledWith(
        'test-user-123',
        'receive',
        'XOF',
        undefined,
        15
      );
    });
  });

  describe('POST /api/wallet/qr/scan', () => {
    it('should process QR payment successfully', async () => {
      const mockQrToken = {
        token: 'test-qr-token-123',
        userId: 'recipient-user-456',
        purpose: 'receive' as const,
        amount: 1000,
        currency: 'XOF',
        expiresAt: new Date(Date.now() + 60000)
      };

      (verifyQrToken as jest.Mock).mockResolvedValue(mockQrToken);
      (markQrTokenUsed as jest.Mock).mockResolvedValue(true);
      (publishLedgerEvent as jest.Mock).mockResolvedValue(undefined);

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] })
      };

      (withTransaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockClient);
      });

      const response = await request(app)
        .post('/api/wallet/qr/scan')
        .send({
          token: 'test-qr-token-123',
          amount: 1000
        })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.message).toContain('successfully');

      expect(verifyQrToken).toHaveBeenCalledWith('test-qr-token-123');
      expect(markQrTokenUsed).toHaveBeenCalledWith('test-qr-token-123', 'test-user-123');

      expect(publishLedgerEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment_intent_from_qr',
          userId: 'test-user-123'
        })
      );
    });

    it('should prevent self-payment', async () => {
      const mockQrToken = {
        token: 'test-qr-token-123',
        userId: 'test-user-123', // Same as payer
        purpose: 'receive' as const,
        amount: 1000,
        currency: 'XOF',
        expiresAt: new Date(Date.now() + 60000)
      };

      (verifyQrToken as jest.Mock).mockResolvedValue(mockQrToken);

      (withTransaction as jest.Mock).mockImplementation(async (callback) => {
        const mockClient = { query: jest.fn() };
        try {
          return await callback(mockClient);
        } catch (error) {
          throw error;
        }
      });

      const response = await request(app)
        .post('/api/wallet/qr/scan')
        .send({
          token: 'test-qr-token-123'
        })
        .expect(500);

      expect(response.body.error).toBe('qr_scan_failed');
      expect(response.body.message).toContain('cannot_pay_yourself');
    });

    it('should handle already used token', async () => {
      const mockQrToken = {
        token: 'test-qr-token-123',
        userId: 'recipient-user-456',
        purpose: 'receive' as const,
        amount: 1000,
        currency: 'XOF',
        expiresAt: new Date(Date.now() + 60000)
      };

      (verifyQrToken as jest.Mock).mockResolvedValue(mockQrToken);
      (markQrTokenUsed as jest.Mock).mockResolvedValue(false); // Already used

      (withTransaction as jest.Mock).mockImplementation(async (callback) => {
        const mockClient = { query: jest.fn() };
        try {
          return await callback(mockClient);
        } catch (error) {
          throw error;
        }
      });

      const response = await request(app)
        .post('/api/wallet/qr/scan')
        .send({
          token: 'test-qr-token-123'
        })
        .expect(409);

      expect(response.body.error).toBe('qr_scan_failed');
    });
  });

  describe('POST /api/wallet/action', () => {
    it('should log wallet action successfully', async () => {
      const mockQuery = jest.fn().mockResolvedValue({
        rows: [{
          id: 'log-123',
          action_type: 'transfer',
          status: 'pending',
          created_at: new Date()
        }]
      });

      (pool.query as jest.Mock) = mockQuery;
      (publishLedgerEvent as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/wallet/action')
        .send({
          action: 'transfer',
          payload: { amount: 1000, recipient: 'user-456' }
        })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.log.id).toBe('log-123');
      expect(response.body.log.action).toBe('transfer');

      expect(publishLedgerEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'wallet_action_requested',
          userId: 'test-user-123'
        })
      );
    });

    it('should handle idempotency', async () => {
      const existingLog = {
        id: 'log-123',
        action_type: 'transfer',
        status: 'completed',
        created_at: new Date()
      };

      const mockQuery = jest.fn().mockResolvedValue({
        rows: [existingLog]
      });

      (pool.query as jest.Mock) = mockQuery;

      const response = await request(app)
        .post('/api/wallet/action')
        .set('idempotency-key', 'idempotency-123')
        .send({
          action: 'transfer',
          payload: { amount: 1000 }
        })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.idempotent).toBe(true);
      expect(response.body.log).toEqual(existingLog);

      // Should only query for existing, not insert new
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/wallet/balance', () => {
    it('should return current balance', async () => {
      const mockQuery = jest.fn().mockResolvedValue({
        rows: [{
          balance: '7500.50',
          currency: 'XOF',
          status: 'active'
        }]
      });

      (pool.query as jest.Mock) = mockQuery;

      const response = await request(app)
        .get('/api/wallet/balance')
        .expect(200);

      expect(response.body.balance).toBe(7500.50);
      expect(response.body.currency).toBe('XOF');
      expect(response.body.status).toBe('active');
    });

    it('should handle non-existent wallet', async () => {
      const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
      (pool.query as jest.Mock) = mockQuery;

      const response = await request(app)
        .get('/api/wallet/balance')
        .expect(200);

      expect(response.body.balance).toBe(0);
      expect(response.body.currency).toBe('XOF');
      expect(response.body.status).toBe('not_created');
    });
  });
});
