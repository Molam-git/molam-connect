/**
 * Event Ingestion Service
 * Receives transaction events from various sources (webhooks, direct API, queue)
 */
import { pool } from '../utils/db';
import { z } from 'zod';

// Event schema validation
const TransactionEventSchema = z.object({
  merchant_id: z.string().uuid(),
  transaction_id: z.string().min(1),
  customer_id: z.string().uuid().optional(),
  event_type: z.enum(['payment_created', 'payment_succeeded', 'payment_failed', 'payment_refunded']),
  amount: z.number().positive(),
  currency: z.string().length(3),
  fee: z.number().nonnegative().default(0),
  payment_method: z.enum(['mobile_money', 'card', 'bank_transfer', 'qr_payment']).optional(),
  product_id: z.string().optional(),
  product_name: z.string().optional(),
  metadata: z.any().optional()
});

export type TransactionEventInput = z.infer<typeof TransactionEventSchema>;

/**
 * Ingest a transaction event
 * Validates and stores event for processing by aggregation worker
 */
export async function ingestTransactionEvent(
  event: TransactionEventInput
): Promise<{ id: string; queued: boolean }> {
  // Validate event
  const validated = TransactionEventSchema.parse(event);

  try {
    // Insert event (will fail if duplicate transaction_id + event_type)
    const { rows } = await pool.query(
      `INSERT INTO transaction_events (
        merchant_id, transaction_id, customer_id,
        event_type, amount, currency, fee,
        payment_method, product_id, product_name, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (transaction_id, event_type) DO NOTHING
      RETURNING id`,
      [
        validated.merchant_id,
        validated.transaction_id,
        validated.customer_id || null,
        validated.event_type,
        validated.amount,
        validated.currency,
        validated.fee,
        validated.payment_method || null,
        validated.product_id || null,
        validated.product_name || null,
        validated.metadata || null
      ]
    );

    if (rows.length === 0) {
      // Event already exists (duplicate)
      const { rows: existing } = await pool.query(
        `SELECT id FROM transaction_events
         WHERE transaction_id = $1 AND event_type = $2`,
        [validated.transaction_id, validated.event_type]
      );

      return {
        id: existing[0].id,
        queued: false // Already existed
      };
    }

    return {
      id: rows[0].id,
      queued: true
    };
  } catch (error: any) {
    console.error('Failed to ingest transaction event:', error);
    throw new Error(`Event ingestion failed: ${error.message}`);
  }
}

/**
 * Batch ingest multiple events
 */
export async function ingestTransactionEventsBatch(
  events: TransactionEventInput[]
): Promise<{ ingested: number; duplicates: number }> {
  let ingested = 0;
  let duplicates = 0;

  for (const event of events) {
    try {
      const result = await ingestTransactionEvent(event);
      if (result.queued) {
        ingested++;
      } else {
        duplicates++;
      }
    } catch (error) {
      console.error('Failed to ingest event in batch:', error);
      // Continue with next event
    }
  }

  return { ingested, duplicates };
}

/**
 * Get event ingestion stats
 */
export async function getIngestionStats(merchantId: string, hours: number = 24) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) as total_events,
       COUNT(*) FILTER (WHERE processed = true) as processed_events,
       COUNT(*) FILTER (WHERE processed = false) as pending_events,
       COUNT(*) FILTER (WHERE event_type = 'payment_succeeded') as successful_payments,
       COUNT(*) FILTER (WHERE event_type = 'payment_failed') as failed_payments
     FROM transaction_events
     WHERE merchant_id = $1
       AND created_at > now() - interval '1 hour' * $2`,
    [merchantId, hours]
  );

  return rows[0];
}

export default {
  ingestTransactionEvent,
  ingestTransactionEventsBatch,
  getIngestionStats
};
