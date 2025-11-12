// ============================================================================
// Settlement Processor Worker
// Purpose: Execute scheduled settlements and transfer funds to recipients
// ============================================================================

import { Kafka } from 'kafkajs';
import pool from '../db';
import * as settlementsService from '../services/settlementsService';
import * as paymentSplitsService from '../services/paymentSplitsService';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const POLL_INTERVAL_MS = parseInt(process.env.SETTLEMENT_POLL_INTERVAL_MS || '60000'); // 1 minute
const BATCH_SIZE = parseInt(process.env.SETTLEMENT_BATCH_SIZE || '50');

// Kafka client
const kafka = new Kafka({
  clientId: 'brique-64-settlement-processor',
  brokers: KAFKA_BROKERS,
});

const producer = kafka.producer();

/**
 * Main worker loop
 */
export async function startSettlementProcessor(): Promise<void> {
  console.log('[SettlementProcessor] Starting settlement processor worker...');

  // Connect Kafka producer
  await producer.connect();
  console.log('[SettlementProcessor] Kafka producer connected');

  // Start polling loop
  setInterval(async () => {
    try {
      await processScheduledSettlements();
    } catch (error) {
      console.error('[SettlementProcessor] Error in processing loop:', error);
    }
  }, POLL_INTERVAL_MS);

  console.log(
    `[SettlementProcessor] Worker running. Polling every ${POLL_INTERVAL_MS}ms for scheduled settlements.`
  );
}

/**
 * Process all settlements due for execution
 */
async function processScheduledSettlements(): Promise<void> {
  const settlements = await settlementsService.getSettlementsDueForExecution();

  if (settlements.length === 0) {
    console.log('[SettlementProcessor] No settlements due for execution');
    return;
  }

  console.log(`[SettlementProcessor] Found ${settlements.length} settlements to process`);

  for (const settlement of settlements) {
    try {
      await processSettlement(settlement.id);
    } catch (error) {
      console.error(
        `[SettlementProcessor] Error processing settlement ${settlement.id}:`,
        error
      );
    }
  }
}

/**
 * Process a single settlement
 */
async function processSettlement(settlement_id: string): Promise<void> {
  const settlement = await settlementsService.getSettlementById(settlement_id);

  if (!settlement) {
    console.error(`[SettlementProcessor] Settlement ${settlement_id} not found`);
    return;
  }

  console.log(
    `[SettlementProcessor] Processing settlement ${settlement.settlement_batch_id} (${settlement.total_splits_count} splits, ${settlement.total_amount} ${settlement.currency})`
  );

  // Update status to processing
  await settlementsService.updateSettlementStatus(settlement_id, 'processing');

  // Get all splits for this settlement
  const { rows: splits } = await pool.query(
    `SELECT * FROM payment_splits WHERE settlement_id = $1 ORDER BY created_at`,
    [settlement_id]
  );

  if (splits.length === 0) {
    console.warn(
      `[SettlementProcessor] No splits found for settlement ${settlement.settlement_batch_id}`
    );
    await settlementsService.updateSettlementStatus(settlement_id, 'failed');
    return;
  }

  // Execute payout
  const payoutResult = await executeSettlementPayout(settlement, splits);

  if (payoutResult.success) {
    // Update settlement status
    await settlementsService.updateSettlementStatus(settlement_id, 'completed', {
      payout_id: payoutResult.payout_id,
      payout_method: payoutResult.method,
      payout_reference: payoutResult.reference,
    });

    // Mark all splits as settled
    for (const split of splits) {
      await paymentSplitsService.updateSplitStatus(split.id, 'settled', {
        settlement_id: settlement.id,
        payout_reference: payoutResult.reference,
      });
    }

    console.log(
      `[SettlementProcessor] ✓ Settlement ${settlement.settlement_batch_id} completed successfully`
    );

    // Publish success event
    await publishSettlementEvent('settlement.completed', {
      settlement_id: settlement.id,
      batch_id: settlement.settlement_batch_id,
      recipient_id: settlement.recipient_id,
      total_amount: settlement.total_amount,
      currency: settlement.currency,
      payout_id: payoutResult.payout_id,
    });
  } else {
    // Handle failure
    console.error(
      `[SettlementProcessor] ✗ Settlement ${settlement.settlement_batch_id} failed: ${payoutResult.error}`
    );

    // Mark failed splits
    const failedSplits = payoutResult.failed_splits || splits.map((s) => s.id);

    for (const split of splits) {
      if (failedSplits.includes(split.id)) {
        await paymentSplitsService.updateSplitStatus(split.id, 'failed', {
          failure_reason: payoutResult.error,
        });
      }
    }

    // Update settlement status
    await settlementsService.updateSettlementStatus(settlement_id, 'failed');

    // Record failure summary
    await settlementsService.recordSettlementFailure(
      settlement_id,
      failedSplits.map((split_id: string) => ({
        split_id,
        reason: payoutResult.error || 'Unknown error',
      }))
    );

    // Publish failure event
    await publishSettlementEvent('settlement.failed', {
      settlement_id: settlement.id,
      batch_id: settlement.settlement_batch_id,
      recipient_id: settlement.recipient_id,
      error: payoutResult.error,
    });
  }
}

