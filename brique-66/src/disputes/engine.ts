import { pool } from '../utils/db';

export interface CreateDisputeInput {
  connectTxId: string;
  merchantId: string;
  customerId?: string;
  amount: number;
  currency: string;
  reason: string;
  disputeType?: 'chargeback' | 'inquiry' | 'retrieval' | 'fraud_claim';
  networkRef?: string;
  networkName?: string;
  dueDate?: Date;
}

export interface Dispute {
  id: string;
  connect_tx_id: string;
  merchant_id: string;
  customer_id?: string;
  amount: number;
  currency: string;
  reason: string;
  dispute_type: string;
  status: string;
  evidence: any;
  network_ref?: string;
  network_name?: string;
  due_date?: Date;
  initiated_at: Date;
  resolved_at?: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create a new dispute
 */
export async function createDispute(input: CreateDisputeInput): Promise<Dispute> {
  const {
    connectTxId,
    merchantId,
    customerId,
    amount,
    currency,
    reason,
    disputeType = 'chargeback',
    networkRef,
    networkName,
    dueDate,
  } = input;

  const { rows } = await pool.query<Dispute>(
    `INSERT INTO disputes(
      connect_tx_id, merchant_id, customer_id, amount, currency,
      reason, dispute_type, network_ref, network_name, due_date
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      connectTxId,
      merchantId,
      customerId || null,
      amount,
      currency,
      reason,
      disputeType,
      networkRef || null,
      networkName || null,
      dueDate || null,
    ]
  );

  // Audit log
  await pool.query(
    `INSERT INTO molam_audit_logs(brique_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'brique-66',
      'dispute_created',
      'dispute',
      rows[0].id,
      JSON.stringify({
        connect_tx_id: connectTxId,
        merchant_id: merchantId,
        amount,
        reason,
      }),
    ]
  );

  // Create initial bank fee (if applicable)
  if (disputeType === 'chargeback') {
    await pool.query(
      `INSERT INTO dispute_fees(dispute_id, fee_type, amount, currency)
       VALUES ($1, 'bank_fee', $2, $3)`,
      [rows[0].id, 15.00, currency] // $15 standard chargeback fee
    );
  }

  return rows[0];
}

/**
 * Submit evidence for a dispute
 */
export async function submitEvidence(
  disputeId: string,
  actor: string,
  evidence: any
): Promise<Dispute> {
  const { rows } = await pool.query<Dispute>(
    `UPDATE disputes
     SET evidence = $2,
         status = 'evidence_submitted',
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [disputeId, JSON.stringify(evidence)]
  );

  if (rows.length === 0) {
    throw new Error('Dispute not found');
  }

  // Log action
  await pool.query(
    `INSERT INTO dispute_logs(dispute_id, actor, action, details)
     VALUES ($1, $2, 'submit_evidence', $3)`,
    [disputeId, actor, JSON.stringify({ evidence })]
  );

  return rows[0];
}

/**
 * Add evidence document
 */
export async function addEvidenceDocument(
  disputeId: string,
  evidenceType: string,
  fileUrl: string,
  fileName: string,
  mimeType: string,
  uploadedBy: string,
  notes?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO dispute_evidence(dispute_id, evidence_type, file_url, file_name, mime_type, notes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [disputeId, evidenceType, fileUrl, fileName, mimeType, notes || null, uploadedBy]
  );

  // Log action
  await pool.query(
    `INSERT INTO dispute_logs(dispute_id, actor, action, details)
     VALUES ($1, $2, 'evidence_uploaded', $3)`,
    [
      disputeId,
      uploadedBy,
      JSON.stringify({ evidence_type: evidenceType, file_name: fileName }),
    ]
  );
}

/**
 * Resolve a dispute
 */
export async function resolveDispute(
  disputeId: string,
  actor: string,
  outcome: 'won' | 'lost',
  notes?: string
): Promise<Dispute> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update dispute status
    const { rows } = await client.query<Dispute>(
      `UPDATE disputes
       SET status = $2,
           resolved_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [disputeId, outcome]
    );

    if (rows.length === 0) {
      throw new Error('Dispute not found');
    }

    const dispute = rows[0];

    // Handle fees based on outcome
    if (outcome === 'lost') {
      // Charge the chargeback loss
      await client.query(
        `INSERT INTO dispute_fees(dispute_id, fee_type, amount, currency, status)
         VALUES ($1, 'chargeback_loss', $2, $3, 'charged')`,
        [disputeId, dispute.amount, dispute.currency]
      );

      // Mark bank fee as charged
      await client.query(
        `UPDATE dispute_fees
         SET status = 'charged', charged_at = NOW()
         WHERE dispute_id = $1 AND fee_type = 'bank_fee'`,
        [disputeId]
      );
    } else if (outcome === 'won') {
      // Waive bank fee
      await client.query(
        `UPDATE dispute_fees
         SET status = 'waived'
         WHERE dispute_id = $1 AND fee_type = 'bank_fee'`,
        [disputeId]
      );
    }

    // Log resolution
    await client.query(
      `INSERT INTO dispute_logs(dispute_id, actor, action, details)
       VALUES ($1, $2, 'resolve', $3)`,
      [disputeId, actor, JSON.stringify({ outcome, notes })]
    );

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs(brique_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'brique-66',
        'dispute_resolved',
        'dispute',
        disputeId,
        JSON.stringify({ outcome, amount: dispute.amount }),
      ]
    );

