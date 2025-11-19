/**
 * Brique 112: Data Ingestion Worker Tests
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');
const {
  redactPII,
  extractFeaturesFromWalletTxn,
  ingestEvent,
  addLabel,
  processWalletTransaction,
  batchIngest,
  getDatasetSummary,
  getLabelDistribution,
  setPool
} = require('../src/workers/dataIngestion');

describe('Data Ingestion Worker', () => {
  let pool;

  before(async () => {
    // Setup test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/molam_test'
    });

    setPool(pool);

    // Create test tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS siradata_events (
        event_id UUID PRIMARY KEY,
        source_module TEXT NOT NULL,
        country TEXT,
        currency TEXT,
        features JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS siradata_labels (
        event_id UUID NOT NULL,
        label TEXT NOT NULL,
        labelled_by TEXT NOT NULL,
        confidence NUMERIC(5,4) DEFAULT 1.0,
        review_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  });

  after(async () => {
    // Cleanup
    await pool.query('DROP TABLE IF EXISTS siradata_events CASCADE');
    await pool.query('DROP TABLE IF EXISTS siradata_labels CASCADE');
    await pool.end();
  });

  describe('redactPII()', () => {
    it('should hash sensitive fields', () => {
      const features = {
        amount: 100,
        phone: '+33612345678',
        email: 'user@example.com',
        pan: '4111111111111111',
        device_type: 'mobile'
      };

      const redacted = redactPII(features);

      // Check that sensitive fields are hashed
      assert.notStrictEqual(redacted.phone, features.phone);
      assert.notStrictEqual(redacted.email, features.email);
      assert.notStrictEqual(redacted.pan, features.pan);

      // Check that hash is consistent
      assert.strictEqual(redacted.phone.length, 16);
      assert.strictEqual(redacted.email.length, 16);

      // Check that non-sensitive fields are preserved
      assert.strictEqual(redacted.amount, 100);
      assert.strictEqual(redacted.device_type, 'mobile');
    });

    it('should remove sensitive fields completely', () => {
      const features = {
        amount: 100,
        cvv: '123',
        pin: '1234',
        password: 'secret123'
      };

      const redacted = redactPII(features);

      assert.strictEqual(redacted.cvv, undefined);
      assert.strictEqual(redacted.pin, undefined);
      assert.strictEqual(redacted.password, undefined);
      assert.strictEqual(redacted.amount, 100);
    });
  });

  describe('extractFeaturesFromWalletTxn()', () => {
    it('should extract all relevant features from transaction', () => {
      const txn = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        amount: 150.50,
        currency: 'EUR',
        country: 'FR',
        payment_method: 'card',
        merchant_id: 'merchant_123',
        merchant_country: 'FR',
        customer_id: 'customer_456',
        device_type: 'mobile',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        phone: '+33612345678',
        email: 'user@example.com',
        retry_count: 0,
        previous_failed: false,
        created_at: new Date('2024-01-15T14:30:00Z')
      };

      const features = extractFeaturesFromWalletTxn(txn);

      assert.strictEqual(features.amount, 150.50);
      assert.strictEqual(features.currency, 'EUR');
      assert.strictEqual(features.country, 'FR');
      assert.strictEqual(features.payment_method, 'card');
      assert.strictEqual(features.is_international, false);
      assert.strictEqual(features.device_type, 'mobile');
      assert.strictEqual(features.retry_count, 0);
      assert.strictEqual(features.hour_of_day, 14);
      assert.strictEqual(features.day_of_week, 1); // Monday
    });
  });

  describe('ingestEvent()', () => {
    it('should ingest event with PII redaction', async () => {
      const eventId = '123e4567-e89b-12d3-a456-426614174001';
      const features = {
        amount: 100,
        phone: '+33612345678',
        email: 'user@example.com',
        payment_method: 'card'
      };

      const result = await ingestEvent(eventId, 'wallet', features, 'FR', 'EUR');

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.event_id, eventId);

      // Verify in database
      const { rows } = await pool.query(
        'SELECT * FROM siradata_events WHERE event_id = $1',
        [eventId]
      );

      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].source_module, 'wallet');
      assert.strictEqual(rows[0].country, 'FR');
      assert.strictEqual(rows[0].currency, 'EUR');

      // Check PII was redacted
      assert.notStrictEqual(rows[0].features.phone, '+33612345678');
      assert.notStrictEqual(rows[0].features.email, 'user@example.com');
    });

    it('should handle duplicate events with ON CONFLICT', async () => {
      const eventId = '123e4567-e89b-12d3-a456-426614174002';
      const features = { amount: 100, payment_method: 'card' };

      // Insert first time
      const result1 = await ingestEvent(eventId, 'wallet', features, 'FR', 'EUR');
      assert.strictEqual(result1.ok, true);

      // Insert second time (should not error)
      const result2 = await ingestEvent(eventId, 'wallet', features, 'FR', 'EUR');
      assert.strictEqual(result2.ok, true);

      // Verify only one row
      const { rows } = await pool.query(
        'SELECT COUNT(*) as count FROM siradata_events WHERE event_id = $1',
        [eventId]
      );
      assert.strictEqual(parseInt(rows[0].count), 1);
    });
  });

  describe('addLabel()', () => {
    it('should add valid label to event', async () => {
      const eventId = '123e4567-e89b-12d3-a456-426614174003';

      // First ingest event
      await ingestEvent(eventId, 'wallet', { amount: 100 }, 'FR', 'EUR');

      // Add label
      const label = await addLabel(eventId, 'fraudulent', 'sira', 0.9, 'Test fraud label');

      assert.strictEqual(label.event_id, eventId);
      assert.strictEqual(label.label, 'fraudulent');
      assert.strictEqual(label.labelled_by, 'sira');
      assert.strictEqual(parseFloat(label.confidence), 0.9);
      assert.strictEqual(label.review_notes, 'Test fraud label');
    });

    it('should reject invalid labels', async () => {
      const eventId = '123e4567-e89b-12d3-a456-426614174004';

      await ingestEvent(eventId, 'wallet', { amount: 100 }, 'FR', 'EUR');

      await assert.rejects(
        async () => {
          await addLabel(eventId, 'invalid_label', 'sira', 1.0);
        },
        /Invalid label/
      );
    });
  });

  describe('processWalletTransaction()', () => {
    it('should process transaction and auto-label as legit', async () => {
      const txn = {
        id: '123e4567-e89b-12d3-a456-426614174005',
        amount: 50,
        currency: 'EUR',
        country: 'FR',
        payment_method: 'card',
        merchant_id: 'merchant_123',
        merchant_country: 'FR',
        customer_id: 'customer_456',
        device_type: 'desktop',
        status: 'completed',
        is_fraud: false,
        created_at: new Date()
      };

      const result = await processWalletTransaction(txn);

      assert.strictEqual(result.ok, true);

      // Check label was added
      const { rows } = await pool.query(
        'SELECT * FROM siradata_labels WHERE event_id = $1',
        [txn.id]
      );

      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].label, 'legit');
      assert.strictEqual(rows[0].labelled_by, 'sira');
    });

    it('should process transaction and auto-label as fraudulent', async () => {
      const txn = {
        id: '123e4567-e89b-12d3-a456-426614174006',
        amount: 500,
        currency: 'USD',
        country: 'US',
        payment_method: 'card',
        merchant_id: 'merchant_123',
        merchant_country: 'FR',
        customer_id: 'customer_456',
        device_type: 'mobile',
        status: 'failed',
        is_fraud: true,
        created_at: new Date()
      };

      const result = await processWalletTransaction(txn);

      assert.strictEqual(result.ok, true);

      // Check label was added
      const { rows } = await pool.query(
        'SELECT * FROM siradata_labels WHERE event_id = $1',
        [txn.id]
      );

      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].label, 'fraudulent');
    });
  });

  describe('batchIngest()', () => {
    it('should ingest multiple events in batch', async () => {
      const events = [
        {
          event_id: '123e4567-e89b-12d3-a456-426614174007',
          source_module: 'wallet',
          features: { amount: 100 },
          country: 'FR',
          currency: 'EUR'
        },
        {
          event_id: '123e4567-e89b-12d3-a456-426614174008',
          source_module: 'wallet',
          features: { amount: 200 },
          country: 'DE',
          currency: 'EUR'
        },
        {
          event_id: '123e4567-e89b-12d3-a456-426614174009',
          source_module: 'wallet',
          features: { amount: 300 },
          country: 'ES',
          currency: 'EUR'
        }
      ];

      const result = await batchIngest(events);

      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.success, 3);
      assert.strictEqual(result.failed, 0);
    });
  });
});