/**
 * Execute the actual payout for a settlement
 * In production, integrate with wallet service or bank transfer API
 */
async function executeSettlementPayout(
  settlement: any,
  splits: any[]
): Promise<{
  success: boolean;
  payout_id?: string;
  method?: 'wallet' | 'bank_transfer' | 'check';
  reference?: string;
  error?: string;
  failed_splits?: string[];
}> {
  try {
    // STEP 1: Determine payout method based on recipient configuration
    // TODO: Query recipient preferences from wallet/merchants service
    const payout_method = 'wallet' as 'wallet' | 'bank_transfer' | 'check';

    // STEP 2: Execute payout based on method
    if (payout_method === 'wallet') {
      return await executeWalletPayout(settlement, splits);
    } else if (payout_method === 'bank_transfer') {
      return await executeBankTransferPayout(settlement, splits);
    } else if (payout_method === 'check') {
      return await executeCheckPayout(settlement, splits);
    } else {
      throw new Error(`Unsupported payout method: ${payout_method}`);
    }
  } catch (error: any) {
    console.error('[SettlementProcessor] Payout execution error:', error);
    return {
      success: false,
      error: error.message || 'Payout execution failed',
    };
  }
}

/**
 * Execute wallet payout (internal transfer to recipient's wallet)
 */
async function executeWalletPayout(
  settlement: any,
  splits: any[]
): Promise<{
  success: boolean;
  payout_id?: string;
  method: 'wallet';
  reference?: string;
  error?: string;
}> {
  // TODO: Integrate with Wallet Service (Brique 57-59)
  // POST to wallet service to credit recipient's wallet

  const payout_id = `PAYOUT-WALLET-${Date.now()}`;
  const reference = `${settlement.settlement_batch_id}-${payout_id}`;

  console.log(
    `[SettlementProcessor] Executing wallet payout: ${settlement.total_amount} ${settlement.currency} to ${settlement.recipient_id}`
  );

  // Simulate wallet API call
  try {
    // const response = await fetch(`${WALLET_API_URL}/api/wallet/credit`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     recipient_id: settlement.recipient_id,
    //     amount: settlement.total_amount,
    //     currency: settlement.currency,
    //     reference: reference,
    //     metadata: { settlement_id: settlement.id, batch_id: settlement.settlement_batch_id }
    //   })
    // });

    // For now, simulate success
    return {
      success: true,
      payout_id,
      method: 'wallet',
      reference,
    };
  } catch (error: any) {
    return {
      success: false,
      method: 'wallet',
      error: error.message,
    };
  }
}

/**
 * Execute bank transfer payout
 */
async function executeBankTransferPayout(
  settlement: any,
  splits: any[]
): Promise<{
  success: boolean;
  payout_id?: string;
  method: 'bank_transfer';
  reference?: string;
  error?: string;
}> {
  // TODO: Integrate with bank transfer provider (Stripe Payouts, etc.)

  const payout_id = `PAYOUT-BANK-${Date.now()}`;
  const reference = `${settlement.settlement_batch_id}-${payout_id}`;

  console.log(
    `[SettlementProcessor] Executing bank transfer: ${settlement.total_amount} ${settlement.currency} to ${settlement.recipient_id}`
  );

  // Simulate bank transfer API call
  return {
    success: true,
    payout_id,
    method: 'bank_transfer',
    reference,
  };
}

/**
 * Execute check payout
 */
async function executeCheckPayout(
  settlement: any,
  splits: any[]
): Promise<{
  success: boolean;
  payout_id?: string;
  method: 'check';
  reference?: string;
  error?: string;
}> {
  // TODO: Integrate with check printing service

  const payout_id = `PAYOUT-CHECK-${Date.now()}`;
  const reference = `${settlement.settlement_batch_id}-${payout_id}`;

  console.log(
    `[SettlementProcessor] Scheduling check issuance: ${settlement.total_amount} ${settlement.currency} to ${settlement.recipient_id}`
  );

  return {
    success: true,
    payout_id,
    method: 'check',
    reference,
  };
}

/**
 * Publish settlement event to Kafka
 */
async function publishSettlementEvent(eventType: string, payload: any): Promise<void> {
  try {
    await producer.send({
      topic: 'split-settlements',
      messages: [
        {
          key: payload.settlement_id,
          value: JSON.stringify({
            event_type: eventType,
            timestamp: new Date().toISOString(),
            payload,
          }),
        },
      ],
    });

    console.log(`[SettlementProcessor] Published event: ${eventType}`);
  } catch (error) {
    console.error('[SettlementProcessor] Error publishing Kafka event:', error);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  console.log('[SettlementProcessor] Shutting down gracefully...');
  await producer.disconnect();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start worker if run directly
if (require.main === module) {
  startSettlementProcessor().catch((error) => {
    console.error('[SettlementProcessor] Fatal error:', error);
    process.exit(1);
  });
}
