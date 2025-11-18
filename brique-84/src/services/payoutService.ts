/**
 * Brique 84 — Payouts Engine
 * Payout Service with Idempotency Support
 *
 * Features:
 * ✅ Idempotent payout creation (Idempotency-Key header)
 * ✅ Ledger hold creation before execution
 * ✅ SIRA routing integration
 * ✅ SLA calculation
 * ✅ Retry management
 * ✅ Complete audit trail
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

// =====================================================================
// TYPES
// =====================================================================

export interface CreatePayoutRequest {
  // Idempotency
  idempotencyKey?: string; // Client-provided (optional)

  // Origin
  originModule: 'connect' | 'wallet' | 'shop' | 'agents' | 'treasury' | 'refunds' | 'settlements';
  originEntityType: 'merchant' | 'user' | 'agent' | 'supplier';
  originEntityId: string;

  // Beneficiary
  beneficiaryType: 'merchant' | 'user' | 'agent' | 'supplier' | 'bank_account';
  beneficiaryId: string;
  beneficiaryAccountId?: string;

  // Amount
  amount: number;
  currency: string;

  // Routing
  payoutMethod: 'bank_transfer' | 'instant_transfer' | 'mobile_money' | 'wallet_credit' | 'card_payout' | 'check';
  priority?: 'batch' | 'standard' | 'instant' | 'priority';
  requestedSettlementDate?: string; // ISO date
  scheduledAt?: string; // ISO datetime

  // Bank
  bankConnectorId?: string;
  rail?: string;

  // Metadata
  metadata?: Record<string, any>;
  description?: string;
  internalNote?: string;

  // Multi-tenancy
  tenantType?: string;
  tenantId: string;
  country?: string;

  // Context
  createdBy?: string;
}

export interface Payout {
  id: string;
  external_id: string | null;
  origin_module: string;
  origin_entity_type: string;
  origin_entity_id: string;
  beneficiary_type: string;
  beneficiary_id: string;
  beneficiary_account_id: string | null;
  amount: number;
  currency: string;
  payout_method: string;
  priority: string;
  requested_settlement_date: string | null;
  scheduled_at: string | null;
  bank_connector_id: string | null;
  rail: string | null;
  bank_reference: string | null;
  status: string;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
  last_error: string | null;
  last_error_code: string | null;
  sla_target_settlement_date: string | null;
  sla_cutoff_time: string | null;
  sla_violated: boolean;
  sla_violation_reason: string | null;
  sira_routing_score: number | null;
  sira_routing_reason: any;
  sira_predicted_settlement_time: string | null;
  fee_amount: number;
  fee_currency: string | null;
  bank_fee: number;
  total_cost: number;
  metadata: any;
  description: string | null;
  internal_note: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  processed_at: string | null;
  sent_at: string | null;
  settled_at: string | null;
  failed_at: string | null;
  reversed_at: string | null;
  created_at: string;
  updated_at: string;
  tenant_type: string;
  tenant_id: string;
  country: string;
  compliance_status: string;
  compliance_note: string | null;
  ledger_hold_id: string | null;
  ledger_entry_id: string | null;
  reconciled: boolean;
  reconciled_at: string | null;
  reconciliation_id: string | null;
}

export interface PayoutHold {
  id: string;
  payout_id: string;
  ledger_hold_entry_id: string | null;
  hold_amount: number;
  currency: string;
  debit_account: string;
  credit_account: string;
  status: 'active' | 'released' | 'reversed' | 'expired';
  created_at: string;
  released_at: string | null;
  reversed_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  released_by: string | null;
  metadata: any;
  reason: string | null;
}

export interface SLARule {
  id: string;
  bank_connector_id: string | null;
  rail: string | null;
  country: string | null;
  currency: string | null;
  priority: string | null;
  cutoff_time: string | null;
  processing_days: number;
  settlement_days: number;
  exclude_weekends: boolean;
  exclude_holidays: boolean;
  base_fee: number;
  percentage_fee: number;
  minimum_fee: number;
  maximum_fee: number | null;
  description: string | null;
  metadata: any;
  active: boolean;
}

export interface PayoutAlert {
  id: string;
  payout_id: string | null;
  batch_id: string | null;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: any;
  notified: boolean;
  notified_at: string | null;
  notification_channels: string[] | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string;
}

// =====================================================================
// PAYOUT SERVICE
// =====================================================================

export class PayoutService {
  constructor(
    private pool: Pool,
    private redis: Redis,
    private siraClient?: any // SIRA routing client (optional)
  ) {}

  /**
   * Create a new payout with idempotency support
   * If idempotencyKey is provided and a payout already exists, returns existing payout
   */
  async createPayout(request: CreatePayoutRequest): Promise<Payout> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Check idempotency
      if (request.idempotencyKey) {
        const existing = await this.checkIdempotency(request.idempotencyKey, client);
        if (existing) {
          await client.query('COMMIT');
          return existing;
        }
      }

      // 2. Validate balance (if needed)
      await this.validateBalance(request, client);

      // 3. Get SIRA routing recommendation (if available)
      const siraRouting = await this.getSIRARouting(request);

      // 4. Calculate SLA target date
      const slaRule = await this.findSLARule(
        request.bankConnectorId,
        request.rail,
        request.country || 'US',
        request.currency,
        request.priority || 'standard',
        client
      );

      const slaTargetDate = await this.calculateSLATargetDate(
        request.bankConnectorId,
        request.rail,
        request.country || 'US',
        new Date(),
        client
      );

      // 5. Calculate fees
      const fees = this.calculateFees(request.amount, slaRule);

      // 6. Create payout record
      const payoutId = uuidv4();
      const insertResult = await client.query<Payout>(
        `INSERT INTO payouts (
          id, external_id, origin_module, origin_entity_type, origin_entity_id,
          beneficiary_type, beneficiary_id, beneficiary_account_id,
          amount, currency, payout_method, priority,
          requested_settlement_date, scheduled_at,
          bank_connector_id, rail,
          status, max_retries,
          sla_target_settlement_date, sla_cutoff_time,
          sira_routing_score, sira_routing_reason, sira_predicted_settlement_time,
          fee_amount, fee_currency, bank_fee,
          metadata, description, internal_note,
          created_by, tenant_type, tenant_id, country
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14,
          $15, $16,
          $17, $18,
          $19, $20,
          $21, $22, $23,
          $24, $25, $26,
          $27, $28, $29,
          $30, $31, $32, $33
        ) RETURNING *`,
        [
          payoutId,
          request.idempotencyKey || null,
          request.originModule,
          request.originEntityType,
          request.originEntityId,
          request.beneficiaryType,
          request.beneficiaryId,
          request.beneficiaryAccountId || null,
          request.amount,
          request.currency,
          request.payoutMethod,
          request.priority || 'standard',
          request.requestedSettlementDate || null,
          request.scheduledAt || null,
          siraRouting?.recommendedBankConnectorId || request.bankConnectorId || null,
          siraRouting?.recommendedRail || request.rail || null,
          request.scheduledAt ? 'scheduled' : 'pending',
          3, // max_retries
          slaTargetDate,
          slaRule?.cutoff_time || null,
          siraRouting?.score || null,
          siraRouting?.reason || null,
          siraRouting?.predictedSettlementTime || null,
          fees.feeAmount,
          request.currency,
          fees.bankFee,
          request.metadata || null,
          request.description || null,
          request.internalNote || null,
          request.createdBy || null,
          request.tenantType || 'merchant',
          request.tenantId,
          request.country || 'US'
        ]
      );

      const payout = insertResult.rows[0];

      // 7. Create ledger hold
      const hold = await this.createLedgerHold(payout, client);

      // 8. Update payout with hold reference
      await client.query(
        `UPDATE payouts SET ledger_hold_id = $1 WHERE id = $2`,
        [hold.id, payoutId]
      );

      // 9. Log audit event
      await this.logAuditEvent(
        payoutId,
        'created',
        null,
        'pending',
        {
          idempotency_key: request.idempotencyKey,
          sira_routing: siraRouting,
          hold_id: hold.id
        },
        'system',
        null,
        'payouts-service',
        client
      );

      // 10. Cache idempotency key (if provided)
      if (request.idempotencyKey) {
        await this.cacheIdempotency(request.idempotencyKey, payoutId);
      }

      // 11. Create alert if high-value payout
      if (request.amount >= 10000) {
        await this.createAlert(
          payoutId,
          'high_value',
          'high',
          `High-value payout: ${request.currency} ${request.amount.toLocaleString()}`,
          { amount: request.amount, currency: request.currency },
          client
        );
      }

      await client.query('COMMIT');

      // Return complete payout with hold reference
      return { ...payout, ledger_hold_id: hold.id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if idempotency key already exists
   */
  private async checkIdempotency(
    idempotencyKey: string,
    client: any
  ): Promise<Payout | null> {
    // Check cache first (fast path)
    const cachedPayoutId = await this.redis.get(`idempotency:${idempotencyKey}`);
    if (cachedPayoutId) {
      const result = await client.query<Payout>(
        'SELECT * FROM payouts WHERE id = $1',
        [cachedPayoutId]
      );
      return result.rows[0] || null;
    }

    // Check database (slower path)
    const result = await client.query<Payout>(
      'SELECT * FROM payouts WHERE external_id = $1',
      [idempotencyKey]
    );

    if (result.rows.length > 0) {
      // Cache for next time
      await this.cacheIdempotency(idempotencyKey, result.rows[0].id);
      return result.rows[0];
    }

    return null;
  }

  /**
   * Cache idempotency key mapping (24 hour TTL)
   */
  private async cacheIdempotency(idempotencyKey: string, payoutId: string): Promise<void> {
    await this.redis.setex(`idempotency:${idempotencyKey}`, 86400, payoutId);
  }

  /**
   * Validate sufficient balance for payout
   */
  private async validateBalance(request: CreatePayoutRequest, client: any): Promise<void> {
    // Query tenant's available balance from Treasury (Brique 34)
    const balanceResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as available_balance
       FROM ledger_entries
       WHERE account_id = $1 AND status = 'posted'`,
      [`${request.tenantType}:${request.tenantId}:available_balance`]
    );

    const availableBalance = parseFloat(balanceResult.rows[0]?.available_balance || '0');

    if (availableBalance < request.amount) {
      throw new Error(
        `Insufficient balance. Available: ${availableBalance}, Required: ${request.amount}`
      );
    }
  }

  /**
   * Get SIRA routing recommendation
   */
  private async getSIRARouting(request: CreatePayoutRequest): Promise<any> {
    if (!this.siraClient) {
      return null;
    }

    try {
      // Call SIRA for routing recommendation
      const features = {
        amount: request.amount,
        currency: request.currency,
        beneficiary_country: request.country || 'US',
        priority: request.priority || 'standard',
        payout_method: request.payoutMethod
      };

      const prediction = await this.siraClient.predict({
        model_name: 'payout-router-v1',
        entity_type: 'payout',
        features
      });

      return {
        score: prediction.score,
        recommendedBankConnectorId: prediction.recommendation?.bank_connector_id,
        recommendedRail: prediction.recommendation?.rail,
        reason: prediction.explanation,
        predictedSettlementTime: prediction.recommendation?.estimated_settlement_time
      };
    } catch (error) {
      console.error('SIRA routing failed:', error);
      return null;
    }
  }

  /**
   * Find matching SLA rule
   */
  private async findSLARule(
    bankConnectorId: string | undefined,
    rail: string | undefined,
    country: string,
    currency: string,
    priority: string,
    client: any
  ): Promise<SLARule | null> {
    const result = await client.query<SLARule>(
      `SELECT * FROM payout_sla_rules
       WHERE active = true
         AND (bank_connector_id = $1 OR bank_connector_id IS NULL)
         AND (rail = $2 OR rail IS NULL)
         AND (country = $3 OR country IS NULL)
         AND (currency = $4 OR currency IS NULL)
         AND (priority = $5 OR priority IS NULL)
       ORDER BY
         bank_connector_id IS NOT NULL DESC,
         rail IS NOT NULL DESC,
         country IS NOT NULL DESC,
         currency IS NOT NULL DESC,
         priority IS NOT NULL DESC
       LIMIT 1`,
      [bankConnectorId || null, rail || null, country, currency, priority]
    );

    return result.rows[0] || null;
  }

  /**
   * Calculate SLA target settlement date
   */
  private async calculateSLATargetDate(
    bankConnectorId: string | undefined,
    rail: string | undefined,
    country: string,
    createdAt: Date,
    client: any
  ): Promise<string> {
    const result = await client.query<{ calculate_target_settlement_date: string }>(
      `SELECT calculate_target_settlement_date($1, $2, $3, $4) as target_date`,
      [bankConnectorId || null, rail || null, country, createdAt.toISOString()]
    );

    return result.rows[0]?.calculate_target_settlement_date || this.addBusinessDays(createdAt, 2);
  }

  /**
   * Calculate fees based on SLA rule
   */
  private calculateFees(
    amount: number,
    slaRule: SLARule | null
  ): { feeAmount: number; bankFee: number } {
    if (!slaRule) {
      return { feeAmount: 0, bankFee: 0 };
    }

    let feeAmount = slaRule.base_fee + amount * slaRule.percentage_fee;

    // Apply min/max caps
    if (feeAmount < slaRule.minimum_fee) {
      feeAmount = slaRule.minimum_fee;
    }
    if (slaRule.maximum_fee && feeAmount > slaRule.maximum_fee) {
      feeAmount = slaRule.maximum_fee;
    }

    return {
      feeAmount: Math.round(feeAmount * 100) / 100,
      bankFee: 0 // To be updated after bank submission
    };
  }

  /**
   * Create ledger hold for payout
   */
  private async createLedgerHold(payout: Payout, client: any): Promise<PayoutHold> {
    const holdId = uuidv4();

    // 1. Create hold record
    const result = await client.query<PayoutHold>(
      `INSERT INTO payout_holds (
        id, payout_id, hold_amount, currency,
        debit_account, credit_account,
        status, expires_at, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        holdId,
        payout.id,
        payout.total_cost,
        payout.currency,
        `${payout.tenant_type}:${payout.tenant_id}:available_balance`,
        'payouts:pending',
        'active',
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Expire in 7 days
        `Payout hold for ${payout.description || payout.id}`
      ]
    );

    const hold = result.rows[0];

    // 2. Create ledger entry in Treasury (Brique 34)
    // This would integrate with the Treasury service to create a hold entry
    // For now, we just log it
    await this.logAuditEvent(
      payout.id,
      'hold_created',
      null,
      null,
      { hold_id: holdId, amount: payout.total_cost },
      'system',
      null,
      'payouts-service',
      client
    );

    return hold;
  }

  /**
   * Release ledger hold after successful payout
   */
  async releaseHold(payoutId: string, userId?: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Update hold status
      await client.query(
        `UPDATE payout_holds
         SET status = 'released', released_at = NOW(), released_by = $1
         WHERE payout_id = $2 AND status = 'active'`,
        [userId || null, payoutId]
      );

      // Log audit event
      await this.logAuditEvent(
        payoutId,
        'hold_released',
        null,
        null,
        { released_by: userId },
        'system',
        userId || null,
        'payouts-service',
        client
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reverse ledger hold (payout failed or cancelled)
   */
  async reverseHold(payoutId: string, reason: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Update hold status
      await client.query(
        `UPDATE payout_holds
         SET status = 'reversed', reversed_at = NOW(), reason = $1
         WHERE payout_id = $2 AND status = 'active'`,
        [reason, payoutId]
      );

      // Log audit event
      await this.logAuditEvent(
        payoutId,
        'hold_reversed',
        null,
        null,
        { reason },
        'system',
        null,
        'payouts-service',
        client
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update payout status
   */
  async updateStatus(
    payoutId: string,
    newStatus: string,
    details?: {
      bankReference?: string;
      errorMessage?: string;
      errorCode?: string;
    }
  ): Promise<Payout> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const updates: string[] = ['status = $1', 'updated_at = NOW()'];
      const values: any[] = [newStatus];
      let paramIndex = 2;

      // Set timestamp based on status
      if (newStatus === 'processing') {
        updates.push(`processed_at = NOW()`);
      } else if (newStatus === 'sent') {
        updates.push(`sent_at = NOW()`);
        if (details?.bankReference) {
          updates.push(`bank_reference = $${paramIndex++}`);
          values.push(details.bankReference);
        }
      } else if (newStatus === 'settled') {
        updates.push(`settled_at = NOW()`);
      } else if (newStatus === 'failed') {
        updates.push(`failed_at = NOW()`);
        if (details?.errorMessage) {
          updates.push(`last_error = $${paramIndex++}`);
          values.push(details.errorMessage);
        }
        if (details?.errorCode) {
          updates.push(`last_error_code = $${paramIndex++}`);
          values.push(details.errorCode);
        }
      } else if (newStatus === 'reversed') {
        updates.push(`reversed_at = NOW()`);
      }

      values.push(payoutId);

      const result = await client.query<Payout>(
        `UPDATE payouts
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      const payout = result.rows[0];

      // Handle hold lifecycle
      if (newStatus === 'settled') {
        await this.releaseHold(payoutId);
      } else if (newStatus === 'failed' || newStatus === 'reversed') {
        await this.reverseHold(payoutId, details?.errorMessage || 'Payout failed');
      }

      await client.query('COMMIT');

      return payout;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Schedule retry for failed payout
   */
  async scheduleRetry(payoutId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get current payout
      const payoutResult = await client.query<Payout>(
        'SELECT * FROM payouts WHERE id = $1',
        [payoutId]
      );

      const payout = payoutResult.rows[0];

      if (!payout) {
        throw new Error(`Payout not found: ${payoutId}`);
      }

      if (payout.retry_count >= payout.max_retries) {
        // Move to DLQ
        await client.query(
          `UPDATE payouts SET status = 'dlq', updated_at = NOW() WHERE id = $1`,
          [payoutId]
        );

        await this.createAlert(
          payoutId,
          'dlq',
          'critical',
          `Payout moved to DLQ after ${payout.retry_count} retries`,
          { last_error: payout.last_error },
          client
        );

        await this.logAuditEvent(
          payoutId,
          'status_changed',
          'failed',
          'dlq',
          { reason: 'Max retries exhausted' },
          'system',
          null,
          'payouts-service',
          client
        );
      } else {
        // Calculate next retry time with exponential backoff
        const nextRetryResult = await client.query<{ next_retry: string }>(
          'SELECT calculate_next_retry($1) as next_retry',
          [payout.retry_count]
        );

        const nextRetryAt = nextRetryResult.rows[0].next_retry;

        // Update payout
        await client.query(
          `UPDATE payouts
           SET retry_count = retry_count + 1,
               next_retry_at = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [nextRetryAt, payoutId]
        );

        // Log retry
        await client.query(
          `INSERT INTO payout_retry_log (
            payout_id, retry_number, status, error_message,
            next_retry_at, backoff_seconds
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            payoutId,
            payout.retry_count + 1,
            'failed',
            payout.last_error,
            nextRetryAt,
            Math.pow(2, payout.retry_count) * 60
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get payout by ID
   */
  async getById(payoutId: string): Promise<Payout | null> {
    const result = await this.pool.query<Payout>(
      'SELECT * FROM payouts WHERE id = $1',
      [payoutId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get payout by idempotency key
   */
  async getByIdempotencyKey(idempotencyKey: string): Promise<Payout | null> {
    const result = await this.pool.query<Payout>(
      'SELECT * FROM payouts WHERE external_id = $1',
      [idempotencyKey]
    );
    return result.rows[0] || null;
  }

  /**
   * List payouts with filters
   */
  async list(filters: {
    tenantId?: string;
    tenantType?: string;
    status?: string;
    beneficiaryId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ payouts: Payout[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters.tenantId) {
      conditions.push(`tenant_id = $${paramIndex++}`);
      values.push(filters.tenantId);
    }

    if (filters.tenantType) {
      conditions.push(`tenant_type = $${paramIndex++}`);
      values.push(filters.tenantType);
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters.beneficiaryId) {
      conditions.push(`beneficiary_id = $${paramIndex++}`);
      values.push(filters.beneficiaryId);
    }

    if (filters.fromDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(filters.fromDate);
    }

    if (filters.toDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(filters.toDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM payouts ${whereClause}`,
      values
    );

    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const dataResult = await this.pool.query<Payout>(
      `SELECT * FROM payouts ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, limit, offset]
    );

    return {
      payouts: dataResult.rows,
      total
    };
  }

  /**
   * Create alert
   */
  private async createAlert(
    payoutId: string,
    alertType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    message: string,
    details: any,
    client: any
  ): Promise<void> {
    await client.query(
      `INSERT INTO payout_alerts (
        payout_id, alert_type, severity, message, details
      ) VALUES ($1, $2, $3, $4, $5)`,
      [payoutId, alertType, severity, message, details]
    );
  }

  /**
   * Log audit event
   */
  private async logAuditEvent(
    payoutId: string,
    eventType: string,
    oldStatus: string | null,
    newStatus: string | null,
    changeDetails: any,
    actorType: string,
    actorId: string | null,
    serviceName: string,
    client: any
  ): Promise<void> {
    await client.query(
      `INSERT INTO payout_audit_log (
        payout_id, event_type, old_status, new_status,
        change_details, actor_type, actor_id, service_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [payoutId, eventType, oldStatus, newStatus, changeDetails, actorType, actorId, serviceName]
    );
  }

  /**
   * Helper: Add business days to date
   */
  private addBusinessDays(date: Date, days: number): string {
    const result = new Date(date);
    let addedDays = 0;

    while (addedDays < days) {
      result.setDate(result.getDate() + 1);
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (result.getDay() !== 0 && result.getDay() !== 6) {
        addedDays++;
      }
    }

    return result.toISOString().split('T')[0];
  }
}
