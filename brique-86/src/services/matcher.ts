// Reconciliation matching engine
// Implements multi-level matching strategy with configurable tolerance

import { pool, withTransaction } from '../utils/db';
import { recoLinesProcessed, measureDuration, recoLatency } from '../utils/metrics';

interface BankStatementLine {
  id: string;
  bank_profile_id: string;
  value_date: string;
  amount: number;
  currency: string;
  description: string;
  reference: string | null;
  provider_ref: string | null;
  beneficiary_name: string | null;
  transaction_type: string;
}

interface MatchResult {
  matched: boolean;
  reason?: string;
  severity?: string;
  candidates?: any[];
}

interface ReconciliationConfig {
  tolerance_pct: number;
  tolerance_cents: number;
  date_window_days: number;
  auto_match_threshold: number;
}

/**
 * Main matching function - attempts to reconcile a statement line
 * Returns match result or reason for manual review
 */
export async function matchLine(lineId: string, bankProfileId: string): Promise<MatchResult> {
  return measureDuration(
    recoLatency,
    { operation: 'match', bank_profile_id: bankProfileId },
    async () => {
      // Fetch the line
      const { rows: [line] } = await pool.query<BankStatementLine>(
        `SELECT * FROM bank_statement_lines WHERE id = $1`,
        [lineId]
      );

      if (!line) {
        return { matched: false, reason: 'line_not_found', severity: 'critical' };
      }

      // Get reconciliation config for this bank
      const config = await getReconciliationConfig(line.bank_profile_id);

      // Run matching passes in priority order
      // 1. Exact reference match
      const exactMatch = await matchByExactReference(line);
      if (exactMatch.matched) {
        await commitMatch(lineId, exactMatch.entityType!, exactMatch.entityId!, 1.0, 'exact_ref');
        recoLinesProcessed.inc({ bank_profile_id: bankProfileId, status: 'matched' });
        return { matched: true };
      }

      // 2. Provider reference match
      const providerMatch = await matchByProviderRef(line);
      if (providerMatch.matched) {
        await commitMatch(lineId, providerMatch.entityType!, providerMatch.entityId!, 0.99, 'provider_ref');
        recoLinesProcessed.inc({ bank_profile_id: bankProfileId, status: 'matched' });
        return { matched: true };
      }

      // 3. Fuzzy amount + date match
      const fuzzyMatch = await matchByAmountAndDate(line, config);
      if (fuzzyMatch.matched && fuzzyMatch.score! >= config.auto_match_threshold) {
        await commitMatch(lineId, fuzzyMatch.entityType!, fuzzyMatch.entityId!, fuzzyMatch.score!, 'fuzzy_amount_date');
        recoLinesProcessed.inc({ bank_profile_id: bankProfileId, status: 'matched' });
        return { matched: true };
      }

      // 4. Invoice payment match
      const invoiceMatch = await matchInvoicePayment(line);
      if (invoiceMatch.matched) {
        await commitMatch(lineId, 'invoice_payment', invoiceMatch.entityId!, 0.90, 'invoice_ref');
        recoLinesProcessed.inc({ bank_profile_id: bankProfileId, status: 'matched' });
        return { matched: true };
      }

      // No match found - determine reason
      if (fuzzyMatch.candidates && fuzzyMatch.candidates.length > 1) {
        return {
          matched: false,
          reason: 'multiple_candidates',
          severity: 'medium',
          candidates: fuzzyMatch.candidates,
        };
      }

      if (fuzzyMatch.candidates && fuzzyMatch.candidates.length === 1) {
        return {
          matched: false,
          reason: 'low_confidence',
          severity: 'medium',
          candidates: fuzzyMatch.candidates,
        };
      }

      // Check for suspicious patterns
      if (Math.abs(line.amount) > 100000) {
        return { matched: false, reason: 'high_amount_no_match', severity: 'high' };
      }

      return { matched: false, reason: 'no_candidate', severity: 'medium' };
    }
  );
}

/**
 * Match by exact reference code (highest confidence)
 */
