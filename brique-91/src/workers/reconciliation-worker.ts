// Reconciliation Worker
// Processes unmatched bank statement lines and attempts to match them with payouts

import { pool, withTransaction } from '../utils/db';
import { MatchingEngine } from '../services/matching-engine';

const POLL_INTERVAL_MS = parseInt(process.env.RECON_POLL_MS || '10000');
const BATCH_SIZE = parseInt(process.env.RECON_BATCH_SIZE || '50');
const MAX_AGE_HOURS = 72; // Only try to match lines from last 72 hours

interface StatementLine {
  id: string;
  bank_profile_id: string;
  statement_id: string;
  value_date: Date;
  amount: number;
  currency: string;
  direction: 'debit' | 'credit';
  reference?: string;
  description?: string;
  beneficiary_json?: any;
  reconciliation_status: string;
  created_at: Date;
}

/**
 * Reconciliation worker class
 */
export class ReconciliationWorker {
  private matchingEngine: MatchingEngine;
  private isRunning: boolean = false;

  constructor() {
    this.matchingEngine = new MatchingEngine();
  }

  /**
   * Start the worker
   */
  async start() {
    this.isRunning = true;
    console.log('[ReconciliationWorker] Starting...');

    while (this.isRunning) {
      try {
        await this.processBatch();
      } catch (error) {
        console.error('[ReconciliationWorker] Error processing batch:', error);
      }

      // Wait before next poll
      await this.sleep(POLL_INTERVAL_MS);
    }

    console.log('[ReconciliationWorker] Stopped');
  }

  /**
   * Stop the worker
   */
  stop() {
    this.isRunning = false;
    console.log('[ReconciliationWorker] Stopping...');
  }

