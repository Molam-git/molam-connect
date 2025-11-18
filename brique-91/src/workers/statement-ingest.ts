// Statement Ingestion Worker
// Watches bank_statements_raw for new uploads, parses them, and normalizes to bank_statement_lines

import { pool } from '../utils/db';
import { MT940Parser } from '../parsers/mt940';
import { ISO20022Parser } from '../parsers/iso20022';
import { CSVParser } from '../parsers/csv';
import { StatementParser, ParsedStatement, ParsedStatementLine } from '../parsers/types';
import * as fs from 'fs';
import * as path from 'path';

const POLL_INTERVAL_MS = parseInt(process.env.INGEST_POLL_MS || '5000');
const MAX_RETRIES = 3;

interface RawStatement {
  id: string;
  bank_profile_id: string;
  uploaded_by: string;
  file_path: string;
  file_name: string;
  file_size: number;
  status: string;
  created_at: Date;
}

/**
 * Main ingestion worker class
 */
export class StatementIngestWorker {
  private parsers: StatementParser[];
  private isRunning: boolean = false;

  constructor() {
    this.parsers = [
      new MT940Parser(),
      new ISO20022Parser(),
      new CSVParser()
    ];
  }

  /**
   * Start the worker
   */
  async start() {
    this.isRunning = true;
    console.log('[StatementIngestWorker] Starting...');

    while (this.isRunning) {
      try {
        await this.processNextStatement();
      } catch (error) {
        console.error('[StatementIngestWorker] Error processing statement:', error);
      }

      // Wait before next poll
      await this.sleep(POLL_INTERVAL_MS);
    }

    console.log('[StatementIngestWorker] Stopped');
  }

  /**
   * Stop the worker
   */
  stop() {
    this.isRunning = false;
    console.log('[StatementIngestWorker] Stopping...');
  }

  /**
   * Process next pending statement
   */
  private async processNextStatement(): Promise<void> {
    const client = await pool.connect();

    try {
      // Lock and fetch next pending statement
      const { rows } = await client.query<RawStatement>(
        `SELECT id, bank_profile_id, uploaded_by, file_path, file_name, file_size, status, created_at
         FROM bank_statements_raw
         WHERE status = 'uploaded'
           AND retry_count < $1
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [MAX_RETRIES]
      );

      if (rows.length === 0) {
        // No pending statements
        return;
      }

      const rawStatement = rows[0];
      console.log(`[StatementIngestWorker] Processing statement ${rawStatement.id} (${rawStatement.file_name})`);

      // Update status to processing
      await client.query(
        `UPDATE bank_statements_raw
         SET status = 'processing', updated_at = NOW()
         WHERE id = $1`,
        [rawStatement.id]
      );

      // Process the statement
      await this.ingestStatement(client, rawStatement);

    } catch (error) {
      console.error('[StatementIngestWorker] Error in processNextStatement:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Ingest a single statement
   */
  private async ingestStatement(client: any, rawStatement: RawStatement): Promise<void> {
    try {
      // Read file content
      const content = await this.readFile(rawStatement.file_path);

      // Detect format and parse
      const parser = this.detectParser(content);
      if (!parser) {
        throw new Error('Unable to detect statement format');
      }

      console.log(`[StatementIngestWorker] Detected format: ${parser.getFormat()}`);

      const parseResult = await parser.parse(content);

      if (!parseResult.success || !parseResult.statement) {
        throw new Error(`Parse failed: ${parseResult.errors?.join(', ')}`);
      }

      const statement = parseResult.statement;

      // Validate statement
      this.validateStatement(statement);

      // Create statement ID
      const statement_id = `STMT-${rawStatement.bank_profile_id}-${Date.now()}`;

      // Insert normalized lines
      const insertedCount = await this.insertStatementLines(
        client,
        statement_id,
        rawStatement.bank_profile_id,
        statement,
        rawStatement.id
      );

      // Update raw statement to completed
      await client.query(
        `UPDATE bank_statements_raw
         SET status = 'parsed',
             parsed_at = NOW(),
             parsed_lines_count = $1,
             format_detected = $2,
             parse_warnings = $3::jsonb,
             updated_at = NOW()
         WHERE id = $4`,
        [
          insertedCount,
          statement.format,
          JSON.stringify(parseResult.warnings || []),
          rawStatement.id
        ]
      );

      console.log(`[StatementIngestWorker] Successfully parsed ${insertedCount} lines from ${rawStatement.file_name}`);

      // Emit reconciliation events
      await this.emitReconciliationEvents(client, statement_id);

    } catch (error: any) {
      console.error(`[StatementIngestWorker] Error ingesting statement ${rawStatement.id}:`, error);

      // Update to failed status
      await client.query(
        `UPDATE bank_statements_raw
         SET status = 'failed',
             error_message = $1,
             retry_count = retry_count + 1,
             updated_at = NOW()
         WHERE id = $2`,
        [error.message, rawStatement.id]
      );
    }
  }

  /**
   * Detect appropriate parser for content
   */
  private detectParser(content: Buffer): StatementParser | null {
    for (const parser of this.parsers) {
      if (parser.canParse(content)) {
        return parser;
      }
    }
    return null;
  }

  /**
   * Read file from filesystem or S3
   */
  private async readFile(filePath: string): Promise<Buffer> {
    // Check if path is S3 URL
    if (filePath.startsWith('s3://')) {
      return this.readFromS3(filePath);
    }

    // Read from local filesystem
    return fs.promises.readFile(filePath);
  }

  /**
   * Read file from S3
   */
  private async readFromS3(s3Path: string): Promise<Buffer> {
    // Parse S3 path: s3://bucket-name/key
    const match = s3Path.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid S3 path: ${s3Path}`);
    }

    const [, bucket, key] = match;

    // For now, throw error - S3 integration would go here
    throw new Error('S3 integration not yet implemented. Please use local file paths.');

    // Production implementation would use AWS SDK:
    // const AWS = require('aws-sdk');
    // const s3 = new AWS.S3();
    // const response = await s3.getObject({ Bucket: bucket, Key: key }).promise();
    // return response.Body as Buffer;
  }

