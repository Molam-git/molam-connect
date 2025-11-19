// ============================================================================
// Brique 122 — Statement Reconciliation Worker
// ============================================================================
// Purpose: Automated reconciliation of bank statement lines with payouts
// Features: Multi-level matching, anomaly detection, SIRA integration
// ============================================================================

import { Pool } from 'pg';
import {
  BankStatementLine,
  PayoutSlice,
  MatchCandidate,
  ReconciliationResult,
  ReconciliationConfig,
  MatchingOptions
} from '../types';
import { createExactMatcher } from '../matchers/exact-matcher';
import { createFuzzyMatcher } from '../matchers/fuzzy-matcher';
import { detectDuplicates } from '../utils/duplicate-detector';
import { detectAnomalies } from '../utils/anomaly-detector';
import { sendToSIRA } from '../utils/sira-client';
import { emitWebhook } from '../utils/webhook-emitter';
import { recordAudit } from '../utils/audit-logger';
import { updateMetrics } from '../utils/metrics-updater';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ReconciliationConfig = {
  batch_size: 50,
  max_retry_attempts: 3,
  retry_delay_ms: 5000,
  enable_fuzzy_matching: true,
  enable_sira_scoring: true,
  enable_auto_matching: true,
  auto_match_confidence_threshold: 95,
  anomaly_score_threshold: 70,
  duplicate_detection_enabled: true,
  webhook_enabled: true,
  metrics_enabled: true
};

const DEFAULT_MATCHING_OPTIONS: MatchingOptions = {
  amount_tolerance: 0.01,
  date_range_days: 30,
  require_reference: false,
  enable_fuzzy_reference: true,
  fuzzy_threshold: 0.8,
  max_candidates: 10
};

/**
 * Main reconciliation worker
 */
export class ReconciliationWorker {
  private config: ReconciliationConfig;
  private matchingOptions: MatchingOptions;
  private isRunning: boolean = false;

  constructor(
    config: Partial<ReconciliationConfig> = {},
    matchingOptions: Partial<MatchingOptions> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.matchingOptions = { ...DEFAULT_MATCHING_OPTIONS, ...matchingOptions };
  }

  /**
   * Start reconciliation worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Reconciliation worker already running');
      return;
    }

    this.isRunning = true;
    console.log('✅ Reconciliation worker started');

    while (this.isRunning) {
      try {
        await this.processNextBatch();
        await this.sleep(this.config.retry_delay_ms);
      } catch (error: any) {
        console.error('❌ Reconciliation worker error:', error);
        await this.sleep(this.config.retry_delay_ms * 2);
      }
    }
  }

  /**
   * Stop worker
   */
  stop(): void {
    this.isRunning = false;
    console.log('⏹️  Reconciliation worker stopped');
  }

