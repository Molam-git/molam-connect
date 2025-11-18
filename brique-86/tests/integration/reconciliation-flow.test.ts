// Integration tests for full reconciliation flow
import { pool } from '../../src/utils/db';
import { matchLine } from '../../src/services/matcher';
import { enqueueReconciliation } from '../../src/services/reconciliation-queue';

describe('Reconciliation Flow Integration', () => {
  beforeEach(async () => {
    // Clean test data
    await pool.query('DELETE FROM reconciliation_matches');
    await pool.query('DELETE FROM reconciliation_queue');
    await pool.query('DELETE FROM bank_statement_lines');
    await pool.query('DELETE FROM payouts WHERE reference_code LIKE \'TEST_%\'');
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Exact Reference Match', () => {
    it('should match by exact reference code', async () => {
      // Create a payout
      const { rows: [payout] } = await pool.query(
        `INSERT INTO payouts (reference_code, amount, currency, status, created_at)
         VALUES ('TEST_PO_123', 1000.00, 'EUR', 'sent', now())
         RETURNING id`
      );

      // Create matching statement line
      const { rows: [line] } = await pool.query(
        `INSERT INTO bank_statement_lines (
          bank_profile_id, statement_date, value_date, amount, currency,
          description, reference, transaction_type, reconciliation_status
        ) VALUES (
          '00000000-0000-0000-0000-000000000001',
          '2023-11-15', '2023-11-15', 1000.00, 'EUR',
          'Payment TEST_PO_123', 'TEST_PO_123', 'credit', 'unmatched'
        ) RETURNING id`
      );

      // Attempt match
      const result = await matchLine(line.id, '00000000-0000-0000-0000-000000000001');

      expect(result.matched).toBe(true);

      // Verify match created
      const { rows: matches } = await pool.query(
        'SELECT * FROM reconciliation_matches WHERE bank_statement_line_id = $1',
        [line.id]
      );

      expect(matches).toHaveLength(1);
      expect(matches[0].matched_entity_id).toBe(payout.id);
      expect(matches[0].match_rule).toBe('exact_ref');
      expect(matches[0].match_score).toBe('1.0000');

      // Verify payout status updated
      const { rows: [updatedPayout] } = await pool.query(
        'SELECT status FROM payouts WHERE id = $1',
        [payout.id]
      );

      expect(updatedPayout.status).toBe('settled');
    });
  });

  describe('Fuzzy Amount/Date Match', () => {
    it('should match by amount and date within tolerance', async () => {
      // Create payout
      const { rows: [payout] } = await pool.query(
        `INSERT INTO payouts (reference_code, amount, currency, status, created_at)
         VALUES ('TEST_PO_456', 999.50, 'EUR', 'sent', '2023-11-14 10:00:00')
         RETURNING id`
      );

      // Create line with slightly different amount (bank fee)
      const { rows: [line] } = await pool.query(
        `INSERT INTO bank_statement_lines (
          bank_profile_id, statement_date, value_date, amount, currency,
          description, transaction_type, reconciliation_status
        ) VALUES (
          '00000000-0000-0000-0000-000000000001',
          '2023-11-15', '2023-11-15', 998.00, 'EUR',
          'Bank transfer', 'credit', 'unmatched'
        ) RETURNING id`
      );

      const result = await matchLine(line.id, '00000000-0000-0000-0000-000000000001');

      expect(result.matched).toBe(true);

      const { rows: matches } = await pool.query(
        'SELECT * FROM reconciliation_matches WHERE bank_statement_line_id = $1',
        [line.id]
      );

      expect(matches).toHaveLength(1);
      expect(matches[0].match_rule).toContain('fuzzy');
    });

    it('should queue for manual review when multiple candidates exist', async () => {
      // Create multiple payouts with same amount
      await pool.query(
        `INSERT INTO payouts (reference_code, amount, currency, status, created_at)
         VALUES
           ('TEST_PO_701', 500.00, 'EUR', 'sent', '2023-11-14'),
           ('TEST_PO_702', 500.00, 'EUR', 'sent', '2023-11-14'),
           ('TEST_PO_703', 500.00, 'EUR', 'sent', '2023-11-14')`
      );

      // Create line
      const { rows: [line] } = await pool.query(
        `INSERT INTO bank_statement_lines (
          bank_profile_id, statement_date, value_date, amount, currency,
          description, transaction_type, reconciliation_status
        ) VALUES (
          '00000000-0000-0000-0000-000000000001',
          '2023-11-15', '2023-11-15', 500.00, 'EUR',
          'Payment', 'credit', 'unmatched'
        ) RETURNING id`
      );

      await enqueueReconciliation(line.id, '00000000-0000-0000-0000-000000000001');

      // Verify queued for manual review
      const { rows: queue } = await pool.query(
        'SELECT * FROM reconciliation_queue WHERE bank_statement_line_id = $1',
        [line.id]
      );

      expect(queue).toHaveLength(1);
      expect(queue[0].reason).toBe('multiple_candidates');
    });
  });

  describe('No Match Scenario', () => {
    it('should queue line when no match found', async () => {
      const { rows: [line] } = await pool.query(
        `INSERT INTO bank_statement_lines (
          bank_profile_id, statement_date, value_date, amount, currency,
          description, transaction_type, reconciliation_status
        ) VALUES (
          '00000000-0000-0000-0000-000000000001',
          '2023-11-15', '2023-11-15', 12345.67, 'EUR',
          'Unknown payment', 'credit', 'unmatched'
        ) RETURNING id`
      );

      const result = await matchLine(line.id, '00000000-0000-0000-0000-000000000001');

      expect(result.matched).toBe(false);
      expect(result.reason).toBeTruthy();

      await enqueueReconciliation(line.id, '00000000-0000-0000-0000-000000000001');

      const { rows: queue } = await pool.query(
        'SELECT * FROM reconciliation_queue WHERE bank_statement_line_id = $1',
        [line.id]
      );

      expect(queue).toHaveLength(1);
    });
  });
});