    await client.query('COMMIT');
    return dispute;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get dispute by ID
 */
export async function getDisputeById(disputeId: string): Promise<Dispute | null> {
  const { rows } = await pool.query<Dispute>('SELECT * FROM disputes WHERE id = $1', [disputeId]);

  return rows.length > 0 ? rows[0] : null;
}

/**
 * List disputes for a merchant
 */
export async function listDisputesByMerchant(
  merchantId: string,
  filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<Dispute[]> {
  const { status, limit = 100, offset = 0 } = filters || {};

  let query = 'SELECT * FROM disputes WHERE merchant_id = $1';
  const params: any[] = [merchantId];
  let paramIndex = 2;

  if (status) {
    query += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const { rows } = await pool.query<Dispute>(query, params);
  return rows;
}

/**
 * Get dispute statistics for a merchant
 */
export async function getDisputeStats(merchantId: string): Promise<any> {
  const { rows } = await pool.query(
    `SELECT
      COUNT(*) as total_disputes,
      COUNT(*) FILTER (WHERE status = 'won') as won_count,
      COUNT(*) FILTER (WHERE status = 'lost') as lost_count,
      COUNT(*) FILTER (WHERE status IN ('open','evidence_submitted','under_review')) as pending_count,
      SUM(amount) as total_amount,
      SUM(amount) FILTER (WHERE status = 'lost') as lost_amount,
      ROUND(
        COUNT(*) FILTER (WHERE status = 'won')::NUMERIC * 100 / NULLIF(COUNT(*) FILTER (WHERE status IN ('won','lost')), 0),
        2
      ) as win_rate_pct
     FROM disputes
     WHERE merchant_id = $1`,
    [merchantId]
  );

  return rows[0];
}

/**
 * Update dispute status
 */
export async function updateDisputeStatus(
  disputeId: string,
  status: string,
  actor: string
): Promise<Dispute> {
  const { rows } = await pool.query<Dispute>(
    `UPDATE disputes
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [disputeId, status]
  );

  if (rows.length === 0) {
    throw new Error('Dispute not found');
  }

  await pool.query(
    `INSERT INTO dispute_logs(dispute_id, actor, action, details)
     VALUES ($1, $2, 'status_updated', $3)`,
    [disputeId, actor, JSON.stringify({ new_status: status })]
  );

  return rows[0];
}

/**
 * Get evidence for a dispute
 */
export async function getDisputeEvidence(disputeId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM dispute_evidence WHERE dispute_id = $1 ORDER BY uploaded_at DESC`,
    [disputeId]
  );

  return rows;
}

/**
 * Get dispute logs
 */
export async function getDisputeLogs(disputeId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM dispute_logs WHERE dispute_id = $1 ORDER BY created_at DESC`,
    [disputeId]
  );

  return rows;
}

/**
 * Get dispute fees
 */
export async function getDisputeFees(disputeId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM dispute_fees WHERE dispute_id = $1 ORDER BY created_at`,
    [disputeId]
  );

  return rows;
}