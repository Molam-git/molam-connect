import { Pool } from 'pg';
import {
  createDispute,
  submitEvidence,
  resolveDispute,
  getDisputeById,
  listDisputesByMerchant,
  getDisputeStats,
} from '../src/disputes/engine';

// Mock the database pool
jest.mock('../src/utils/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require('../src/utils/db');

describe('Disputes Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createDispute', () => {
    it('should create a new dispute with bank fee for chargebacks', async () => {
      const mockDispute = {
        id: 'dispute-1',
        connect_tx_id: 'tx-123',
        merchant_id: 'merchant-456',
        amount: 10000,
        currency: 'USD',
        reason: 'fraud',
        dispute_type: 'chargeback',
        status: 'open',
        respond_by: new Date('2025-02-01'),
        created_at: new Date(),
      };

      pool.query
        .mockResolvedValueOnce({ rows: [mockDispute], rowCount: 1 }) // Insert dispute
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert bank fee

      const result = await createDispute({
        connectTxId: 'tx-123',
        merchantId: 'merchant-456',
        amount: 10000,
        currency: 'USD',
        reason: 'fraud',
        disputeType: 'chargeback',
      });

      expect(result.id).toBe('dispute-1');
      expect(pool.query).toHaveBeenCalledTimes(2); // Once for dispute, once for bank fee
    });

    it('should not create bank fee for inquiries', async () => {
      const mockDispute = {
        id: 'dispute-2',
        connect_tx_id: 'tx-456',
        merchant_id: 'merchant-456',
        amount: 5000,
        currency: 'USD',
        reason: 'clarification',
        dispute_type: 'inquiry',
        status: 'open',
        created_at: new Date(),
      };

      pool.query.mockResolvedValueOnce({ rows: [mockDispute], rowCount: 1 });

      const result = await createDispute({
        connectTxId: 'tx-456',
        merchantId: 'merchant-456',
        amount: 5000,
        currency: 'USD',
        reason: 'clarification',
        disputeType: 'inquiry',
      });

      expect(result.id).toBe('dispute-2');
      expect(pool.query).toHaveBeenCalledTimes(1); // Only dispute insert, no fee
    });
  });

  describe('submitEvidence', () => {
    it('should submit evidence and update status', async () => {
      const mockUpdatedDispute = {
        id: 'dispute-1',
        status: 'evidence_submitted',
      };

      pool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert evidence
        .mockResolvedValueOnce({ rows: [mockUpdatedDispute], rowCount: 1 }); // Update dispute status

      const result = await submitEvidence('dispute-1', 'merchant-user', {
        tracking_number: 'TRACK123',
        delivery_date: '2025-01-05',
      });

      expect(result.status).toBe('evidence_submitted');
      expect(pool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveDispute', () => {
    it('should resolve dispute as won and waive bank fee', async () => {
      const mockResolvedDispute = {
        id: 'dispute-1',
        status: 'won',
        outcome: 'won',
        resolved_at: new Date(),
      };

      pool.query
        .mockResolvedValueOnce({ rows: [mockResolvedDispute], rowCount: 1 }) // Update dispute
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Waive bank fee

      const result = await resolveDispute('dispute-1', 'admin', 'won', 'Customer provided proof');

      expect(result.status).toBe('won');
      expect(result.outcome).toBe('won');
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('should resolve dispute as lost and charge fees', async () => {
      const mockResolvedDispute = {
        id: 'dispute-1',
        amount: 10000,
        currency: 'USD',
        status: 'lost',
        outcome: 'lost',
        resolved_at: new Date(),
      };

      pool.query
        .mockResolvedValueOnce({ rows: [mockResolvedDispute], rowCount: 1 }) // Update dispute
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Charge bank fee
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Insert chargeback loss

      const result = await resolveDispute('dispute-1', 'admin', 'lost', 'Insufficient evidence');

      expect(result.status).toBe('lost');
      expect(result.outcome).toBe('lost');
      expect(pool.query).toHaveBeenCalledTimes(3); // Update status + charge bank fee + add chargeback loss
    });
  });

  describe('getDisputeById', () => {
    it('should return dispute by ID', async () => {
      const mockDispute = {
        id: 'dispute-1',
        connect_tx_id: 'tx-123',
        status: 'open',
      };

      pool.query.mockResolvedValueOnce({ rows: [mockDispute], rowCount: 1 });

      const result = await getDisputeById('dispute-1');

      expect(result?.id).toBe('dispute-1');
      expect(result?.connect_tx_id).toBe('tx-123');
    });

    it('should return null if dispute not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getDisputeById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listDisputesByMerchant', () => {
    it('should list all disputes for merchant', async () => {
      const mockDisputes = [
        { id: 'dispute-1', status: 'open' },
        { id: 'dispute-2', status: 'won' },
      ];

      pool.query.mockResolvedValueOnce({ rows: mockDisputes, rowCount: 2 });

      const result = await listDisputesByMerchant('merchant-456', {});

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('dispute-1');
    });

    it('should filter disputes by status', async () => {
      const mockDisputes = [{ id: 'dispute-1', status: 'open' }];

      pool.query.mockResolvedValueOnce({ rows: mockDisputes, rowCount: 1 });

      const result = await listDisputesByMerchant('merchant-456', { status: 'open' });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('open');
    });
  });

  describe('getDisputeStats', () => {
    it('should calculate dispute statistics with win rate', async () => {
      const mockStats = {
        total_disputes: 10,
        open: 3,
        won: 4,
        lost: 3,
        win_rate: 57.14,
        total_fees: 315.00,
      };

      pool.query.mockResolvedValueOnce({ rows: [mockStats], rowCount: 1 });

      const result = await getDisputeStats('merchant-456');

      expect(result.total_disputes).toBe(10);
      expect(result.win_rate).toBe(57.14);
      expect(result.won).toBe(4);
      expect(result.lost).toBe(3);
    });

    it('should handle merchant with no disputes', async () => {
      const mockStats = {
        total_disputes: 0,
        open: 0,
        won: 0,
        lost: 0,
        win_rate: 0,
        total_fees: 0,
      };

      pool.query.mockResolvedValueOnce({ rows: [mockStats], rowCount: 1 });

      const result = await getDisputeStats('merchant-new');

      expect(result.total_disputes).toBe(0);
      expect(result.win_rate).toBe(0);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete dispute lifecycle', async () => {
      // Create dispute
      const mockDispute = {
        id: 'dispute-lifecycle',
        connect_tx_id: 'tx-lifecycle',
        merchant_id: 'merchant-456',
        amount: 10000,
        currency: 'USD',
        reason: 'fraud',
        dispute_type: 'chargeback',
        status: 'open',
        created_at: new Date(),
      };

      pool.query
        .mockResolvedValueOnce({ rows: [mockDispute], rowCount: 1 }) // Create dispute
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Create bank fee

      const dispute = await createDispute({
        connectTxId: 'tx-lifecycle',
        merchantId: 'merchant-456',
        amount: 10000,
        currency: 'USD',
        reason: 'fraud',
        disputeType: 'chargeback',
      });

      expect(dispute.status).toBe('open');

      // Submit evidence
      pool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert evidence
        .mockResolvedValueOnce({
          rows: [{ ...mockDispute, status: 'evidence_submitted' }],
          rowCount: 1,
        }); // Update status

      const withEvidence = await submitEvidence('dispute-lifecycle', 'merchant-user', {
        tracking: 'TRACK123',
      });

      expect(withEvidence.status).toBe('evidence_submitted');

      // Resolve as won
      pool.query
        .mockResolvedValueOnce({
          rows: [{ ...mockDispute, status: 'won', outcome: 'won' }],
          rowCount: 1,
        }) // Resolve
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Waive fee

      const resolved = await resolveDispute(
        'dispute-lifecycle',
        'admin',
        'won',
        'Valid tracking provided'
      );

      expect(resolved.status).toBe('won');
      expect(resolved.outcome).toBe('won');
    });
  });
});