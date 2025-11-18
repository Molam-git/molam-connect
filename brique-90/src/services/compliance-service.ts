// Compliance Case Service
// Core business logic for compliance case management

import { pool, withTransaction } from '../utils/db';
import { v4 as uuidv4 } from 'uuid';
import { createComplianceHold, releaseComplianceHold } from './ledger-integration';
import { requestSIRARecommendation } from './sira-integration';
import { evaluateAMLRules } from './rules-engine';

export interface CreateCaseRequest {
  origin_module: string;
  origin_entity_id?: string;
  origin_txn_id: string;
  origin_txn_type: string;
  case_type: string;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  hold_type?: 'soft_hold' | 'hard_hold' | 'freeze';
  reason?: string;
  amount?: number;
  currency?: string;
  beneficiary?: any;
  metadata?: any;
}

export interface CaseActionRequest {
  case_id: string;
  actor_id: string;
  actor_role: string;
  action: 'approve' | 'reject' | 'escalate' | 'request_more';
  note?: string;
  evidence_ids?: string[];
}

/**
 * Create compliance case (idempotent)
 */
export async function createComplianceCase(
  request: CreateCaseRequest
): Promise<any> {
  // Check for existing case on this transaction (idempotency)
  const existing = await getCaseByTransaction(request.origin_txn_id);
  if (existing) {
    console.log(`Returning existing case for transaction ${request.origin_txn_id}`);
    return existing;
  }

  return await withTransaction(async (client) => {
    // Generate reference code
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const shortId = uuidv4().substring(0, 8).toUpperCase();
    const reference_code = `CASE-${dateStr}-${shortId}`;

    // Determine risk level based on case type if not provided
    const risk_level = request.risk_level || determineRiskLevel(request.case_type);

    // Determine hold type if not provided
    const hold_type =
      request.hold_type ||
      (risk_level === 'critical' ? 'freeze' : risk_level === 'high' ? 'hard_hold' : 'soft_hold');

    // Create case
    const { rows: caseRows } = await client.query(
      `INSERT INTO compliance_cases (
        reference_code, origin_module, origin_entity_id, origin_txn_id, origin_txn_type,
        case_type, risk_level, current_hold_type, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'opened', $9)
      RETURNING *`,
      [
        reference_code,
        request.origin_module,
        request.origin_entity_id || null,
        request.origin_txn_id,
        request.origin_txn_type,
        request.case_type,
        risk_level,
        hold_type,
        JSON.stringify(request.metadata || {}),
      ]
    );

    const complianceCase = caseRows[0];

    // Create compliance hold
    await createComplianceHold({
      client,
      origin_txn_id: request.origin_txn_id,
      origin_txn_type: request.origin_txn_type,
      origin_amount: request.amount,
      origin_currency: request.currency,
      case_id: complianceCase.id,
      hold_type,
      hold_reason: request.reason || `Compliance review: ${request.case_type}`,
    });

    // Log audit
    await client.query(
      `INSERT INTO compliance_audit (
        case_id, origin_txn_id, actor_id, actor_role, action, action_category, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        complianceCase.id,
        request.origin_txn_id,
        null, // system
        'system',
        'case_created',
        'case_management',
        JSON.stringify({ reason: request.reason, hold_type }),
      ]
    );

    // Request SIRA recommendation (async - don't block)
    requestSIRARecommendation(complianceCase, request).catch((err) =>
      console.error('SIRA recommendation failed:', err)
    );

    console.log(`✅ Created compliance case ${reference_code} for transaction ${request.origin_txn_id}`);

    return complianceCase;
  });
}

/**
 * Get case by transaction ID
 */
export async function getCaseByTransaction(origin_txn_id: string): Promise<any | null> {
  const { rows } = await pool.query(
    `SELECT * FROM compliance_cases WHERE origin_txn_id = $1 LIMIT 1`,
    [origin_txn_id]
  );

  return rows[0] || null;
}

/**
 * Get case by ID with related data
 */
export async function getCaseById(case_id: string): Promise<any | null> {
  const { rows: caseRows } = await pool.query(
    `SELECT * FROM compliance_cases WHERE id = $1`,
    [case_id]
  );

  if (caseRows.length === 0) {
    return null;
  }

  const complianceCase = caseRows[0];

  // Get screening results
  const { rows: screeningRows } = await pool.query(
    `SELECT * FROM screening_results WHERE case_id = $1 ORDER BY created_at DESC`,
    [case_id]
  );

  // Get evidence
  const { rows: evidenceRows } = await pool.query(
    `SELECT * FROM compliance_evidence WHERE case_id = $1 ORDER BY created_at DESC`,
    [case_id]
  );

  // Get notes
  const { rows: notesRows } = await pool.query(
    `SELECT * FROM compliance_notes WHERE case_id = $1 ORDER BY created_at DESC`,
    [case_id]
  );

  // Get approvals
  const { rows: approvalRows } = await pool.query(
    `SELECT * FROM compliance_approvals WHERE case_id = $1 ORDER BY created_at DESC`,
    [case_id]
  );

  // Get holds
  const { rows: holdRows } = await pool.query(
    `SELECT * FROM compliance_holds WHERE case_id = $1 ORDER BY created_at DESC`,
    [case_id]
  );

  return {
    ...complianceCase,
    screening_results: screeningRows,
    evidence: evidenceRows,
    notes: notesRows,
    approvals: approvalRows,
    holds: holdRows,
  };
}

/**
 * Assign case to ops user
 */
export async function assignCase(
  case_id: string,
  assigned_to: string,
  assigned_by: string
): Promise<void> {
  await pool.query(
    `UPDATE compliance_cases
     SET assigned_to = $2, assigned_at = now(), status = 'in_review', updated_at = now()
     WHERE id = $1`,
    [case_id, assigned_to]
  );

  // Add note
  await pool.query(
    `INSERT INTO compliance_notes (case_id, author_id, author_role, note, action)
     VALUES ($1, $2, 'compliance_ops', $3, 'assign')`,
    [case_id, assigned_by, `Case assigned to user ${assigned_to}`]
  );

  // Audit
  await pool.query(
    `INSERT INTO compliance_audit (case_id, actor_id, actor_role, action, action_category, details)
     VALUES ($1, $2, 'compliance_ops', 'case_assigned', 'case_management', $3)`,
    [case_id, assigned_by, JSON.stringify({ assigned_to })]
  );
}

/**
 * Take action on case (approve/reject/escalate)
 */
export async function actionCase(request: CaseActionRequest): Promise<{
  success: boolean;
  requires_additional_approvals?: boolean;
  error?: string;
}> {
  const complianceCase = await getCaseById(request.case_id);

  if (!complianceCase) {
    return { success: false, error: 'Case not found' };
  }

  if (complianceCase.status === 'closed') {
    return { success: false, error: 'Case already closed' };
  }

  return await withTransaction(async (client) => {
    // Record approval/rejection
    await client.query(
      `INSERT INTO compliance_approvals (case_id, approver_id, approver_role, approval_type, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [request.case_id, request.actor_id, request.actor_role, request.action, request.note || null]
    );

    // Add note
    await client.query(
      `INSERT INTO compliance_notes (case_id, author_id, author_role, note, note_type, action)
       VALUES ($1, $2, $3, $4, 'decision', $5)`,
      [
        request.case_id,
        request.actor_id,
        request.actor_role,
        request.note || `Action: ${request.action}`,
        request.action,
      ]
    );

    // Check if multi-sig required
    const { rows: multiSigRows } = await client.query(
      `SELECT requires_multi_sig($1) as required`,
      [request.case_id]
    );

    const requiresMultiSig = multiSigRows[0]?.required;

    if (requiresMultiSig && request.action === 'approve') {
      console.log(`Case ${request.case_id} requires additional approvals`);
      return {
        success: true,
        requires_additional_approvals: true,
      };
    }

    // Execute final action
    if (request.action === 'approve') {
      await approveCase(client, complianceCase, request.actor_id);
    } else if (request.action === 'reject') {
      await rejectCase(client, complianceCase, request.actor_id);
    } else if (request.action === 'escalate') {
      await escalateCase(client, complianceCase, request.actor_id);
    }

    // Audit
    await client.query(
      `INSERT INTO compliance_audit (case_id, origin_txn_id, actor_id, actor_role, action, action_category, details)
       VALUES ($1, $2, $3, $4, $5, 'decision', $6)`,
      [
        request.case_id,
        complianceCase.origin_txn_id,
        request.actor_id,
        request.actor_role,
        `case_${request.action}d`,
        JSON.stringify({ note: request.note }),
      ]
    );

    return { success: true };
  });
}

/**
 * Approve case - release holds
 */
async function approveCase(client: any, complianceCase: any, actor_id: string): Promise<void> {
  // Update case status
  await client.query(
    `UPDATE compliance_cases
     SET status = 'actioned', resolution = 'approved',
         resolved_at = now(), resolved_by = $2, updated_at = now()
     WHERE id = $1`,
    [complianceCase.id, actor_id]
  );

  // Release compliance holds
  await releaseComplianceHold({
    client,
    origin_txn_id: complianceCase.origin_txn_id,
    case_id: complianceCase.id,
    released_by: actor_id,
    release_reason: 'Case approved by compliance ops',
  });

  console.log(`✅ Case ${complianceCase.reference_code} approved and holds released`);
}

/**
 * Reject case - block transaction
 */
async function rejectCase(client: any, complianceCase: any, actor_id: string): Promise<void> {
  // Update case status
  await client.query(
    `UPDATE compliance_cases
     SET status = 'actioned', resolution = 'rejected',
         resolved_at = now(), resolved_by = $2, updated_at = now()
     WHERE id = $1`,
    [complianceCase.id, actor_id]
  );

  // Keep hold active but mark as rejected
  // The payout/transaction will fail due to compliance rejection

  console.log(`❌ Case ${complianceCase.reference_code} rejected - transaction blocked`);
}

/**
 * Escalate case to higher tier
 */
async function escalateCase(client: any, complianceCase: any, actor_id: string): Promise<void> {
  await client.query(
    `UPDATE compliance_cases
     SET status = 'escalated', risk_level = 'critical',
         current_hold_type = 'freeze', updated_at = now()
     WHERE id = $1`,
    [complianceCase.id]
  );

  console.log(`⚠️  Case ${complianceCase.reference_code} escalated to critical`);
}

/**
 * List cases with filters
 */
export async function listCases(filters: {
  status?: string;
  assigned_to?: string;
  case_type?: string;
  risk_level?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  let query = `SELECT * FROM compliance_cases WHERE 1=1`;
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.status) {
    query += ` AND status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  if (filters.assigned_to) {
    query += ` AND assigned_to = $${paramIndex}`;
    params.push(filters.assigned_to);
    paramIndex++;
  }

  if (filters.case_type) {
    query += ` AND case_type = $${paramIndex}`;
    params.push(filters.case_type);
    paramIndex++;
  }

  if (filters.risk_level) {
    query += ` AND risk_level = $${paramIndex}`;
    params.push(filters.risk_level);
    paramIndex++;
  }

  query += ` ORDER BY priority DESC, created_at DESC`;
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(filters.limit || 50, filters.offset || 0);

  const { rows } = await pool.query(query, params);

  return rows;
}

/**
 * Determine risk level from case type
 */
function determineRiskLevel(case_type: string): 'low' | 'medium' | 'high' | 'critical' {
  const riskMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
    sanctions: 'critical',
    pep: 'high',
    adverse_media: 'high',
    threshold: 'medium',
    kyc_level: 'medium',
    other: 'low',
  };

  return riskMap[case_type] || 'medium';
}