async function matchByExactReference(line: BankStatementLine): Promise<any> {
  if (!line.reference) {
    return { matched: false };
  }

  // Try payouts first
  const { rows } = await pool.query(
    `SELECT id, status, amount, currency
     FROM payouts
     WHERE reference_code = $1
     AND currency = $2
     LIMIT 1`,
    [line.reference, line.currency]
  );

  if (rows.length > 0) {
    const payout = rows[0];
    // Verify amount matches (within small tolerance)
    if (Math.abs(Number(payout.amount) - Math.abs(line.amount)) < 0.01) {
      return { matched: true, entityType: 'payout', entityId: payout.id };
    }
  }

  return { matched: false };
}

/**
 * Match by provider reference (e.g., Stripe transfer ID)
 */
async function matchByProviderRef(line: BankStatementLine): Promise<any> {
  if (!line.provider_ref) {
    return { matched: false };
  }

  const { rows } = await pool.query(
    `SELECT id, status, amount, currency
     FROM payouts
     WHERE provider_ref = $1
     AND currency = $2
     LIMIT 1`,
    [line.provider_ref, line.currency]
  );

  if (rows.length > 0) {
    return { matched: true, entityType: 'payout', entityId: rows[0].id };
  }

  // Try wallet transactions
  const { rows: walletRows } = await pool.query(
    `SELECT id, amount, currency
     FROM wallet_transactions
     WHERE provider_ref = $1
     AND currency = $2
     LIMIT 1`,
    [line.provider_ref, line.currency]
  );

  if (walletRows.length > 0) {
    return { matched: true, entityType: 'wallet_txn', entityId: walletRows[0].id };
  }

  return { matched: false };
}

/**
 * Fuzzy match by amount and date window
 */
async function matchByAmountAndDate(line: BankStatementLine, config: ReconciliationConfig): Promise<any> {
  const amount = Math.abs(line.amount);

  // Calculate tolerance range
  const tolerancePct = config.tolerance_pct;
  const toleranceCents = config.tolerance_cents / 100; // Convert to currency units

  const minAmount = amount * (1 - tolerancePct) - toleranceCents;
  const maxAmount = amount * (1 + tolerancePct) + toleranceCents;

  // Calculate date window
  const dateWindow = config.date_window_days;
  const valueDate = new Date(line.value_date);
  const dateFrom = new Date(valueDate.getTime() - dateWindow * 24 * 60 * 60 * 1000);
  const dateTo = new Date(valueDate.getTime() + dateWindow * 24 * 60 * 60 * 1000);

  // Search for candidate payouts
  const { rows: candidates } = await pool.query(
    `SELECT id, amount, currency, reference_code, created_at, status
     FROM payouts
     WHERE currency = $1
     AND ABS(amount) BETWEEN $2 AND $3
     AND created_at BETWEEN $4 AND $5
     AND status IN ('sent', 'processing', 'in_transit')
     AND NOT EXISTS (
       SELECT 1 FROM reconciliation_matches
       WHERE matched_entity_id = payouts.id AND matched_type = 'payout'
     )
     ORDER BY ABS(ABS(amount) - $6) ASC
     LIMIT 10`,
    [line.currency, minAmount, maxAmount, dateFrom.toISOString(), dateTo.toISOString(), amount]
  );

  if (candidates.length === 0) {
    return { matched: false, candidates: [] };
  }

  if (candidates.length === 1) {
    // Single candidate - calculate confidence score
    const candidate = candidates[0];
    const score = calculateMatchScore(line, candidate);
    return { matched: true, entityType: 'payout', entityId: candidate.id, score, candidates };
  }

  // Multiple candidates - find best match
  let bestCandidate = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = calculateMatchScore(line, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (bestScore >= 0.85) {
    return { matched: true, entityType: 'payout', entityId: bestCandidate!.id, score: bestScore, candidates };
  }

  // Multiple candidates but low confidence
  return { matched: false, candidates, score: bestScore };
}

/**
 * Calculate match confidence score (0-1)
 */
function calculateMatchScore(line: BankStatementLine, candidate: any): number {
  let score = 0;

  // Amount proximity (40% weight)
  const amountDiff = Math.abs(Math.abs(line.amount) - Math.abs(Number(candidate.amount)));
  const amountScore = Math.max(0, 1 - (amountDiff / Math.abs(line.amount)));
  score += amountScore * 0.4;

  // Date proximity (30% weight)
  const lineDate = new Date(line.value_date).getTime();
  const candidateDate = new Date(candidate.created_at).getTime();
  const daysDiff = Math.abs(lineDate - candidateDate) / (24 * 60 * 60 * 1000);
  const dateScore = Math.max(0, 1 - (daysDiff / 7)); // 7 days max
  score += dateScore * 0.3;

  // Reference similarity (30% weight)
  let refScore = 0;
  if (line.reference && candidate.reference_code) {
    refScore = stringSimilarity(line.reference, candidate.reference_code);
  } else if (line.description && candidate.reference_code) {
    refScore = line.description.includes(candidate.reference_code) ? 0.5 : 0;
  }
  score += refScore * 0.3;

  return Math.min(1, score);
}

/**
 * Simple string similarity (Dice coefficient)
 */
function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const pairs1 = new Set<string>();
  const pairs2 = new Set<string>();

  for (let i = 0; i < s1.length - 1; i++) {
    pairs1.add(s1.substring(i, i + 2));
  }

  for (let i = 0; i < s2.length - 1; i++) {
    pairs2.add(s2.substring(i, i + 2));
  }

  const intersection = new Set([...pairs1].filter(x => pairs2.has(x)));
  return (2 * intersection.size) / (pairs1.size + pairs2.size);
}