  /**
   * Process a batch of unmatched lines
   */
  private async processBatch(): Promise<void> {
    const client = await pool.connect();

    try {
      // Fetch unmatched lines (only recent ones)
      const { rows } = await client.query<StatementLine>(
        `SELECT id, bank_profile_id, statement_id, value_date, amount, currency, direction,
                reference, description, beneficiary_json, reconciliation_status, created_at
         FROM bank_statement_lines
         WHERE reconciliation_status = 'unmatched'
           AND direction = 'debit'
           AND created_at > NOW() - INTERVAL '${MAX_AGE_HOURS} hours'
         ORDER BY created_at DESC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [BATCH_SIZE]
      );

      if (rows.length === 0) {
        // No unmatched lines
        return;
      }

      console.log(`[ReconciliationWorker] Processing ${rows.length} unmatched lines`);

      // Process each line
      let matchedCount = 0;
      let unmatchedCount = 0;

      for (const line of rows) {
        try {
          const matched = await this.reconcileLine(client, line);
          if (matched) {
            matchedCount++;
          } else {
            unmatchedCount++;
          }
        } catch (error) {
          console.error(`[ReconciliationWorker] Error reconciling line ${line.id}:`, error);
        }
      }

      console.log(`[ReconciliationWorker] Batch complete: ${matchedCount} matched, ${unmatchedCount} unmatched`);

    } finally {
      client.release();
    }
  }

  /**
   * Reconcile a single statement line
   */
  private async reconcileLine(client: any, line: StatementLine): Promise<boolean> {
    console.log(`[ReconciliationWorker] Reconciling line ${line.id} (${line.currency} ${line.amount})`);

    // Attempt to match
    const matchResult = await this.matchingEngine.matchStatementLine(line);

    if (matchResult.matched && matchResult.payout_id) {
      // Match found - update both records
      await this.recordMatch(client, line, matchResult);
      return true;
    } else {
      // No match - create reconciliation issue for manual review
      await this.createReconciliationIssue(client, line);
      return false;
    }
  }

  /**
   * Record a successful match
   */
  private async recordMatch(client: any, line: StatementLine, matchResult: any): Promise<void> {
    try {
      await client.query('BEGIN');

      // Update statement line
      await client.query(
        `UPDATE bank_statement_lines
         SET reconciliation_status = 'matched',
             matched_payout_id = $1,
             match_method = $2,
             match_confidence = $3,
             match_details = $4::jsonb,
             matched_at = NOW(),
             updated_at = NOW()
         WHERE id = $5`,
        [
          matchResult.payout_id,
          matchResult.match_method,
          matchResult.match_confidence,
          JSON.stringify(matchResult.match_details),
          line.id
        ]
      );

      // Update payout
      await client.query(
        `UPDATE payouts
         SET status = 'completed',
             reconciled_at = NOW(),
             reconciled_by = 'auto',
             settlement_ref = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [line.reference || line.id, matchResult.payout_id]
      );

      // Log reconciliation
      await client.query(
        `INSERT INTO reconciliation_logs (
          statement_line_id,
          payout_id,
          match_method,
          match_confidence,
          reconciled_by,
          reconciled_at,
          notes
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
        [
          line.id,
          matchResult.payout_id,
          matchResult.match_method,
          matchResult.match_confidence,
          'auto',
          JSON.stringify(matchResult.match_details)
        ]
      );

      await client.query('COMMIT');

      console.log(`[ReconciliationWorker] ✓ Matched line ${line.id} with payout ${matchResult.payout_id} (${matchResult.match_method}, confidence: ${(matchResult.match_confidence * 100).toFixed(1)}%)`);

      // Publish reconciliation event
      await this.publishEvent(client, 'reconciliation.matched', {
        statement_line_id: line.id,
        payout_id: matchResult.payout_id,
        match_method: matchResult.match_method,
        match_confidence: matchResult.match_confidence
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Create reconciliation issue for manual review
   */
  private async createReconciliationIssue(client: any, line: StatementLine): Promise<void> {
    // Check if issue already exists
    const { rows: existingIssues } = await client.query(
      `SELECT id FROM reconciliation_issues
       WHERE statement_line_id = $1
         AND status = 'open'`,
      [line.id]
    );

    if (existingIssues.length > 0) {
      // Issue already exists, just update the attempt count
      await client.query(
        `UPDATE reconciliation_issues
         SET match_attempts = match_attempts + 1,
             last_attempt_at = NOW(),
             updated_at = NOW()
         WHERE statement_line_id = $1
           AND status = 'open'`,
        [line.id]
      );
      return;
    }

    // Create new issue
    const issue_type = this.determineIssueType(line);
    const priority = this.determineIssuePriority(line);

    await client.query(
      `INSERT INTO reconciliation_issues (
        statement_line_id,
        bank_profile_id,
        issue_type,
        priority,
        status,
        match_attempts,
        last_attempt_at,
        issue_details,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7::jsonb, NOW(), NOW())`,
      [
        line.id,
        line.bank_profile_id,
        issue_type,
        priority,
        'open',
        1,
        JSON.stringify({
          amount: line.amount,
          currency: line.currency,
          value_date: line.value_date,
          reference: line.reference,
          description: line.description,
          beneficiary: line.beneficiary_json
        })
      ]
    );

    // Update statement line status
    await client.query(
      `UPDATE bank_statement_lines
       SET reconciliation_status = 'needs_review',
           updated_at = NOW()
       WHERE id = $1`,
      [line.id]
    );

    console.log(`[ReconciliationWorker] ✗ Created reconciliation issue for line ${line.id} (${issue_type}, priority: ${priority})`);

    // Publish issue event
    await this.publishEvent(client, 'reconciliation.issue_created', {
      statement_line_id: line.id,
      issue_type,
      priority
    });
  }

  /**
   * Determine issue type based on line characteristics
   */
  private determineIssueType(line: StatementLine): string {
    if (!line.reference && !line.description) {
      return 'missing_reference';
    }

    if (line.amount > 10000) {
      return 'high_value_unmatched';
    }

    if (!line.beneficiary_json?.name) {
      return 'missing_beneficiary';
    }

    return 'no_match_found';
  }

  /**
   * Determine issue priority
   */
  private determineIssuePriority(line: StatementLine): string {
    // High priority for large amounts
    if (line.amount > 50000) {
      return 'critical';
    }

    if (line.amount > 10000) {
      return 'high';
    }

    // High priority for old transactions
    const age_hours = (Date.now() - line.created_at.getTime()) / (1000 * 60 * 60);
    if (age_hours > 48) {
      return 'high';
    }

    if (age_hours > 24) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Publish event to queue/bus
   */
  private async publishEvent(client: any, eventType: string, payload: any): Promise<void> {
    // In production, publish to Redis, SQS, or event bus
    console.log(`[Event] ${eventType}:`, payload);

    // Example with database event table:
    // await client.query(
    //   `INSERT INTO events (event_type, payload, created_at)
    //    VALUES ($1, $2, NOW())`,
    //   [eventType, JSON.stringify(payload)]
    // );
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main entry point
 */
if (require.main === module) {
  const worker = new ReconciliationWorker();

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, stopping worker...');
    worker.stop();
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, stopping worker...');
    worker.stop();
  });

  // Start worker
  worker.start().catch(error => {
    console.error('Fatal error in worker:', error);
    process.exit(1);
  });
}

export default ReconciliationWorker;
