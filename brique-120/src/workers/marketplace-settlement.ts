/**
 * Marketplace Settlement Worker
 * Periodic settlement for marketplace sellers
 */

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

/**
 * Check if seller should settle today
 */
function shouldSettleToday(schedule: string, settlementDay: number): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // Sunday = 7
  const dayOfMonth = now.getDate();

  switch (schedule) {
    case 'instant':
      return true;
    case 'daily':
      return true;
    case 'weekly':
      return dayOfWeek === settlementDay;
    case 'monthly':
      return dayOfMonth === settlementDay;
    case 'custom':
      return false; // Handle custom schedules separately
    default:
      return false;
  }
}

/**
 * Main settlement worker
 */
export async function runMarketplaceSettlement() {
  console.log('[Marketplace Settlement] Starting settlement run...');

  try {
    // Get all verified sellers
    const sellersResult = await pool.query(`
      SELECT * FROM marketplace_sellers
      WHERE kyc_status = 'verified'
        AND is_active = true
      ORDER BY is_vip DESC, priority_level DESC
    `);

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const seller of sellersResult.rows) {
      try {
        // Check if should settle today
        if (!shouldSettleToday(seller.settlement_schedule, seller.settlement_day)) {
          skippedCount++;
          continue;
        }

        // Check for holds
        const holdsResult = await pool.query(
          'SELECT COUNT(*) as count FROM seller_holds WHERE marketplace_seller_id = $1 AND status = $2',
          [seller.id, 'active']
        );

        if (parseInt(holdsResult.rows[0].count) > 0) {
          console.log(`[Marketplace Settlement] Seller ${seller.id} has active holds, skipping`);
          skippedCount++;
          continue;
        }

        // Calculate balance
        const balanceResult = await pool.query(
          'SELECT * FROM calculate_seller_balance($1)',
          [seller.id]
        );

        const balance = balanceResult.rows[0];

        if (!balance || balance.net <= 0) {
          skippedCount++;
          continue;
        }

        // Check minimum payout amount
        if (balance.net < seller.min_payout_amount) {
          console.log(`[Marketplace Settlement] Seller ${seller.id} below minimum: ${balance.net} < ${seller.min_payout_amount}`);
          skippedCount++;
          continue;
        }

        console.log(`[Marketplace Settlement] Processing seller ${seller.id}: ${balance.net} ${seller.currency}`);

        // Create payout
        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          // Create parent payout
          const parentPayoutResult = await client.query(`
            INSERT INTO payouts (
              external_id,
              origin_module,
              origin_entity_id,
              currency,
              amount,
              net_amount,
              molam_fee,
              bank_fee,
              beneficiary,
              priority,
              reference_code,
              created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL)
            RETURNING *
          `, [
            `auto-seller-${seller.id}-${Date.now()}`,
            'marketplace',
            seller.id,
            seller.currency,
            balance.net,
            balance.net,
            0,
            0,
            seller.beneficiary_details || JSON.stringify({}),
            seller.is_vip ? 'priority' : 'normal',
            `ASP-${Date.now()}`
          ]);

          // Create seller payout
          const sellerPayoutResult = await client.query(`
            INSERT INTO seller_payouts (
              marketplace_seller_id,
              parent_payout_id,
              gross_amount,
              commission,
              refunds,
              net_amount,
              period_start,
              period_end,
              status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
            RETURNING *
          `, [
            seller.id,
            parentPayoutResult.rows[0].id,
            balance.gross,
            balance.commission,
            balance.refunds,
            balance.net,
            new Date(Date.now() - 7 * 86400000), // Last 7 days
            new Date(),
          ]);

          // Settle transactions
          await client.query(
            'SELECT settle_seller_transactions($1, $2)',
            [seller.id, sellerPayoutResult.rows[0].id]
          );

          await client.query('COMMIT');

          processedCount++;
          console.log(`[Marketplace Settlement] Created payout for seller ${seller.id}: ${parentPayoutResult.rows[0].id}`);

        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }

      } catch (error: any) {
        console.error(`[Marketplace Settlement] Error processing seller ${seller.id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`[Marketplace Settlement] Completed: ${processedCount} processed, ${skippedCount} skipped, ${errorCount} errors`);

    return {
      processed: processedCount,
      skipped: skippedCount,
      errors: errorCount
    };

  } catch (error: any) {
    console.error('[Marketplace Settlement] Fatal error:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runMarketplaceSettlement()
    .then((result) => {
      console.log('Settlement completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Settlement failed:', error);
      process.exit(1);
    });
}