  /**
   * Validate parsed statement
   */
  private validateStatement(statement: ParsedStatement): void {
    if (!statement.statement_id) {
      throw new Error('Missing statement_id');
    }

    if (!statement.account_number) {
      throw new Error('Missing account_number');
    }

    if (!statement.currency) {
      throw new Error('Missing currency');
    }

    if (!statement.lines || statement.lines.length === 0) {
      throw new Error('No transaction lines found');
    }

    // Validate each line
    for (const line of statement.lines) {
      if (!line.value_date) {
        throw new Error('Transaction missing value_date');
      }

      if (line.amount === undefined || line.amount === null) {
        throw new Error('Transaction missing amount');
      }

      if (!line.currency) {
        throw new Error('Transaction missing currency');
      }

      if (!line.direction) {
        throw new Error('Transaction missing direction');
      }
    }
  }

  /**
   * Insert statement lines into bank_statement_lines table
   */
  private async insertStatementLines(
    client: any,
    statement_id: string,
    bank_profile_id: string,
    statement: ParsedStatement,
    raw_statement_id: string
  ): Promise<number> {
    let insertedCount = 0;

    for (const line of statement.lines) {
      try {
        // Build beneficiary JSON
        const beneficiary_json = {
          name: line.counterparty_name,
          iban: line.counterparty_iban,
          bic: line.counterparty_bic,
          account: line.counterparty_account
        };

        await client.query(
          `INSERT INTO bank_statement_lines (
            bank_profile_id,
            statement_id,
            raw_statement_id,
            value_date,
            posting_date,
            amount,
            currency,
            direction,
            reference,
            bank_reference,
            description,
            transaction_type,
            beneficiary_json,
            reconciliation_status,
            additional_info,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
          [
            bank_profile_id,
            statement_id,
            raw_statement_id,
            line.value_date,
            line.posting_date || line.value_date,
            line.amount,
            line.currency,
            line.direction,
            line.reference,
            line.bank_reference,
            line.description,
            line.transaction_type,
            JSON.stringify(beneficiary_json),
            'unmatched', // Initial status
            JSON.stringify(line.additional_info || {})
          ]
        );

        insertedCount++;
      } catch (error) {
        console.error('[StatementIngestWorker] Error inserting line:', error);
        // Continue with other lines
      }
    }

    return insertedCount;
  }

  /**
   * Emit reconciliation events for processing
   */
  private async emitReconciliationEvents(client: any, statement_id: string): Promise<void> {
    // Get all unmatched lines from this statement
    const { rows } = await client.query(
      `SELECT id FROM bank_statement_lines
       WHERE statement_id = $1
         AND reconciliation_status = 'unmatched'`,
      [statement_id]
    );

    console.log(`[StatementIngestWorker] Emitting ${rows.length} reconciliation events`);

    // In a production system, you would publish these to a queue (Redis, SQS, etc.)
    // For now, we'll just log them
    for (const row of rows) {
      // Publish event
      await this.publishEvent('reconciliation.job', {
        statement_line_id: row.id,
        statement_id,
        created_at: new Date().toISOString()
      });
    }
  }

  /**
   * Publish event to queue/bus
   */
  private async publishEvent(eventType: string, payload: any): Promise<void> {
    // In production, this would publish to Redis, SQS, or event bus
    // For now, just log
    console.log(`[Event] ${eventType}:`, payload);

    // Example Redis implementation:
    // await redisClient.publish(eventType, JSON.stringify(payload));

    // Example with database event table:
    // await pool.query(
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
  const worker = new StatementIngestWorker();

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

export default StatementIngestWorker;
