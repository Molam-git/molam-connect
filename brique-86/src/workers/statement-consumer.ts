// Statement ingestion worker
// Processes raw statement files and normalizes them into bank_statement_lines

import { pool, withTransaction } from '../utils/db';
import { fetchS3File } from '../utils/s3';
import { parseMT940 } from '../parsers/mt940';
import { parseCAMT } from '../parsers/camt';
import { enqueueReconciliation } from '../services/reconciliation-queue';
import { recoParseErrors, recoLinesProcessed, measureDuration, recoLatency } from '../utils/metrics';

const BATCH_SIZE = 5;
const POLL_INTERVAL_MS = 2000;

interface RawStatement {
  id: string;
  bank_profile_id: string;
  external_file_id: string;
  file_s3_key: string;
  file_type: string;
  metadata: any;
}

/**
 * Main worker loop - continuously processes uploaded statement files
 */
export async function runIngestWorker(): Promise<void> {
  console.log('Starting statement ingestion worker...');

  while (true) {
    try {
      await processNextBatch();
    } catch (error: any) {
      console.error('Worker error:', error);
      await sleep(5000); // Back off on error
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Process a batch of uploaded statement files
 */
async function processNextBatch(): Promise<void> {
  // Use SELECT FOR UPDATE SKIP LOCKED for job queue pattern
  const { rows } = await pool.query<RawStatement>(
    `SELECT id, bank_profile_id, external_file_id, file_s3_key, file_type, metadata
     FROM bank_statements_raw
     WHERE status = 'uploaded'
     ORDER BY imported_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [BATCH_SIZE]
  );

  if (rows.length === 0) {
    return; // No work to do
  }

  console.log(`Processing ${rows.length} statement files...`);

  // Process each file in parallel
  await Promise.allSettled(rows.map(row => processRawStatement(row)));
}

/**
 * Process a single raw statement file
 */
async function processRawStatement(rawRow: RawStatement): Promise<void> {
  const { id: rawId, file_s3_key, bank_profile_id, file_type, metadata } = rawRow;

  console.log(`Processing statement ${rawId} (${file_type})`);

  // Mark as parsing
  await pool.query(
    `UPDATE bank_statements_raw SET status = 'parsing', updated_at = now() WHERE id = $1`,
    [rawId]
  );

  try {
    // Fetch file from S3
    const buffer = await measureDuration(
      recoLatency,
      { operation: 's3_fetch', bank_profile_id },
      () => fetchS3File(file_s3_key)
    );

    // Parse based on file type
    const parsedLines = await measureDuration(
      recoLatency,
      { operation: 'parse', bank_profile_id },
      async () => {
        if (file_type === 'mt940') {
          return parseMT940(buffer.toString('utf8'));
        } else if (file_type === 'camt' || file_type === 'camt.053') {
          return await parseCAMT(buffer.toString('utf8'));
        } else {
          throw new Error(`Unsupported file type: ${file_type}`);
        }
      }
    );

    console.log(`Parsed ${parsedLines.length} lines from ${file_type} file`);

    // Insert normalized lines in transaction
    await withTransaction(async (client) => {
      for (const line of parsedLines) {
        // Insert normalized line
        const { rows } = await client.query(
          `INSERT INTO bank_statement_lines (
            raw_statement_id, bank_profile_id, statement_date, value_date, booking_date,
            amount, currency, description, reference, provider_ref, beneficiary_name,
            beneficiary_account, transaction_type, reconciliation_status, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'unmatched', $14, now())
          RETURNING id`,
          [
            rawId,
            bank_profile_id,
            line.statement_date,
            line.value_date,
            line.booking_date || null,
            line.amount,
            line.currency,
            line.description,
            line.reference || null,
            line.provider_ref || null,
            line.beneficiary_name || null,
            line.beneficiary_account || null,
            line.transaction_type,
            JSON.stringify(line.metadata),
          ]
        );

        const lineId = rows[0].id;

        // Increment metrics
        recoLinesProcessed.inc({ bank_profile_id, status: 'parsed' });

        // Enqueue for reconciliation (async, don't wait)
        enqueueReconciliation(lineId, bank_profile_id).catch((err) => {
          console.error('Failed to enqueue reconciliation:', err);
        });
      }

      // Mark raw statement as parsed
      await client.query(
        `UPDATE bank_statements_raw
         SET status = 'parsed', parsed_at = now(), updated_at = now()
         WHERE id = $1`,
        [rawId]
      );
    });

    console.log(`Successfully processed statement ${rawId}`);
  } catch (error: any) {
    console.error(`Failed to process statement ${rawId}:`, error);

    // Increment error metric
    recoParseErrors.inc({ file_type, bank_profile_id });

    // Mark as parse_failed
    await pool.query(
      `UPDATE bank_statements_raw
       SET status = 'parse_failed', parsed_error = $2, updated_at = now()
       WHERE id = $1`,
      [rawId, error.message]
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start worker if run directly
if (require.main === module) {
  runIngestWorker().catch((err) => {
    console.error('Fatal worker error:', err);
    process.exit(1);
  });
}
