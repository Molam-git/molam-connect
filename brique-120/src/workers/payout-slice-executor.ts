/**
 * Payout Slice Executor Worker
 * Processes pending payout slices and sends to bank connectors
 */

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

interface BankConnector {
  sendPayment(params: {
    amount: number;
    currency: string;
    beneficiary: any;
  }): Promise<{
    status: 'sent' | 'failed';
    provider_ref?: string;
    error?: string;
  }>;
}

/**
 * Mock bank connector
 * In production, this would be replaced with actual bank integrations
 */
class MockBankConnector implements BankConnector {
  async sendPayment(params: {
    amount: number;
    currency: string;
    beneficiary: any;
  }): Promise<{
    status: 'sent' | 'failed';
    provider_ref?: string;
    error?: string;
  }> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // 95% success rate
    if (Math.random() < 0.95) {
      return {
        status: 'sent',
        provider_ref: `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
      };
    } else {
      return {
        status: 'failed',
        error: 'Temporary bank API error'
      };
    }
  }
}

/**
 * Get bank connector for treasury account
 */
function getBankConnector(treasuryAccountId: string | null): BankConnector {
  // In production, would select appropriate connector based on bank profile
  return new MockBankConnector();
}

/**
 * Get beneficiary details for payout
 */
async function getBeneficiaryForPayout(payoutId: string): Promise<any> {
  const result = await pool.query(
    'SELECT beneficiary FROM payouts WHERE id = $1',
    [payoutId]
  );

  if (result.rows.length === 0) {
    return {};
  }

  return result.rows[0].beneficiary;
}

/**
 * Process a single slice
 */
async function processSlice(slice: any): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock slice for processing
    const lockResult = await client.query(
      'UPDATE payout_slices SET status = $1, updated_at = now() WHERE id = $2 AND status = $3 RETURNING *',
      ['processing', slice.id, 'pending']
    );

    if (lockResult.rows.length === 0) {
      // Already being processed or not pending
      await client.query('ROLLBACK');
      return false;
    }

    await client.query('COMMIT');

    // Get beneficiary
    const beneficiary = await getBeneficiaryForPayout(slice.parent_payout_id);

    // Get connector
    const connector = getBankConnector(slice.treasury_account_id);

    try {
      // Send payment
      const response = await connector.sendPayment({
        amount: parseFloat(slice.slice_amount),
        currency: slice.currency,
        beneficiary
      });

      // Update slice based on response
      if (response.status === 'sent') {
        await pool.query(`
          UPDATE payout_slices
          SET status = 'sent',
              provider_ref = $1,
              provider_response = $2,
              sent_at = now(),
              updated_at = now()
          WHERE id = $3
        `, [
          response.provider_ref,
          JSON.stringify(response),
          slice.id
        ]);

        console.log(`[Slice Executor] Slice ${slice.id} sent successfully: ${response.provider_ref}`);
        return true;

      } else {
        // Failed, increment attempts
        const newAttempts = (slice.attempts || 0) + 1;
        const newStatus = newAttempts >= slice.max_attempts ? 'failed' : 'pending';

        await pool.query(`
          UPDATE payout_slices
          SET status = $1,
              attempts = $2,
              last_error = $3,
              updated_at = now()
          WHERE id = $4
        `, [
          newStatus,
          newAttempts,
          response.error || 'Unknown error',
          slice.id
        ]);

        console.error(`[Slice Executor] Slice ${slice.id} failed (attempt ${newAttempts}): ${response.error}`);
        return false;
      }

    } catch (error: any) {
      // Exception during send, mark as failed for retry
      const newAttempts = (slice.attempts || 0) + 1;
      const newStatus = newAttempts >= slice.max_attempts ? 'failed' : 'pending';

      await pool.query(`
        UPDATE payout_slices
        SET status = $1,
            attempts = $2,
            last_error = $3,
            updated_at = now()
        WHERE id = $4
      `, [
        newStatus,
        newAttempts,
        error.message,
        slice.id
      ]);

      console.error(`[Slice Executor] Exception processing slice ${slice.id}:`, error);
      return false;
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[Slice Executor] Transaction error for slice ${slice.id}:`, error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Main executor function
 */
export async function processPendingSlices(limit: number = 50): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  console.log('[Slice Executor] Starting execution run...');

  try {
    // Get pending slices
    const result = await pool.query(`
      SELECT * FROM payout_slices
      WHERE status = 'pending'
        AND attempts < max_attempts
      ORDER BY slice_order ASC, created_at ASC
      LIMIT $1
    `, [limit]);

    const slices = result.rows;

    if (slices.length === 0) {
      console.log('[Slice Executor] No pending slices found');
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    console.log(`[Slice Executor] Found ${slices.length} pending slices`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    // Process slices sequentially (could be parallel with limit)
    for (const slice of slices) {
      const success = await processSlice(slice);
      processed++;

      if (success) {
        succeeded++;
      } else {
        failed++;
      }

      // Add small delay to avoid overwhelming bank APIs
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`[Slice Executor] Completed: ${processed} processed, ${succeeded} succeeded, ${failed} failed`);

    return { processed, succeeded, failed };

  } catch (error: any) {
    console.error('[Slice Executor] Fatal error:', error);
    throw error;
  }
}

/**
 * Auto-repayment reconciliation
 * Called after payout settlement to deduct advances
 */
export async function reconcileAdvanceRepayments(sellerPayoutId: string): Promise<number> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get seller payout
    const payoutResult = await client.query(
      'SELECT * FROM seller_payouts WHERE id = $1',
      [sellerPayoutId]
    );

    if (payoutResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return 0;
    }

    const sellerPayout = payoutResult.rows[0];

    // Auto-repay advances
    const repaidResult = await client.query(
      'SELECT auto_repay_advances($1, $2) as total_repaid',
      [sellerPayout.marketplace_seller_id, sellerPayout.net_amount]
    );

    const totalRepaid = parseFloat(repaidResult.rows[0].total_repaid || 0);

    if (totalRepaid > 0) {
      console.log(`[Advance Reconciliation] Repaid ${totalRepaid} from seller payout ${sellerPayoutId}`);
    }

    await client.query('COMMIT');

    return totalRepaid;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Advance Reconciliation] Error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  processPendingSlices()
    .then((result) => {
      console.log('Slice execution completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Slice execution failed:', error);
      process.exit(1);
    });
}
