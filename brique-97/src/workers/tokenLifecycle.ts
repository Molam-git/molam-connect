/**
 * Brique 97 — Token Lifecycle Worker
 *
 * Automated worker for token maintenance:
 * - Expire unused tokens after retention period
 * - Revoke expired cards
 * - Clean up old client tokens
 * - Process rotation policies
 *
 * Run via cron or as a background worker
 */

import { pool } from '../db';
import { publishEvent } from '../webhooks/publisher';

// Configuration
const RETENTION_MONTHS = parseInt(process.env.TOKEN_RETENTION_MONTHS || '24');
const CLIENT_TOKEN_CLEANUP_HOURS = parseInt(process.env.CLIENT_TOKEN_CLEANUP_HOURS || '24');

/**
 * Main worker function
 */
export async function runTokenLifecycleWorker(): Promise<void> {
  console.log('Starting token lifecycle worker...');

  try {
    // 1. Expire unused payment methods
    const expiredPaymentMethods = await expireUnusedPaymentMethods();
    console.log(`Expired ${expiredPaymentMethods} unused payment methods`);

    // 2. Revoke expired cards
    const expiredCards = await revokeExpiredCards();
    console.log(`Revoked ${expiredCards} expired cards`);

    // 3. Clean up old client tokens
    const cleanedTokens = await cleanupClientTokens();
    console.log(`Cleaned up ${cleanedTokens} old client tokens`);

    // 4. Process webhook events
    const { processWebhookEvents } = await import('../webhooks/publisher');
    const processedEvents = await processWebhookEvents(100);
    console.log(`Processed ${processedEvents} webhook events`);

    console.log('Token lifecycle worker completed successfully');
  } catch (error) {
    console.error('Token lifecycle worker error:', error);
    throw error;
  }
}

/**
 * Expire payment methods that haven't been used in RETENTION_MONTHS
 */
async function expireUnusedPaymentMethods(): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - RETENTION_MONTHS);

    // Find unused payment methods
    const { rows } = await pool.query(
      `SELECT pm.id, pm.tenant_type, pm.tenant_id, pm.last4, pm.brand
       FROM payment_methods pm
       WHERE pm.is_active = true
         AND pm.deleted_at IS NULL
         AND pm.created_at < $1
         AND NOT EXISTS (
           SELECT 1 FROM payment_method_audit pma
           WHERE pma.payment_method_id = pm.id
             AND pma.action = 'used'
             AND pma.created_at >= $1
         )`,
      [cutoffDate]
    );

    let count = 0;

    for (const pm of rows) {
      // Revoke payment method
      await pool.query(
        `UPDATE payment_methods
         SET is_active = false,
             revoked_at = now(),
             revoked_by = NULL,
             revoked_reason = 'unused_expired'
         WHERE id = $1`,
        [pm.id]
      );

      // Audit log
      await pool.query(
        `INSERT INTO payment_method_audit (
          payment_method_id,
          action,
          actor_type,
          details
        ) VALUES ($1, $2, $3, $4)`,
        [
          pm.id,
          'expired',
          'system',
          {
            reason: 'unused_expired',
            retention_months: RETENTION_MONTHS,
          },
        ]
      );

      // Publish event
      await publishEvent(pm.tenant_type, pm.tenant_id, 'payment_method.expired', {
        id: pm.id,
        last4: pm.last4,
        brand: pm.brand,
        reason: 'unused_expired',
      });

      count++;
    }

    return count;
  } catch (error) {
    console.error('Error expiring unused payment methods:', error);
    return 0;
  }
}

/**
 * Revoke cards that have passed their expiration date
 */
async function revokeExpiredCards(): Promise<number> {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Find expired cards
    const { rows } = await pool.query(
      `SELECT pm.id, pm.tenant_type, pm.tenant_id, pm.last4, pm.brand
       FROM payment_methods pm
       WHERE pm.type = 'card'
         AND pm.is_active = true
         AND pm.deleted_at IS NULL
         AND (
           pm.exp_year < $1
           OR (pm.exp_year = $1 AND pm.exp_month < $2)
         )`,
      [currentYear, currentMonth]
    );

    let count = 0;

    for (const pm of rows) {
      // Revoke payment method
      await pool.query(
        `UPDATE payment_methods
         SET is_active = false,
             revoked_at = now(),
             revoked_by = NULL,
             revoked_reason = 'card_expired'
         WHERE id = $1`,
        [pm.id]
      );

      // Audit log
      await pool.query(
        `INSERT INTO payment_method_audit (
          payment_method_id,
          action,
          actor_type,
          details
        ) VALUES ($1, $2, $3, $4)`,
        [
          pm.id,
          'expired',
          'system',
          {
            reason: 'card_expired',
          },
        ]
      );

      // Publish event
      await publishEvent(pm.tenant_type, pm.tenant_id, 'payment_method.expired', {
        id: pm.id,
        last4: pm.last4,
        brand: pm.brand,
        reason: 'card_expired',
      });

      count++;
    }

    return count;
  } catch (error) {
    console.error('Error revoking expired cards:', error);
    return 0;
  }
}

/**
 * Clean up old client tokens
 */
async function cleanupClientTokens(): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - CLIENT_TOKEN_CLEANUP_HOURS);

    const { rowCount } = await pool.query(
      `DELETE FROM client_tokens
       WHERE expires_at < $1`,
      [cutoffDate]
    );

    return rowCount || 0;
  } catch (error) {
    console.error('Error cleaning up client tokens:', error);
    return 0;
  }
}

/**
 * Process key rotation (if configured)
 */
async function processKeyRotation(): Promise<void> {
  try {
    // Check if key rotation is needed
    const { rows } = await pool.query(
      `SELECT * FROM token_encryption_keys
       WHERE status = 'active'
         AND activated_at < now() - interval '90 days'`
    );

    if (rows.length === 0) {
      return; // No rotation needed
    }

    console.log('Key rotation needed but not implemented yet');
    // TODO: Implement key rotation
    // 1. Mark current key as 'rotating'
    // 2. Create new key in KMS
    // 3. Re-encrypt all tokens with new key (batch processing)
    // 4. Mark old key as 'retired'
    // 5. Mark new key as 'active'
  } catch (error) {
    console.error('Error processing key rotation:', error);
  }
}

/**
 * Run worker in loop (for long-running process)
 */
export async function startTokenLifecycleWorker(intervalMinutes: number = 60): Promise<void> {
  console.log(`Starting token lifecycle worker (interval: ${intervalMinutes} minutes)`);

  // Run immediately
  await runTokenLifecycleWorker();

  // Schedule recurring runs
  setInterval(async () => {
    try {
      await runTokenLifecycleWorker();
    } catch (error) {
      console.error('Worker error:', error);
    }
  }, intervalMinutes * 60 * 1000);
}

// If run as standalone script
if (require.main === module) {
  (async () => {
    try {
      const mode = process.argv[2] || 'once';

      if (mode === 'loop') {
        // Run in loop (for Kubernetes/Docker)
        const interval = parseInt(process.argv[3] || '60');
        await startTokenLifecycleWorker(interval);
      } else {
        // Run once (for cron)
        await runTokenLifecycleWorker();
        process.exit(0);
      }
    } catch (error) {
      console.error('Fatal error:', error);
      process.exit(1);
    }
  })();
}
