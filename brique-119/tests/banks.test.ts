/**
 * Brique 119: Bank Profiles & Treasury Accounts Tests
 * Tests pour les routes d'onboarding bancaire et gestion de trésorerie
 */

import request from 'supertest';
import { Pool } from 'pg';
import express from 'express';
import banksRouter from '../src/routes/banks';

// Setup Express app pour les tests
const app = express();
app.use(express.json());

// Mock user_id middleware
app.use((req, res, next) => {
  req.body.user_id = '00000000-0000-0000-0000-000000000001';
  next();
});

app.use('/api/banks', banksRouter);

// PostgreSQL test pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

describe('Brique 119 - Bank Profiles & Treasury Accounts', () => {
  let testBankId: string;
  let testAccountId: string;

  beforeAll(async () => {
    // Run migration
    const migration = require('fs').readFileSync(
      __dirname + '/../migrations/001_bank_profiles.sql',
      'utf8'
    );
    await pool.query(migration);
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DROP TABLE IF EXISTS bank_events CASCADE');
    await pool.query('DROP TABLE IF EXISTS bank_certifications CASCADE');
    await pool.query('DROP TABLE IF EXISTS bank_sla_tracking CASCADE');
    await pool.query('DROP TABLE IF EXISTS treasury_accounts CASCADE');
    await pool.query('DROP TABLE IF EXISTS bank_profiles CASCADE');
    await pool.end();
  });

  beforeEach(async () => {
    // Clean tables before each test
    await pool.query('DELETE FROM bank_events');
    await pool.query('DELETE FROM bank_certifications');
    await pool.query('DELETE FROM bank_sla_tracking');
    await pool.query('DELETE FROM treasury_accounts');
    await pool.query('DELETE FROM bank_profiles');
  });

  describe('POST /api/banks/onboard - Bank Onboarding', () => {
    test('should onboard a new bank successfully', async () => {
      const bankData = {
        name: 'Test Bank SA',
        bic_code: 'TESTFRPP',
        country_code: 'FR',
        api_endpoint: 'https://api.testbank.fr',
        contact_email: 'contact@testbank.fr',
        contact_phone: '+33123456789',
        sla_settlement_days: 2,
        sla_availability: 99.95,
        sla_max_failure_rate: 0.5
      };

      const response = await request(app)
        .post('/api/banks/onboard')
        .send(bankData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.bank).toBeDefined();
      expect(response.body.bank.name).toBe('Test Bank SA');
      expect(response.body.bank.bic_code).toBe('TESTFRPP');
      expect(response.body.bank.status).toBe('pending');
      expect(response.body.bank.id).toBeDefined();

      testBankId = response.body.bank.id;

      // Verify event was logged
      const eventsResult = await pool.query(
        'SELECT * FROM bank_events WHERE bank_id = $1 AND event_type = $2',
        [testBankId, 'onboarded']
      );
      expect(eventsResult.rows.length).toBe(1);
      expect(eventsResult.rows[0].severity).toBe('info');
    });

    test('should reject onboarding with missing required fields', async () => {
      const response = await request(app)
        .post('/api/banks/onboard')
        .send({
          name: 'Test Bank'
          // Missing bic_code and country_code
        })
        .expect(400);

      expect(response.body.error).toContain('Missing required fields');
    });

    test('should reject invalid BIC code', async () => {
      const response = await request(app)
        .post('/api/banks/onboard')
        .send({
          name: 'Test Bank',
          bic_code: 'SHORT', // Too short
          country_code: 'FR'
        })
        .expect(400);

      expect(response.body.error).toContain('BIC code must be 8-11 characters');
    });

    test('should reject invalid country code', async () => {
      const response = await request(app)
        .post('/api/banks/onboard')
        .send({
          name: 'Test Bank',
          bic_code: 'TESTFRPP',
          country_code: 'FRANCE' // Too long
        })
        .expect(400);

      expect(response.body.error).toContain('Country code must be 2 characters');
    });

    test('should reject duplicate BIC code', async () => {
      const bankData = {
        name: 'Test Bank 1',
        bic_code: 'TESTFRPP',
        country_code: 'FR'
      };

      // First onboarding succeeds
      await request(app)
        .post('/api/banks/onboard')
        .send(bankData)
        .expect(201);

      // Second onboarding with same BIC fails
      const response = await request(app)
        .post('/api/banks/onboard')
        .send({
          ...bankData,
          name: 'Test Bank 2'
        })
        .expect(409);

      expect(response.body.error).toContain('BIC code already exists');
    });

    test('should use default SLA values when not provided', async () => {
      const response = await request(app)
        .post('/api/banks/onboard')
        .send({
          name: 'Test Bank',
          bic_code: 'TESTFRPP',
          country_code: 'FR'
        })
        .expect(201);

      expect(response.body.bank.sla_settlement_days).toBe(3);
      expect(parseFloat(response.body.bank.sla_availability)).toBe(99.99);
      expect(parseFloat(response.body.bank.sla_max_failure_rate)).toBe(1.00);
    });
  });

  describe('GET /api/banks - List Banks', () => {
    beforeEach(async () => {
      // Create test banks
      await pool.query(`
        INSERT INTO bank_profiles (name, bic_code, country_code, status, health_status)
        VALUES
          ('Bank A', 'BANKAFRP', 'FR', 'active', 'healthy'),
          ('Bank B', 'BANKBDEP', 'DE', 'active', 'healthy'),
          ('Bank C', 'BANKCGBP', 'GB', 'suspended', 'degraded'),
          ('Bank D', 'BANKDITP', 'IT', 'pending', 'healthy')
      `);
    });

    test('should list all banks', async () => {
      const response = await request(app)
        .get('/api/banks')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.banks).toHaveLength(4);
      expect(response.body.pagination.total).toBe(4);
    });

    test('should filter banks by status', async () => {
      const response = await request(app)
        .get('/api/banks?status=active')
        .expect(200);

      expect(response.body.banks).toHaveLength(2);
      expect(response.body.banks.every((b: any) => b.status === 'active')).toBe(true);
    });

    test('should filter banks by country', async () => {
      const response = await request(app)
        .get('/api/banks?country_code=FR')
        .expect(200);

      expect(response.body.banks).toHaveLength(1);
      expect(response.body.banks[0].country_code).toBe('FR');
    });

    test('should filter banks by health status', async () => {
      const response = await request(app)
        .get('/api/banks?health_status=degraded')
        .expect(200);

      expect(response.body.banks).toHaveLength(1);
      expect(response.body.banks[0].health_status).toBe('degraded');
    });

    test('should paginate results', async () => {
      const response = await request(app)
        .get('/api/banks?page=1&limit=2')
        .expect(200);

      expect(response.body.banks).toHaveLength(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.pages).toBe(2);
    });

    test('should include account counts and balances', async () => {
      // Create a bank with accounts
      const bankResult = await pool.query(`
        INSERT INTO bank_profiles (name, bic_code, country_code)
        VALUES ('Bank With Accounts', 'BWACCFRP', 'FR')
        RETURNING id
      `);
      const bankId = bankResult.rows[0].id;

      await pool.query(`
        INSERT INTO treasury_accounts (bank_id, account_number, currency, account_type, balance, is_active)
        VALUES
          ($1, 'ACC001', 'EUR', 'operational', 100000, true),
          ($1, 'ACC002', 'USD', 'reserve', 50000, true),
          ($1, 'ACC003', 'GBP', 'payout', 25000, false)
      `, [bankId]);

      const response = await request(app)
        .get('/api/banks')
        .expect(200);

      const bankWithAccounts = response.body.banks.find((b: any) => b.id === bankId);
      expect(bankWithAccounts).toBeDefined();
      expect(parseInt(bankWithAccounts.total_accounts)).toBe(3);
      expect(parseInt(bankWithAccounts.active_accounts)).toBe(2);
      expect(parseFloat(bankWithAccounts.total_balance)).toBe(175000);
    });
  });

  describe('GET /api/banks/:id - Get Bank Details', () => {
    beforeEach(async () => {
      // Create test bank
      const bankResult = await pool.query(`
        INSERT INTO bank_profiles (name, bic_code, country_code)
        VALUES ('Detailed Bank', 'DETAILSP', 'FR')
        RETURNING id
      `);
      testBankId = bankResult.rows[0].id;

      // Create treasury accounts
      await pool.query(`
        INSERT INTO treasury_accounts (bank_id, account_number, currency, account_type)
        VALUES ($1, 'ACC001', 'EUR', 'operational')
      `, [testBankId]);

      // Create SLA tracking
      await pool.query(`
        INSERT INTO bank_sla_tracking (
          bank_id, measurement_period, period_start, period_end,
          total_transactions, successful_transactions, failed_transactions
        )
        VALUES ($1, 'daily', now() - interval '1 day', now(), 100, 98, 2)
      `, [testBankId]);

      // Create certification
      await pool.query(`
        INSERT INTO bank_certifications (
          bank_id, certification_type, issue_date, expiry_date
        )
        VALUES ($1, 'PCI-DSS', now(), now() + interval '1 year')
      `, [testBankId]);

      // Create event
      await pool.query(`
        SELECT log_bank_event($1, 'test_event', 'operational', 'info', 'Test event', NULL, NULL)
      `, [testBankId]);
    });

    test('should get bank details with all related data', async () => {
      const response = await request(app)
        .get(`/api/banks/${testBankId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.bank).toBeDefined();
      expect(response.body.bank.name).toBe('Detailed Bank');
      expect(response.body.treasury_accounts).toHaveLength(1);
      expect(response.body.sla_history).toHaveLength(1);
      expect(response.body.certifications).toHaveLength(1);
      expect(response.body.recent_events.length).toBeGreaterThan(0);
    });

    test('should return 404 for non-existent bank', async () => {
      const response = await request(app)
        .get('/api/banks/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body.error).toContain('Bank not found');
    });
  });

  describe('PATCH /api/banks/:id/status - Update Bank Status', () => {
    beforeEach(async () => {
      const result = await pool.query(`
        INSERT INTO bank_profiles (name, bic_code, country_code, status)
        VALUES ('Status Test Bank', 'STATUSTB', 'FR', 'pending')
        RETURNING id
      `);
      testBankId = result.rows[0].id;
    });

    test('should update bank status to active', async () => {
      const response = await request(app)
        .patch(`/api/banks/${testBankId}/status`)
        .send({
          status: 'active',
          reason: 'Onboarding completed successfully'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.bank.status).toBe('active');

      // Verify event was logged
      const eventsResult = await pool.query(
        'SELECT * FROM bank_events WHERE bank_id = $1 AND event_type = $2',
        [testBankId, 'status_changed']
      );
      expect(eventsResult.rows.length).toBe(1);
    });

    test('should reject invalid status', async () => {
      const response = await request(app)
        .patch(`/api/banks/${testBankId}/status`)
        .send({
          status: 'invalid_status'
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid status');
    });

    test('should log warning severity for suspension', async () => {
      await request(app)
        .patch(`/api/banks/${testBankId}/status`)
        .send({
          status: 'suspended',
          reason: 'SLA violation'
        })
        .expect(200);

      const eventsResult = await pool.query(
        'SELECT * FROM bank_events WHERE bank_id = $1 AND event_type = $2',
        [testBankId, 'status_changed']
      );
      expect(eventsResult.rows[0].severity).toBe('warning');
    });

    test('should return 404 for non-existent bank', async () => {
      const response = await request(app)
        .patch('/api/banks/00000000-0000-0000-0000-000000000000/status')
        .send({
          status: 'active'
        })
        .expect(404);

      expect(response.body.error).toContain('Bank not found');
    });
  });

  describe('POST /api/banks/:id/accounts - Create Treasury Account', () => {
    beforeEach(async () => {
      const result = await pool.query(`
        INSERT INTO bank_profiles (name, bic_code, country_code)
        VALUES ('Account Test Bank', 'ACCTTBFR', 'FR')
        RETURNING id
      `);
      testBankId = result.rows[0].id;
    });

    test('should create treasury account successfully', async () => {
      const accountData = {
        account_number: 'FR7612345678901234567890123',
        account_name: 'Main Operational Account',
        currency: 'EUR',
        account_type: 'operational',
        balance: 1000000,
        min_balance: 10000,
        is_default: true
      };

      const response = await request(app)
        .post(`/api/banks/${testBankId}/accounts`)
        .send(accountData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.account).toBeDefined();
      expect(response.body.account.account_number).toBe(accountData.account_number);
      expect(response.body.account.currency).toBe('EUR');
      expect(response.body.account.is_default).toBe(true);
      expect(parseFloat(response.body.account.balance)).toBe(1000000);

      testAccountId = response.body.account.id;

      // Verify event was logged
      const eventsResult = await pool.query(
        'SELECT * FROM bank_events WHERE bank_id = $1 AND event_type = $2',
        [testBankId, 'account_created']
      );
      expect(eventsResult.rows.length).toBe(1);
    });

    test('should reject missing required fields', async () => {
      const response = await request(app)
        .post(`/api/banks/${testBankId}/accounts`)
        .send({
          account_name: 'Test Account'
          // Missing account_number, currency, account_type
        })
        .expect(400);

      expect(response.body.error).toContain('Missing required fields');
    });

    test('should reject invalid account type', async () => {
      const response = await request(app)
        .post(`/api/banks/${testBankId}/accounts`)
        .send({
          account_number: 'ACC123',
          currency: 'EUR',
          account_type: 'invalid_type'
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid account_type');
    });

    test('should reject invalid currency code', async () => {
      const response = await request(app)
        .post(`/api/banks/${testBankId}/accounts`)
        .send({
          account_number: 'ACC123',
          currency: 'EURO', // Should be 3 letters
          account_type: 'operational'
        })
        .expect(400);

      expect(response.body.error).toContain('Currency must be 3-letter ISO code');
    });

    test('should unset other default accounts when creating new default', async () => {
      // Create first default account
      await request(app)
        .post(`/api/banks/${testBankId}/accounts`)
        .send({
          account_number: 'ACC001',
          currency: 'EUR',
          account_type: 'operational',
          is_default: true
        })
        .expect(201);

      // Create second default account (should unset first)
      await request(app)
        .post(`/api/banks/${testBankId}/accounts`)
        .send({
          account_number: 'ACC002',
          currency: 'EUR',
          account_type: 'reserve',
          is_default: true
        })
        .expect(201);

      // Verify only one default account exists
      const result = await pool.query(
        'SELECT COUNT(*) FROM treasury_accounts WHERE bank_id = $1 AND currency = $2 AND is_default = true',
        [testBankId, 'EUR']
      );
      expect(parseInt(result.rows[0].count)).toBe(1);
    });

    test('should reject duplicate account number and currency', async () => {
      const accountData = {
        account_number: 'ACC001',
        currency: 'EUR',
        account_type: 'operational'
      };

      // First creation succeeds
      await request(app)
        .post(`/api/banks/${testBankId}/accounts`)
        .send(accountData)
        .expect(201);

      // Second creation fails
      const response = await request(app)
        .post(`/api/banks/${testBankId}/accounts`)
        .send(accountData)
        .expect(409);

      expect(response.body.error).toContain('already exists');
    });

    test('should return 404 for non-existent bank', async () => {
      const response = await request(app)
        .post('/api/banks/00000000-0000-0000-0000-000000000000/accounts')
        .send({
          account_number: 'ACC001',
          currency: 'EUR',
          account_type: 'operational'
        })
        .expect(404);

      expect(response.body.error).toContain('Bank not found');
    });
  });

  describe('GET /api/banks/:id/accounts - List Treasury Accounts', () => {
    beforeEach(async () => {
      const result = await pool.query(`
        INSERT INTO bank_profiles (name, bic_code, country_code)
        VALUES ('List Accounts Bank', 'LISTACFR', 'FR')
        RETURNING id
      `);
      testBankId = result.rows[0].id;

      await pool.query(`
        INSERT INTO treasury_accounts (bank_id, account_number, currency, account_type, is_active, is_default)
        VALUES
          ($1, 'ACC001', 'EUR', 'operational', true, true),
          ($1, 'ACC002', 'EUR', 'reserve', true, false),
          ($1, 'ACC003', 'USD', 'payout', true, false),
          ($1, 'ACC004', 'GBP', 'collection', false, false)
      `, [testBankId]);
    });

    test('should list all accounts for a bank', async () => {
      const response = await request(app)
        .get(`/api/banks/${testBankId}/accounts`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.accounts).toHaveLength(4);
      // Default account should be first
      expect(response.body.accounts[0].is_default).toBe(true);
    });

    test('should filter by currency', async () => {
      const response = await request(app)
        .get(`/api/banks/${testBankId}/accounts?currency=EUR`)
        .expect(200);

      expect(response.body.accounts).toHaveLength(2);
      expect(response.body.accounts.every((a: any) => a.currency === 'EUR')).toBe(true);
    });

    test('should filter by account type', async () => {
      const response = await request(app)
        .get(`/api/banks/${testBankId}/accounts?account_type=operational`)
        .expect(200);

      expect(response.body.accounts).toHaveLength(1);
      expect(response.body.accounts[0].account_type).toBe('operational');
    });

    test('should filter by active status', async () => {
      const response = await request(app)
        .get(`/api/banks/${testBankId}/accounts?is_active=true`)
        .expect(200);

      expect(response.body.accounts).toHaveLength(3);
      expect(response.body.accounts.every((a: any) => a.is_active)).toBe(true);
    });
  });

  describe('GET /api/banks/:id/sla - Get SLA Compliance', () => {
    beforeEach(async () => {
      const result = await pool.query(`
        INSERT INTO bank_profiles (
          name, bic_code, country_code,
          sla_settlement_days, sla_availability, sla_max_failure_rate
        )
        VALUES ('SLA Test Bank', 'SLATESTP', 'FR', 3, 99.9, 1.0)
        RETURNING id
      `);
      testBankId = result.rows[0].id;
    });

    test('should return no_data when no SLA tracking exists', async () => {
      const response = await request(app)
        .get(`/api/banks/${testBankId}/sla`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.compliance.compliance_status).toBe('no_data');
    });

    test('should return compliant status when SLA is met', async () => {
      await pool.query(`
        INSERT INTO bank_sla_tracking (
          bank_id, measurement_period, period_start, period_end,
          total_transactions, successful_transactions, failed_transactions,
          avg_settlement_time_hours, uptime_seconds, downtime_seconds,
          sla_met
        )
        VALUES ($1, 'daily', now() - interval '1 day', now(), 100, 99, 1, 24, 86400, 0, true)
      `, [testBankId]);

      const response = await request(app)
        .get(`/api/banks/${testBankId}/sla`)
        .expect(200);

      expect(response.body.compliance.compliance_status).toBe('compliant');
      expect(response.body.recent_violations).toHaveLength(0);
    });

    test('should return non-compliant status and violations when SLA is breached', async () => {
      await pool.query(`
        INSERT INTO bank_sla_tracking (
          bank_id, measurement_period, period_start, period_end,
          total_transactions, successful_transactions, failed_transactions,
          avg_settlement_time_hours, uptime_seconds, downtime_seconds,
          sla_met, sla_violations
        )
        VALUES ($1, 'daily', now() - interval '1 day', now(), 100, 95, 5, 80, 80000, 6400, false, ARRAY['high_failure_rate', 'settlement_delay'])
      `, [testBankId]);

      const response = await request(app)
        .get(`/api/banks/${testBankId}/sla`)
        .expect(200);

      expect(response.body.compliance.compliance_status).toBe('non_compliant');
      expect(response.body.recent_violations).toHaveLength(1);
      expect(response.body.recent_violations[0].sla_violations).toContain('high_failure_rate');
    });

    test('should return 404 for non-existent bank', async () => {
      const response = await request(app)
        .get('/api/banks/00000000-0000-0000-0000-000000000000/sla')
        .expect(404);

      expect(response.body.error).toContain('Bank not found');
    });
  });

  describe('POST /api/banks/:id/sla/track - Record SLA Tracking', () => {
    beforeEach(async () => {
      const result = await pool.query(`
        INSERT INTO bank_profiles (name, bic_code, country_code)
        VALUES ('Track SLA Bank', 'TRACKSLP', 'FR')
        RETURNING id
      `);
      testBankId = result.rows[0].id;
    });

    test('should record SLA tracking successfully', async () => {
      const trackingData = {
        measurement_period: 'daily',
        period_start: new Date(Date.now() - 86400000).toISOString(),
        period_end: new Date().toISOString(),
        total_transactions: 1000,
        successful_transactions: 995,
        failed_transactions: 5,
        avg_settlement_time_hours: 48,
        max_settlement_time_hours: 70,
        on_time_settlements: 990,
        late_settlements: 5,
        uptime_seconds: 86000,
        downtime_seconds: 400
      };

      const response = await request(app)
        .post(`/api/banks/${testBankId}/sla/track`)
        .send(trackingData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.tracking).toBeDefined();
      expect(response.body.tracking.total_transactions).toBe(1000);
      expect(response.body.tracking.successful_transactions).toBe(995);
    });

    test('should log event when SLA is violated', async () => {
      const trackingData = {
        measurement_period: 'daily',
        period_start: new Date(Date.now() - 86400000).toISOString(),
        period_end: new Date().toISOString(),
        total_transactions: 100,
        successful_transactions: 80,
        failed_transactions: 20, // 20% failure rate - violation
        uptime_seconds: 70000,
        downtime_seconds: 16400 // ~80% availability - violation
      };

      await request(app)
        .post(`/api/banks/${testBankId}/sla/track`)
        .send(trackingData)
        .expect(201);

      // Verify SLA violation event was logged
      const eventsResult = await pool.query(
        'SELECT * FROM bank_events WHERE bank_id = $1 AND event_type = $2',
        [testBankId, 'sla_violation']
      );
      expect(eventsResult.rows.length).toBe(1);
      expect(eventsResult.rows[0].severity).toBe('warning');
    });

    test('should reject missing required fields', async () => {
      const response = await request(app)
        .post(`/api/banks/${testBankId}/sla/track`)
        .send({
          measurement_period: 'daily'
          // Missing period_start and period_end
        })
        .expect(400);

      expect(response.body.error).toContain('Missing required fields');
    });

    test('should reject duplicate tracking record', async () => {
      const trackingData = {
        measurement_period: 'daily',
        period_start: new Date(Date.now() - 86400000).toISOString(),
        period_end: new Date().toISOString(),
        total_transactions: 100,
        successful_transactions: 98,
        failed_transactions: 2
      };

      // First record succeeds
      await request(app)
        .post(`/api/banks/${testBankId}/sla/track`)
        .send(trackingData)
        .expect(201);

      // Duplicate record fails
      const response = await request(app)
        .post(`/api/banks/${testBankId}/sla/track`)
        .send(trackingData)
        .expect(409);

      expect(response.body.error).toContain('already exists');
    });
  });

  describe('Database Functions & Views', () => {
    test('should calculate available_balance correctly', async () => {
      const result = await pool.query(`
        INSERT INTO bank_profiles (name, bic_code, country_code)
        VALUES ('Balance Test', 'BALTESTP', 'FR')
        RETURNING id
      `);
      const bankId = result.rows[0].id;

      await pool.query(`
        INSERT INTO treasury_accounts (
          bank_id, account_number, currency, account_type,
          balance, reserved_balance
        )
        VALUES ($1, 'ACC001', 'EUR', 'operational', 100000, 25000)
      `, [bankId]);

      const accountResult = await pool.query(`
        SELECT available_balance FROM treasury_accounts
        WHERE bank_id = $1
      `, [bankId]);

      expect(parseFloat(accountResult.rows[0].available_balance)).toBe(75000);
    });

    test('active_banks_with_accounts view should work correctly', async () => {
      const result = await pool.query(`
        INSERT INTO bank_profiles (name, bic_code, country_code, status)
        VALUES ('Active View Bank', 'ACTIVEVP', 'FR', 'active')
        RETURNING id
      `);
      const bankId = result.rows[0].id;

      await pool.query(`
        INSERT INTO treasury_accounts (bank_id, account_number, currency, account_type, balance, is_active)
        VALUES
          ($1, 'ACC001', 'EUR', 'operational', 50000, true),
          ($1, 'ACC002', 'USD', 'reserve', 30000, false)
      `, [bankId]);

      const viewResult = await pool.query(`
        SELECT * FROM active_banks_with_accounts WHERE id = $1
      `, [bankId]);

      expect(viewResult.rows).toHaveLength(1);
      expect(parseInt(viewResult.rows[0].total_accounts)).toBe(2);
      expect(parseInt(viewResult.rows[0].active_accounts)).toBe(1);
      expect(parseFloat(viewResult.rows[0].total_balance)).toBe(80000);
    });

    test('recent_sla_violations view should show only violations', async () => {
      const result = await pool.query(`
        INSERT INTO bank_profiles (name, bic_code, country_code)
        VALUES ('Violation View Bank', 'VIOLVWBP', 'FR')
        RETURNING id
      `);
      const bankId = result.rows[0].id;

      // Insert compliant record
      await pool.query(`
        INSERT INTO bank_sla_tracking (
          bank_id, measurement_period, period_start, period_end,
          total_transactions, successful_transactions, failed_transactions,
          sla_met
        )
        VALUES ($1, 'daily', now() - interval '2 days', now() - interval '1 day', 100, 99, 1, true)
      `, [bankId]);

      // Insert violation record
      await pool.query(`
        INSERT INTO bank_sla_tracking (
          bank_id, measurement_period, period_start, period_end,
          total_transactions, successful_transactions, failed_transactions,
          sla_met, sla_violations
        )
        VALUES ($1, 'daily', now() - interval '1 day', now(), 100, 90, 10, false, ARRAY['high_failure_rate'])
      `, [bankId]);

      const viewResult = await pool.query(`
        SELECT * FROM recent_sla_violations WHERE bic_code = 'VIOLVWBP'
      `);

      expect(viewResult.rows).toHaveLength(1);
      expect(viewResult.rows[0].sla_violations).toContain('high_failure_rate');
    });
  });
});
