/**
 * Brique 51 - Refunds & Reversals
 * Refund Job Queue (In-Memory Queue)
 */

import { pool } from "../utils/db.js";

interface RefundJob {
  refundId: string;
  enqueuedAt: Date;
}

const queue: RefundJob[] = [];
let processing = false;

/**
 * Enqueue refund job for background processing
 */
export async function enqueueRefundJob(refundId: string): Promise<void> {
  queue.push({
    refundId,
    enqueuedAt: new Date(),
  });

  console.log(`[Queue] Enqueued refund job: ${refundId} (queue size: ${queue.length})`);

  // Start processing if not already running
  if (!processing) {
    processQueue();
  }
}

/**
 * Process queued refund jobs
 */
async function processQueue(): Promise<void> {
  if (processing || queue.length === 0) {
    return;
  }

  processing = true;

  while (queue.length > 0) {
    const job = queue.shift();
    if (!job) break;

    try {
      console.log(`[Queue] Processing refund job: ${job.refundId}`);

      // Import worker dynamically to avoid circular dependency
      const { processRefundJob } = await import("./refundWorker.js");
      await processRefundJob(job.refundId);
    } catch (err) {
      console.error(`[Queue] Job processing error for ${job?.refundId}:`, err);
    }
  }

  processing = false;
}

/**
 * Get queue status
 */
export function getQueueStatus(): { size: number; processing: boolean } {
  return {
    size: queue.length,
    processing,
  };
}
