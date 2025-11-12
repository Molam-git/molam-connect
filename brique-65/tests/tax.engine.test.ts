import { computeAndPersistTax } from '../src/tax/engine';
import { pool } from '../src/utils/db';

describe('Tax Engine', () => {
  beforeAll(async () => {
    // Setup test data
    await pool.query(
      `INSERT INTO tax_jurisdictions(id, code, name, country_codes, default, currency)
       VALUES('00000000-0000-0000-0000-000000000001', 'SN', 'Senegal', ARRAY['SN'], true, 'XOF')
       ON CONFLICT (code) DO NOTHING`
    );

    await pool.query(
      `INSERT INTO tax_rules(
        id, jurisdiction_id, code, description, applies_to,
        is_percentage, rate, effective_from
       )
       VALUES(
        '00000000-0000-0000-0000-000000000011',
        '00000000-0000-0000-0000-000000000001',
        'VAT_STD',
        'Standard VAT for Senegal',
        ARRAY['payment'],
        true,
        18.000000,
        '2020-01-01'
       )
       ON CONFLICT DO NOTHING`
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  test('should compute VAT correctly for XOF currency', async () => {
    const decision = await computeAndPersistTax({
      connectTxId: 'tx-test-1',
      amount: 1000,
      currency: 'XOF',
      eventType: 'payment',
      buyerCountry: 'SN',
    });

    expect(decision).toBeDefined();
    expect(decision.total_tax).toBe(180); // 18% of 1000 = 180
    expect(decision.currency).toBe('XOF');
    expect(decision.jurisdiction_id).toBe('00000000-0000-0000-0000-000000000001');
  });

  test('should be idempotent - same tx_id returns same decision', async () => {
    const decision1 = await computeAndPersistTax({
      connectTxId: 'tx-test-2',
      amount: 5000,
      currency: 'XOF',
      eventType: 'payment',
      buyerCountry: 'SN',
    });

    const decision2 = await computeAndPersistTax({
      connectTxId: 'tx-test-2',
      amount: 5000,
      currency: 'XOF',
      eventType: 'payment',
      buyerCountry: 'SN',
    });

    expect(decision1.id).toBe(decision2.id);
    expect(decision1.total_tax).toBe(decision2.total_tax);
  });

  test('should handle multiple tax rules', async () => {
    // Add another rule
    await pool.query(
      `INSERT INTO tax_rules(
        jurisdiction_id, code, applies_to, is_percentage, rate, effective_from
       )
       VALUES(
        '00000000-0000-0000-0000-000000000001',
        'LOCAL_TAX',
        ARRAY['payment'],
        true,
        2.000000,
        '2020-01-01'
       )
       ON CONFLICT DO NOTHING`
    );

    const decision = await computeAndPersistTax({
      connectTxId: 'tx-test-3',
      amount: 1000,
      currency: 'XOF',
      eventType: 'payment',
      buyerCountry: 'SN',
    });

    // Should apply both VAT (18%) and LOCAL_TAX (2%) = 20% total = 200
    expect(decision.total_tax).toBe(200);
    expect(decision.tax_lines).toHaveLength(2);
  });

  test('should round correctly for currencies', async () => {
    const decision = await computeAndPersistTax({
      connectTxId: 'tx-test-4',
      amount: 1111, // 18% = 199.98 → rounds to 200 for XOF (0 decimals)
      currency: 'XOF',
      eventType: 'payment',
      buyerCountry: 'SN',
    });

    expect(decision.total_tax).toBe(200);
  });
});