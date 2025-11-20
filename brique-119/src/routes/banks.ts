/**
 * Brique 119: Bank Profiles & Treasury Accounts API
 * Routes pour onboarding bancaire et gestion de trésorerie
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

/**
 * POST /api/banks/onboard
 * Onboard a new bank partner
 */
router.post('/onboard', async (req: Request, res: Response) => {
  const {
    name,
    bic_code,
    country_code,
    api_endpoint,
    contact_email,
    contact_phone,
    sla_settlement_days,
    sla_availability,
    sla_max_failure_rate,
    api_version,
    supports_webhooks,
    webhook_url
  } = req.body;

  // Validation
  if (!name || !bic_code || !country_code) {
    return res.status(400).json({
      error: 'Missing required fields: name, bic_code, country_code'
    });
  }

  if (bic_code.length < 8 || bic_code.length > 11) {
    return res.status(400).json({
      error: 'BIC code must be 8-11 characters'
    });
  }

  if (country_code.length !== 2) {
    return res.status(400).json({
      error: 'Country code must be 2 characters (ISO 3166-1 alpha-2)'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert bank profile
    const bankResult = await client.query(`
      INSERT INTO bank_profiles (
        name,
        bic_code,
        country_code,
        api_endpoint,
        contact_email,
        contact_phone,
        sla_settlement_days,
        sla_availability,
        sla_max_failure_rate,
        api_version,
        supports_webhooks,
        webhook_url,
        onboarding_date,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13)
      RETURNING *
    `, [
      name,
      bic_code,
      country_code,
      api_endpoint,
      contact_email,
      contact_phone,
      sla_settlement_days || 3,
      sla_availability || 99.99,
      sla_max_failure_rate || 1.00,
      api_version,
      supports_webhooks || false,
      webhook_url,
      req.body.user_id // From auth middleware
    ]);

    const bank = bankResult.rows[0];

    // Log onboarding event
    await client.query(`
      SELECT log_bank_event($1, $2, $3, $4, $5, $6, $7)
    `, [
      bank.id,
      'onboarded',
      'operational',
      'info',
      `Bank ${name} (${bic_code}) onboarded successfully`,
      JSON.stringify({ country: country_code }),
      req.body.user_id
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      bank
    });
  } catch (error: any) {
    await client.query('ROLLBACK');

    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        error: 'Bank with this BIC code already exists'
      });
    }

    console.error('Bank onboarding error:', error);
    res.status(500).json({
      error: 'Failed to onboard bank'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/banks
 * List banks with optional filters
 */
router.get('/', async (req: Request, res: Response) => {
  const {
    status,
    country_code,
    health_status,
    certification_status,
    page = 1,
    limit = 20
  } = req.query;

  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(status);
  }

  if (country_code) {
    conditions.push(`country_code = $${paramIndex++}`);
    params.push(country_code);
  }

  if (health_status) {
    conditions.push(`health_status = $${paramIndex++}`);
    params.push(health_status);
  }

  if (certification_status) {
    conditions.push(`certification_status = $${paramIndex++}`);
    params.push(certification_status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM bank_profiles ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].count);

    // Get banks
    const banksResult = await pool.query(`
      SELECT
        bp.*,
        COUNT(ta.id) as total_accounts,
        COUNT(ta.id) FILTER (WHERE ta.is_active = true) as active_accounts,
        COALESCE(SUM(ta.balance), 0) as total_balance
      FROM bank_profiles bp
      LEFT JOIN treasury_accounts ta ON bp.id = ta.bank_id
      ${whereClause}
      GROUP BY bp.id
      ORDER BY bp.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit as string), offset]);

    res.json({
      success: true,
      banks: banksResult.rows,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('List banks error:', error);
    res.status(500).json({
      error: 'Failed to list banks'
    });
  }
});

/**
 * GET /api/banks/:id
 * Get bank details with accounts
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Get bank profile
    const bankResult = await pool.query(`
      SELECT * FROM bank_profiles WHERE id = $1
    `, [id]);

    if (bankResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Bank not found'
      });
    }

    const bank = bankResult.rows[0];

    // Get treasury accounts
    const accountsResult = await pool.query(`
      SELECT * FROM treasury_accounts
      WHERE bank_id = $1
      ORDER BY is_default DESC, created_at DESC
    `, [id]);

    // Get recent SLA tracking
    const slaResult = await pool.query(`
      SELECT * FROM bank_sla_tracking
      WHERE bank_id = $1
      ORDER BY period_end DESC
      LIMIT 10
    `, [id]);

    // Get certifications
    const certsResult = await pool.query(`
      SELECT * FROM bank_certifications
      WHERE bank_id = $1
      ORDER BY expiry_date DESC
    `, [id]);

    // Get recent events
    const eventsResult = await pool.query(`
      SELECT * FROM bank_events
      WHERE bank_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [id]);

    res.json({
      success: true,
      bank,
      treasury_accounts: accountsResult.rows,
      sla_history: slaResult.rows,
      certifications: certsResult.rows,
      recent_events: eventsResult.rows
    });
  } catch (error) {
    console.error('Get bank error:', error);
    res.status(500).json({
      error: 'Failed to get bank details'
    });
  }
});

/**
 * PATCH /api/banks/:id/status
 * Update bank status
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  const validStatuses = ['active', 'inactive', 'suspended', 'pending'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update status
    const result = await client.query(`
      UPDATE bank_profiles
      SET status = $1, updated_at = now(), updated_by = $2
      WHERE id = $3
      RETURNING *
    `, [status, req.body.user_id, id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Bank not found'
      });
    }

    const bank = result.rows[0];

    // Log status change event
    const severity = status === 'suspended' ? 'warning' : 'info';
    await client.query(`
      SELECT log_bank_event($1, $2, $3, $4, $5, $6, $7)
    `, [
      id,
      'status_changed',
      'operational',
      severity,
      reason || `Status changed to ${status}`,
      JSON.stringify({ old_status: bank.status, new_status: status }),
      req.body.user_id
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      bank
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update status error:', error);
    res.status(500).json({
      error: 'Failed to update bank status'
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/banks/:id/accounts
 * Create treasury account for a bank
 */
router.post('/:id/accounts', async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    account_number,
    account_name,
    currency,
    account_type,
    balance,
    min_balance,
    max_balance,
    is_default,
    auto_sweep_enabled,
    sweep_threshold,
    reconciliation_frequency
  } = req.body;

  // Validation
  if (!account_number || !currency || !account_type) {
    return res.status(400).json({
      error: 'Missing required fields: account_number, currency, account_type'
    });
  }

  const validTypes = ['reserve', 'operational', 'payout', 'collection', 'settlement'];
  if (!validTypes.includes(account_type)) {
    return res.status(400).json({
      error: `Invalid account_type. Must be one of: ${validTypes.join(', ')}`
    });
  }

  if (currency.length !== 3) {
    return res.status(400).json({
      error: 'Currency must be 3-letter ISO code (e.g., USD, EUR)'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if bank exists
    const bankCheck = await client.query(`
      SELECT id FROM bank_profiles WHERE id = $1
    `, [id]);

    if (bankCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Bank not found'
      });
    }

    // If this is set as default, unset other defaults for same currency
    if (is_default) {
      await client.query(`
        UPDATE treasury_accounts
        SET is_default = false
        WHERE bank_id = $1 AND currency = $2
      `, [id, currency]);
    }

    // Insert treasury account
    const accountResult = await client.query(`
      INSERT INTO treasury_accounts (
        bank_id,
        account_number,
        account_name,
        currency,
        account_type,
        balance,
        min_balance,
        max_balance,
        is_default,
        auto_sweep_enabled,
        sweep_threshold,
        reconciliation_frequency,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      id,
      account_number,
      account_name,
      currency,
      account_type,
      balance || 0,
      min_balance || 0,
      max_balance,
      is_default || false,
      auto_sweep_enabled || false,
      sweep_threshold,
      reconciliation_frequency || 'daily',
      req.body.user_id
    ]);

    const account = accountResult.rows[0];

    // Log account creation event
    await client.query(`
      SELECT log_bank_event($1, $2, $3, $4, $5, $6, $7)
    `, [
      id,
      'account_created',
      'financial',
      'info',
      `Treasury account ${account_number} created (${currency})`,
      JSON.stringify({ account_id: account.id, account_type }),
      req.body.user_id
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      account
    });
  } catch (error: any) {
    await client.query('ROLLBACK');

    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        error: 'Account with this number and currency already exists for this bank'
      });
    }

    console.error('Create treasury account error:', error);
    res.status(500).json({
      error: 'Failed to create treasury account'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/banks/:id/accounts
 * List treasury accounts for a bank
 */
router.get('/:id/accounts', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { currency, account_type, is_active } = req.query;

  const conditions: string[] = ['bank_id = $1'];
  const params: any[] = [id];
  let paramIndex = 2;

  if (currency) {
    conditions.push(`currency = $${paramIndex++}`);
    params.push(currency);
  }

  if (account_type) {
    conditions.push(`account_type = $${paramIndex++}`);
    params.push(account_type);
  }

  if (is_active !== undefined) {
    conditions.push(`is_active = $${paramIndex++}`);
    params.push(is_active === 'true');
  }

  try {
    const result = await pool.query(`
      SELECT * FROM treasury_accounts
      WHERE ${conditions.join(' AND ')}
      ORDER BY is_default DESC, currency, created_at DESC
    `, params);

    res.json({
      success: true,
      accounts: result.rows
    });
  } catch (error) {
    console.error('List treasury accounts error:', error);
    res.status(500).json({
      error: 'Failed to list treasury accounts'
    });
  }
});

/**
 * GET /api/banks/:id/sla
 * Get SLA compliance for a bank
 */
router.get('/:id/sla', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Check if bank exists
    const bankCheck = await pool.query(`
      SELECT name FROM bank_profiles WHERE id = $1
    `, [id]);

    if (bankCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Bank not found'
      });
    }

    // Get SLA compliance
    const complianceResult = await pool.query(`
      SELECT * FROM check_bank_sla_compliance($1)
    `, [id]);

    const compliance = complianceResult.rows[0];

    // Get recent violations
    const violationsResult = await pool.query(`
      SELECT * FROM bank_sla_tracking
      WHERE bank_id = $1 AND sla_met = false
      ORDER BY period_end DESC
      LIMIT 10
    `, [id]);

    res.json({
      success: true,
      bank_name: bankCheck.rows[0].name,
      compliance,
      recent_violations: violationsResult.rows
    });
  } catch (error) {
    console.error('Get SLA compliance error:', error);
    res.status(500).json({
      error: 'Failed to get SLA compliance'
    });
  }
});

/**
 * POST /api/banks/:id/sla/track
 * Record SLA tracking metrics (usually called by monitoring system)
 */
router.post('/:id/sla/track', async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    measurement_period,
    period_start,
    period_end,
    total_transactions,
    successful_transactions,
    failed_transactions,
    avg_settlement_time_hours,
    max_settlement_time_hours,
    on_time_settlements,
    late_settlements,
    uptime_seconds,
    downtime_seconds
  } = req.body;

  // Validation
  if (!measurement_period || !period_start || !period_end) {
    return res.status(400).json({
      error: 'Missing required fields: measurement_period, period_start, period_end'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert SLA tracking record
    const result = await client.query(`
      INSERT INTO bank_sla_tracking (
        bank_id,
        measurement_period,
        period_start,
        period_end,
        total_transactions,
        successful_transactions,
        failed_transactions,
        avg_settlement_time_hours,
        max_settlement_time_hours,
        on_time_settlements,
        late_settlements,
        uptime_seconds,
        downtime_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      id,
      measurement_period,
      period_start,
      period_end,
      total_transactions || 0,
      successful_transactions || 0,
      failed_transactions || 0,
      avg_settlement_time_hours,
      max_settlement_time_hours,
      on_time_settlements || 0,
      late_settlements || 0,
      uptime_seconds || 0,
      downtime_seconds || 0
    ]);

    const tracking = result.rows[0];

    // Check if SLA was met and log violation if not
    if (!tracking.sla_met) {
      await client.query(`
        SELECT log_bank_event($1, $2, $3, $4, $5, $6, $7)
      `, [
        id,
        'sla_violation',
        'compliance',
        'warning',
        `SLA violation detected for period ${period_start} to ${period_end}`,
        JSON.stringify({
          measurement_period,
          failure_rate: tracking.failure_rate,
          availability_percent: tracking.availability_percent,
          violations: tracking.sla_violations
        }),
        null
      ]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      tracking
    });
  } catch (error: any) {
    await client.query('ROLLBACK');

    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        error: 'SLA tracking record already exists for this period'
      });
    }

    console.error('Track SLA error:', error);
    res.status(500).json({
      error: 'Failed to record SLA tracking'
    });
  } finally {
    client.release();
  }
});

export default router;