/**
 * Match invoice payments by reference in description
 */
async function matchInvoicePayment(line: BankStatementLine): Promise<any> {
  const invoiceRef = extractInvoiceRef(line.description);
  if (!invoiceRef) {
    return { matched: false };
  }

  const { rows } = await pool.query(
    `SELECT id, invoice_id, amount
     FROM invoice_payments
     WHERE reference = $1
     LIMIT 1`,
    [invoiceRef]
  );

  if (rows.length > 0) {
    return { matched: true, entityId: rows[0].id };
  }

  return { matched: false };
}

function extractInvoiceRef(description: string): string | null {
  if (!description) return null;
  const match = description.match(/\b(INV-[A-Z0-9\-]+)\b/i);
  return match ? match[0] : null;
}

/**
 * Commit a successful match (atomic transaction)
 */
async function commitMatch(
  lineId: string,
  matchedType: string,
  entityId: string,
  score: number,
  rule: string
): Promise<void> {
  await withTransaction(async (client) => {
    // Insert reconciliation match
    await client.query(
      `INSERT INTO reconciliation_matches (
        bank_statement_line_id, matched_type, matched_entity_id, match_score, match_rule, reconciled_at
      ) VALUES ($1, $2, $3, $4, $5, now())`,
      [lineId, matchedType, entityId, score, rule]
    );

    // Update line status
    await client.query(
      `UPDATE bank_statement_lines
       SET reconciliation_status = 'matched', matched_at = now(), updated_at = now()
       WHERE id = $1`,
      [lineId]
    );

    // Update payout status if applicable
    if (matchedType === 'payout') {
      await client.query(
        `UPDATE payouts
         SET status = 'settled', settled_at = now(), updated_at = now()
         WHERE id = $1`,
        [entityId]
      );

      // Log reconciliation action
      await client.query(
        `INSERT INTO reconciliation_logs (actor, actor_type, action, details, created_at)
         VALUES ('system', 'system', 'auto_matched', $1, now())`,
        [JSON.stringify({ line_id: lineId, payout_id: entityId, rule, score })]
      );
    } else if (matchedType === 'invoice_payment') {
      await client.query(
        `UPDATE invoice_payments
         SET posted_at = now(), updated_at = now()
         WHERE id = $1`,
        [entityId]
      );
    }
  });
}

/**
 * Get reconciliation config for bank profile
 */
async function getReconciliationConfig(bankProfileId: string): Promise<ReconciliationConfig> {
  const { rows } = await pool.query<ReconciliationConfig>(
    `SELECT tolerance_pct, tolerance_cents, date_window_days, auto_match_threshold
     FROM reconciliation_config
     WHERE bank_profile_id = $1`,
    [bankProfileId]
  );

  if (rows.length > 0) {
    return rows[0];
  }

  // Default config
  return {
    tolerance_pct: 0.005, // 0.5%
    tolerance_cents: 100, // $1.00
    date_window_days: 2,
    auto_match_threshold: 0.85,
  };
}
