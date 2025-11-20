/**
 * QR Service Unit Tests
 * Tests QR token generation, verification, and usage
 */
import { generateQrToken, verifyQrToken, markQrTokenUsed } from './qrService';
import { pool } from '../utils/db';

// Mock the database pool
jest.mock('../utils/db');

describe('QR Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateQrToken', () => {
    it('should generate a valid QR token', async () => {
      const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
      (pool.query as jest.Mock) = mockQuery;

      const result = await generateQrToken(
        'user-123',
        'receive',
        'XOF',
        1000,
        15
      );

      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(0);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO wallet_qr_tokens'),
        expect.arrayContaining([
          expect.any(String), // token
          'user-123',
          'receive',
          1000,
          'XOF',
          expect.any(Date),
          expect.any(Object)
        ])
      );
    });

    it('should generate token without amount', async () => {
      const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
      (pool.query as jest.Mock) = mockQuery;

      const result = await generateQrToken(
        'user-123',
        'receive',
        'XOF'
      );

      expect(result.token).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.any(String),
          'user-123',
          'receive',
          null, // amount should be null
          'XOF',
          expect.any(Date),
          expect.any(Object)
        ])
      );
    });

    it('should handle database errors', async () => {
      const mockQuery = jest.fn().mockRejectedValue(new Error('DB Error'));
      (pool.query as jest.Mock) = mockQuery;

      await expect(
        generateQrToken('user-123', 'receive', 'XOF')
      ).rejects.toThrow('Failed to generate QR token');
    });
  });

  describe('verifyQrToken', () => {
    it('should verify a valid token', async () => {
      const mockToken = {
        token: 'test-token-123',
        user_id: 'user-123',
        purpose: 'receive',
        amount: 1000,
        currency: 'XOF',
        expires_at: new Date(Date.now() + 60000), // 1 minute from now
        used_at: null,
        used_by: null
      };

      const mockQuery = jest.fn().mockResolvedValue({ rows: [mockToken] });
      (pool.query as jest.Mock) = mockQuery;

      const result = await verifyQrToken('test-token-123');

      expect(result.token).toBe('test-token-123');
      expect(result.userId).toBe('user-123');
      expect(result.purpose).toBe('receive');
      expect(result.amount).toBe(1000);
      expect(result.currency).toBe('XOF');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent token', async () => {
      const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
      (pool.query as jest.Mock) = mockQuery;

      await expect(
        verifyQrToken('non-existent-token')
      ).rejects.toThrow('token_not_found');
    });

    it('should throw error for already used token', async () => {
      const mockToken = {
        token: 'test-token-123',
        user_id: 'user-123',
        purpose: 'receive',
        amount: 1000,
        currency: 'XOF',
        expires_at: new Date(Date.now() + 60000),
        used_at: new Date(),
        used_by: 'user-456'
      };

      const mockQuery = jest.fn().mockResolvedValue({ rows: [mockToken] });
      (pool.query as jest.Mock) = mockQuery;

      await expect(
        verifyQrToken('test-token-123')
      ).rejects.toThrow('token_already_used');
    });

    it('should throw error for expired token', async () => {
      const mockToken = {
        token: 'test-token-123',
        user_id: 'user-123',
        purpose: 'receive',
        amount: 1000,
        currency: 'XOF',
        expires_at: new Date(Date.now() - 60000), // 1 minute ago
        used_at: null,
        used_by: null
      };

      const mockQuery = jest.fn().mockResolvedValue({ rows: [mockToken] });
      (pool.query as jest.Mock) = mockQuery;

      await expect(
        verifyQrToken('test-token-123')
      ).rejects.toThrow('token_expired');
    });
  });

  describe('markQrTokenUsed', () => {
    it('should mark token as used successfully', async () => {
      const mockQuery = jest.fn().mockResolvedValue({
        rows: [{ token: 'test-token-123', used_at: new Date() }]
      });
      (pool.query as jest.Mock) = mockQuery;

      const result = await markQrTokenUsed('test-token-123', 'user-456');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wallet_qr_tokens'),
        ['test-token-123', 'user-456']
      );
    });

    it('should return false for already used token', async () => {
      const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
      (pool.query as jest.Mock) = mockQuery;

      const result = await markQrTokenUsed('test-token-123', 'user-456');

      expect(result).toBe(false);
    });

    it('should return false for expired token', async () => {
      const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
      (pool.query as jest.Mock) = mockQuery;

      const result = await markQrTokenUsed('test-token-123', 'user-456');

      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      const mockQuery = jest.fn().mockRejectedValue(new Error('DB Error'));
      (pool.query as jest.Mock) = mockQuery;

      const result = await markQrTokenUsed('test-token-123', 'user-456');

      expect(result).toBe(false);
    });
  });
});