  /**
   * Process next batch of unmatched lines
   */
  async processNextBatch(): Promise<number> {
    const startTime = Date.now();

    // Fetch unmatched lines
    const { rows: lines } = await pool.query<BankStatementLine>(
      `SELECT * FROM bank_statement_lines
       WHERE reconciliation_status = 'unmatched'
       AND reconciliation_attempts < $1
       ORDER BY statement_date ASC, created_at ASC
       LIMIT $2`,
      [this.config.max_retry_attempts, this.config.batch_size]
    );

    if (lines.length === 0) {
      return 0;
    }

    console.log(`📊 Processing ${lines.length} unmatched lines...`);

    let matched = 0;
    let anomalies = 0;
    let duplicates = 0;

    for (const line of lines) {
      try {
        const result = await this.reconcileLine(line);

        if (result.matched) {
          matched++;
        } else if (line.is_duplicate) {
          duplicates++;
        } else if (result.requires_review) {
          anomalies++;
        }
      } catch (error: any) {
        console.error(`Error reconciling line ${line.id}:`, error.message);
        await this.markLineError(line.id, error.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Batch processed: ${matched} matched, ${anomalies} anomalies, ${duplicates} duplicates (${duration}ms)`);

    return lines.length;
  }

  /**
   * Reconcile single line
   */
  private async reconcileLine(line: BankStatementLine): Promise<ReconciliationResult> {
    const startTime = Date.now();

    // Increment attempt count
    await pool.query(
      `UPDATE bank_statement_lines
       SET reconciliation_attempts = reconciliation_attempts + 1,
           last_reconciliation_attempt = now()
       WHERE id = $1`,
      [line.id]
    );

    // Step 1: Check for duplicates
    if (this.config.duplicate_detection_enabled) {
      const duplicate = await detectDuplicates(line);
      if (duplicate) {
        await this.markAsDuplicate(line.id, duplicate.id);
        return {
          matched: false,
          confidence: 0,
          method: 'exact',
          candidates: [],
          anomalies: ['duplicate'],
          requires_review: false
        };
      }
    }

    // Step 2: Find candidate payout slices
    const candidates = await this.findCandidates(line);

    // Step 3: Exact matching
    const exactMatcher = createExactMatcher(this.matchingOptions);
    const exactMatch = exactMatcher.match(line, candidates);

    if (exactMatch && exactMatch.confidence >= 100) {
      return await this.processMatch(line, exactMatch.slice, 100, 'exact');
    }

    // Step 4: Fuzzy matching (if enabled)
    if (this.config.enable_fuzzy_matching && candidates.length > 0) {
      const fuzzyMatcher = createFuzzyMatcher(this.matchingOptions);
      const fuzzyMatch = fuzzyMatcher.match(line, candidates);

      if (fuzzyMatch && fuzzyMatch.confidence >= this.config.auto_match_confidence_threshold) {
        return await this.processMatch(line, fuzzyMatch.slice, fuzzyMatch.confidence, 'fuzzy');
      }
    }

    // Step 5: Anomaly detection
    const anomalies = detectAnomalies(line, candidates);

    // Step 6: SIRA scoring (if enabled and anomalies detected)
    let anomalyScore = 0;
    if (this.config.enable_sira_scoring && anomalies.length > 0) {
      const siraResponse = await sendToSIRA('reconciliation.anomaly', {
        line,
        candidates,
        anomalies
      });
      anomalyScore = siraResponse.score;
    }

    // Step 7: Determine final action
    const requiresReview = anomalyScore >= this.config.anomaly_score_threshold || candidates.length > 1;

    if (requiresReview) {
      await this.markForManualReview(line, candidates, anomalies, anomalyScore);
    } else if (candidates.length === 0) {
      await this.markAsNoMatch(line);
    }

    // Update metrics
    const duration = Date.now() - startTime;
    if (this.config.metrics_enabled) {
      await updateMetrics(line.bank_profile_id, {
        total_lines_processed: 1,
        avg_reconciliation_time_ms: duration
      });
    }

    return {
      matched: false,
      confidence: candidates.length > 0 ? candidates[0].confidence : 0,
      method: 'exact',
      candidates,
      anomalies,
      requires_review: requiresReview
    };
  }

  /**
   * Find candidate payout slices for matching
   */
  private async findCandidates(line: BankStatementLine): Promise<MatchCandidate[]> {
    const dateFrom = new Date(line.statement_date);
    dateFrom.setDate(dateFrom.getDate() - this.matchingOptions.date_range_days);

    const dateTo = new Date(line.statement_date);
    dateTo.setDate(dateTo.getDate() + this.matchingOptions.date_range_days);

    const { rows: slices } = await pool.query<PayoutSlice>(
      `SELECT ps.*
       FROM payout_slices ps
       WHERE ps.currency = $1
       AND ABS(ps.slice_amount - $2) <= $3
       AND ps.status IN ('sent', 'pending')
       AND ps.created_at BETWEEN $4 AND $5
       ORDER BY ABS(ps.slice_amount - $2) ASC, ps.created_at DESC
       LIMIT $6`,
      [
        line.currency,
        Math.abs(line.amount),
        this.matchingOptions.amount_tolerance,
        dateFrom.toISOString(),
        dateTo.toISOString(),
        this.matchingOptions.max_candidates
      ]
    );

    return slices.map(slice => ({
      slice,
      confidence: this.calculateInitialConfidence(line, slice),
      match_reasons: [],
      differences: []
    }));
  }

  /**
   * Calculate initial confidence score
   */
  private calculateInitialConfidence(line: BankStatementLine, slice: PayoutSlice): number {
    let confidence = 0;

    // Amount match
    const amountDiff = Math.abs(Math.abs(line.amount) - slice.slice_amount);
    if (amountDiff < 0.01) confidence += 50;
    else if (amountDiff < this.matchingOptions.amount_tolerance) confidence += 30;

    // Currency match
    if (line.currency === slice.currency) confidence += 20;

    // Reference match
    if (line.reference && slice.reference_code && line.reference === slice.reference_code) {
      confidence += 30;
    }

    return Math.min(confidence, 100);
  }

  /**
   * Process successful match
   */
  private async processMatch(
    line: BankStatementLine,
    slice: PayoutSlice,
    confidence: number,
    method: string
  ): Promise<ReconciliationResult> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Update statement line
      await client.query(
        `UPDATE bank_statement_lines
         SET reconciliation_status = 'matched',
             matched_payout_slice_id = $2,
             matched_payout_id = $3,
             match_confidence = $4,
             match_method = $5,
             match_timestamp = now(),
             matched_by = 'system',
             reconciled_at = now()
         WHERE id = $1`,
        [line.id, slice.id, slice.parent_payout_id, confidence, method]
      );

      // Update payout slice
      await client.query(
        `UPDATE payout_slices
         SET status = 'settled',
             settled_at = now()
         WHERE id = $1`,
        [slice.id]
      );

      // Record audit
      await recordAudit(client, {
        statement_line_id: line.id,
        action: 'matched',
        new_status: 'matched',
        new_matched_slice_id: slice.id,
        match_confidence: confidence,
        match_method: method,
        performed_by: 'system',
        reason: `Automatic match via ${method} matching`
      });

      // Update metrics
      if (this.config.metrics_enabled) {
        await client.query(
          `SELECT increment_reconciliation_metric($1, $2, 'total_lines_matched', 1)`,
          [line.bank_profile_id, line.statement_date]
        );
        await client.query(
          `SELECT increment_reconciliation_metric($1, $2, $3, 1)`,
          [line.bank_profile_id, line.statement_date, `matches_${method}`]
        );
      }

      await client.query('COMMIT');

      // Emit webhook
      if (this.config.webhook_enabled) {
        await emitWebhook('treasury.reconciliation.matched', {
          statement_line_id: line.id,
          payout_slice_id: slice.id,
          amount: line.amount,
          currency: line.currency,
          confidence,
          method
        });
      }

      console.log(`✅ Matched line ${line.id} to slice ${slice.id} (confidence: ${confidence}%)`);

      return {
        matched: true,
        confidence,
        method: method as any,
        matched_slice_id: slice.id,
        candidates: [{ slice, confidence, match_reasons: [], differences: [] }],
        anomalies: [],
        requires_review: false
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Mark line for manual review
   */
  private async markForManualReview(
    line: BankStatementLine,
    candidates: MatchCandidate[],
    anomalies: string[],
    anomalyScore: number
  ): Promise<void> {
    await pool.query(
      `UPDATE bank_statement_lines
       SET reconciliation_status = 'manual_review',
           anomaly_score = $2,
           anomaly_type = $3,
           anomaly_details = $4,
           requires_manual_review = TRUE
       WHERE id = $1`,
      [line.id, anomalyScore, anomalies[0] || 'multiple_matches', JSON.stringify({ candidates, anomalies })]
    );

    // Create exception
    const severity = anomalyScore >= 90 ? 'critical' : anomalyScore >= 70 ? 'high' : 'medium';
    await pool.query(
      `INSERT INTO reconciliation_exceptions
       (statement_line_id, exception_type, severity, description, suggested_match_id, suggested_match_confidence)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        line.id,
        candidates.length > 1 ? 'multiple_matches' : 'anomaly',
        severity,
        `Line requires manual review. Anomalies: ${anomalies.join(', ')}`,
        candidates.length > 0 ? candidates[0].slice.id : null,
        candidates.length > 0 ? candidates[0].confidence : null
      ]
    );

    // Emit webhook
    if (this.config.webhook_enabled) {
      await emitWebhook('treasury.reconciliation.manual_review', {
        statement_line_id: line.id,
        anomaly_score: anomalyScore,
        anomalies,
        candidates: candidates.slice(0, 3)
      });
    }
  }

  /**
   * Mark as duplicate
   */
  private async markAsDuplicate(lineId: string, duplicateOfId: string): Promise<void> {
    await pool.query(
      `UPDATE bank_statement_lines
       SET reconciliation_status = 'duplicate',
           is_duplicate = TRUE,
           duplicate_of = $2
       WHERE id = $1`,
      [lineId, duplicateOfId]
    );

    console.log(`⚠️  Line ${lineId} marked as duplicate of ${duplicateOfId}`);
  }

  /**
   * Mark line as having no match
   */
  private async markAsNoMatch(line: BankStatementLine): Promise<void> {
    await pool.query(
      `UPDATE bank_statement_lines
       SET anomaly_type = 'no_match'
       WHERE id = $1`,
      [line.id]
    );
  }

  /**
   * Mark line as error
   */
  private async markLineError(lineId: string, errorMessage: string): Promise<void> {
    await pool.query(
      `UPDATE bank_statement_lines
       SET reconciliation_status = 'error',
           reconciliation_error = $2
       WHERE id = $1`,
      [lineId, errorMessage]
    );
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Run reconciliation for specific batch (for testing/manual runs)
 */
export async function reconcileWorker(limit: number = 50): Promise<number> {
  const worker = new ReconciliationWorker({ batch_size: limit });
  return await worker.processNextBatch();
}

// ============================================================================
// End of reconciliation worker
// ============================================================================
