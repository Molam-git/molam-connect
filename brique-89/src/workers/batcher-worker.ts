// Payout Batcher Worker
// Groups payouts into batches for optimized bank submission

import { pool } from '../utils/db';
import { pickRouting } from '../services/sira-router';
import { v4 as uuidv4 } from 'uuid';

const BATCH_SIZE_LIMIT = parseInt(process.env.BATCH_SIZE_LIMIT || '100');
const POLL_INTERVAL_MS = parseInt(process.env.BATCHER_POLL_INTERVAL_MS || '30000'); // 30s

interface RoutingInfo {
  bank_profile_id: string;
  treasury_account_id: string;
  routing_method: string;
  estimated_bank_fee: number;
}

/**
 * Main batcher loop
 */
export async function runBatcherWorker(): Promise<void> {
  console.log('🔄 Starting Payout Batcher Worker');
  console.log(`   Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`   Batch size limit: ${BATCH_SIZE_LIMIT}`);

  while (true) {
    try {
      await processPendingPayouts();
    } catch (error: any) {
      console.error('Batcher worker error:', error);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Process pending payouts and create batches
 */
async function processPendingPayouts(): Promise<void> {
  // Fetch payouts ready for batching
  const { rows: payouts } = await pool.query(
    `SELECT * FROM payouts
     WHERE status = 'created'
       AND (scheduled_for IS NULL OR scheduled_for <= now())
       AND (hold_reason IS NULL)
       AND priority IN ('normal', 'priority')
     ORDER BY priority DESC, created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [BATCH_SIZE_LIMIT * 3] // Fetch more to allow grouping
  );

  if (payouts.length === 0) {
    return;
  }

  console.log(`📦 Processing ${payouts.length} payouts for batching`);

  // Group payouts by routing
  const groups = await groupPayoutsByRouting(payouts);

  // Create batches for each group
  for (const [groupKey, group] of Object.entries(groups)) {
    await createBatch(group);
  }
}

/**
 * Group payouts by bank profile, currency, and routing method
 */
async function groupPayoutsByRouting(
  payouts: any[]
): Promise<Record<string, Array<{ payout: any; routing: RoutingInfo }>>> {
  const groups: Record<string, Array<{ payout: any; routing: RoutingInfo }>> = {};

  for (const payout of payouts) {
    try {
      // Get routing recommendation from SIRA
      const routing = await pickRouting({
        currency: payout.currency,
        amount: parseFloat(payout.amount),
        priority: payout.priority,
        beneficiary: payout.beneficiary,
        origin_module: payout.origin_module,
        origin_entity_id: payout.origin_entity_id,
      });

      // Skip if routing requires hold
      if (routing.recommended_action === 'hold') {
        await pool.query(
          `UPDATE payouts
           SET status = 'held', hold_reason = $2, updated_at = now()
           WHERE id = $1`,
          [payout.id, routing.hold_reason || 'fraud_review']
        );
        continue;
      }

      // Group key: bank_profile + currency + routing_method
      const groupKey = `${routing.bank_profile_id}:${payout.currency}:${routing.routing_method}`;

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }

      groups[groupKey].push({ payout, routing });

      // Update payout with routing info
      await pool.query(
        `UPDATE payouts
         SET bank_profile_id = $2, treasury_account_id = $3,
             routing_method = $4, bank_fee = $5, updated_at = now()
         WHERE id = $1`,
        [
          payout.id,
          routing.bank_profile_id,
          routing.treasury_account_id,
          routing.routing_method,
          routing.estimated_bank_fee,
        ]
      );
    } catch (error: any) {
      console.error(`Failed to route payout ${payout.id}:`, error);
      // Mark as failed
      await pool.query(
        `UPDATE payouts SET status = 'failed', updated_at = now() WHERE id = $1`,
        [payout.id]
      );
    }
  }

  return groups;
}

/**
 * Create batch for a group of payouts
 */
async function createBatch(
  group: Array<{ payout: any; routing: RoutingInfo }>
): Promise<void> {
  if (group.length === 0) {
    return;
  }

  const { payout: firstPayout, routing } = group[0];
  const currency = firstPayout.currency;

  // Calculate batch totals
  const totalAmount = group.reduce(
    (sum, item) => sum + parseFloat(item.payout.amount),
    0
  );

  const batch_ref = `BATCH-${currency}-${Date.now()}-${uuidv4().substring(0, 8)}`;

  console.log(
    `📦 Creating batch ${batch_ref} with ${group.length} payouts, total: ${totalAmount} ${currency}`
  );

  try {
    await pool.query('BEGIN');

    // Create batch
    const { rows: batchRows } = await pool.query(
      `INSERT INTO payout_batches (
        batch_ref, bank_profile_id, treasury_account_id, currency,
        batch_date, batch_type, status, total_amount, item_count,
        metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, 'open', $6, $7, $8, now(), now())
      RETURNING *`,
      [
        batch_ref,
        routing.bank_profile_id,
        routing.treasury_account_id,
        currency,
        firstPayout.priority === 'priority' ? 'priority' : 'standard',
        totalAmount,
        group.length,
        JSON.stringify({ routing_method: routing.routing_method }),
      ]
    );

    const batch = batchRows[0];

    // Update payouts to queued and link to batch
    for (const { payout } of group) {
      await pool.query(
        `UPDATE payouts
         SET status = 'queued', batch_id = $2, updated_at = now()
         WHERE id = $1`,
        [payout.id, batch.id]
      );
    }

    await pool.query('COMMIT');

    console.log(`✅ Created batch ${batch.id} (${batch_ref}) with ${group.length} payouts`);
  } catch (error: any) {
    await pool.query('ROLLBACK');
    console.error('Failed to create batch:', error);

    // Mark payouts as failed
    for (const { payout } of group) {
      await pool.query(
        `UPDATE payouts SET status = 'failed', updated_at = now() WHERE id = $1`,
        [payout.id]
      );
    }
  }
}

/**
 * Helper: sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run worker if executed directly
if (require.main === module) {
  runBatcherWorker().catch((err) => {
    console.error('Fatal batcher worker error:', err);
    process.exit(1);
  });
}
