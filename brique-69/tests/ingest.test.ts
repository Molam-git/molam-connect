/**
 * Data Ingestion Tests
 */

import { Pool } from 'pg';

describe('Transaction Ingestion', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('upsert_hourly_agg function', () => {
    it('should insert new aggregate record', async () => {
      const result = await pool.query(
        `SELECT upsert_hourly_agg($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
        [
          new Date('2025-07-15T10:00:00Z'),
          'CEDEAO',
          'SN',
          '550e8400-e29b-41d4-a716-446655440000',
          null,
          'product-1',
          'wallet',
          'XOF',
          1000, // gross_local
          1.63, // gross_usd
          900, // net_local
          1.47, // net_usd
          100, // fee_molam_local
          0.16, // fee_molam_usd
          0,
          0,
          0,
          0,
          0,
          0,
          1, // tx_count
          1, // success_count
          0,
          0,
        ]
      );

      expect(result).toBeDefined();
    });

    it('should update existing aggregate record', async () => {
      const merchantId = '550e8400-e29b-41d4-a716-446655440000';
      const hour = new Date('2025-07-15T10:00:00Z');

      // First insert
      await pool.query(
        `SELECT upsert_hourly_agg($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
        [hour, 'CEDEAO', 'SN', merchantId, null, 'product-1', 'wallet', 'XOF', 1000, 1.63, 900, 1.47, 100, 0.16, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]
      );

      // Second insert (should update)
      await pool.query(
        `SELECT upsert_hourly_agg($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
        [hour, 'CEDEAO', 'SN', merchantId, null, 'product-1', 'wallet', 'XOF', 500, 0.82, 450, 0.73, 50, 0.08, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]
      );

      // Verify aggregate
      const result = await pool.query(
        `SELECT gross_volume_local, tx_count FROM txn_hourly_agg
         WHERE hour = $1 AND merchant_id = $2 AND product_id = $3`,
        [hour, merchantId, 'product-1']
      );

      expect(result.rows[0].gross_volume_local).toBe('1500');
      expect(result.rows[0].tx_count).toBe('2');
    });
  });

  describe('FX rate lookup', () => {
    it('should return correct FX rate', async () => {
      const result = await pool.query(
        `SELECT rate FROM fx_rates WHERE as_of_date = $1 AND base_currency = $2 AND quote_currency = $3`,
        [new Date().toISOString().slice(0, 10), 'EUR', 'USD']
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(parseFloat(result.rows[0].rate)).toBeGreaterThan(0);
    });
  });
});
