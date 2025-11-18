// End-to-end test: Full reconciliation workflow
import { pool } from '../../src/utils/db';
import { parseMT940 } from '../../src/parsers/mt940';
import { matchLine } from '../../src/services/matcher';

describe('E2E: Full Reconciliation Workflow', () => {
  beforeAll(async () => {
    // Setup: Clean database
    await pool.query('TRUNCATE reconciliation_matches, reconciliation_queue, bank_statement_lines, bank_statements_raw CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should complete full workflow: upload -> parse -> match -> settle', async () => {
    // Step 1: Create a payout that will be reconciled
    const { rows: [payout] } = await pool.query(
      `INSERT INTO payouts (
        reference_code, provider_ref, amount, currency, status, created_at, updated_at
      ) VALUES (
        'PO_E2E_001', 'tr_e2e_test_001', 2500.00, 'EUR', 'sent', now(), now()
      ) RETURNING id, reference_code, amount`
    );

    console.log('Created payout:', payout);

    // Step 2: Simulate MT940 file upload
    const mt940Content = `
:20:E2E_STATEMENT
:25:DE89370400440532013000
:28C:00001/001
:60F:C231101EUR10000,00
:61:2311151115C2500,00NTRFNONREF//${payout.reference_code}
:86:Payout settlement
:62F:C231115EUR12500,00
`;

    const { rows: [rawStatement] } = await pool.query(
      `INSERT INTO bank_statements_raw (
        bank_profile_id, external_file_id, file_s3_key, file_type, status
      ) VALUES (
        '00000000-0000-0000-0000-000000000001',
        'e2e_test_001',
        's3://test/e2e_statement.mt940',
        'mt940',
        'uploaded'
      ) RETURNING id`
    );

    console.log('Created raw statement:', rawStatement.id);

    // Step 3: Parse MT940
    const parsedLines = parseMT940(mt940Content);

    expect(parsedLines).toHaveLength(1);
    expect(parsedLines[0].reference).toBe(payout.reference_code);

    // Step 4: Insert parsed line into database
    const { rows: [line] } = await pool.query(
      `INSERT INTO bank_statement_lines (
        raw_statement_id, bank_profile_id, statement_date, value_date,
        amount, currency, description, reference, transaction_type,
        reconciliation_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'unmatched')
      RETURNING id`,
      [
        rawStatement.id,
        '00000000-0000-0000-0000-000000000001',
        parsedLines[0].statement_date,
        parsedLines[0].value_date,
        parsedLines[0].amount,
        parsedLines[0].currency,
        parsedLines[0].description,
        parsedLines[0].reference,
        parsedLines[0].transaction_type,
      ]
    );

    console.log('Created statement line:', line.id);

    // Step 5: Run matching engine
    const matchResult = await matchLine(line.id, '00000000-0000-0000-0000-000000000001');

    console.log('Match result:', matchResult);

    expect(matchResult.matched).toBe(true);

    // Step 6: Verify reconciliation match created
    const { rows: matches } = await pool.query(
      `SELECT * FROM reconciliation_matches WHERE bank_statement_line_id = $1`,
      [line.id]
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].matched_entity_id).toBe(payout.id);
    expect(matches[0].match_rule).toBe('exact_ref');

    // Step 7: Verify line marked as matched
    const { rows: [updatedLine] } = await pool.query(
      `SELECT reconciliation_status, matched_at FROM bank_statement_lines WHERE id = $1`,
      [line.id]
    );

    expect(updatedLine.reconciliation_status).toBe('matched');
    expect(updatedLine.matched_at).toBeTruthy();

    // Step 8: Verify payout marked as settled
    const { rows: [settledPayout] } = await pool.query(
      `SELECT status, settled_at FROM payouts WHERE id = $1`,
      [payout.id]
    );

    expect(settledPayout.status).toBe('settled');
    expect(settledPayout.settled_at).toBeTruthy();

    // Step 9: Verify audit log created
    const { rows: logs } = await pool.query(
      `SELECT * FROM reconciliation_logs
       WHERE action = 'auto_matched'
       AND details->>'line_id' = $1`,
      [line.id]
    );

    expect(logs.length).toBeGreaterThan(0);

    console.log('✅ E2E test completed successfully!');
  });

  it('should handle unmatched line workflow', async () => {
    // Create line with no matching payout
    const { rows: [line] } = await pool.query(
      `INSERT INTO bank_statement_lines (
        bank_profile_id, statement_date, value_date, amount, currency,
        description, transaction_type, reconciliation_status
      ) VALUES (
        '00000000-0000-0000-0000-000000000001',
        '2023-11-20', '2023-11-20', 9999.99, 'EUR',
        'Mystery payment', 'credit', 'unmatched'
      ) RETURNING id`
    );

    // Try to match
    const matchResult = await matchLine(line.id, '00000000-0000-0000-0000-000000000001');

    expect(matchResult.matched).toBe(false);
    expect(matchResult.reason).toBeTruthy();

    // Should be queued for manual review
    const { enqueueReconciliation } = await import('../../src/services/reconciliation-queue');
    await enqueueReconciliation(line.id, '00000000-0000-0000-0000-000000000001');

    const { rows: queue } = await pool.query(
      `SELECT * FROM reconciliation_queue WHERE bank_statement_line_id = $1`,
      [line.id]
    );

    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe('open');

    console.log('✅ Unmatched flow test completed!');
  });
});
