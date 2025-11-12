/**
 * Brique 70octies - Worker Index
 * Starts all CRON workers for loyalty system
 */

import { startTierEvaluator } from './tierEvaluator';
import { startExpiryWorker } from './expiryWorker';
import { startCampaignExecutor } from './campaignExecutor';

/**
 * Start all loyalty workers
 */
export function startAllWorkers() {
  console.log('[WORKERS] Starting all loyalty workers...');

  try {
    startTierEvaluator();
    startExpiryWorker();
    startCampaignExecutor();

    console.log('[WORKERS] All workers started successfully');
  } catch (error) {
    console.error('[WORKERS] Failed to start workers:', error);
    throw error;
  }
}

/**
 * Export individual worker controls
 */
export {
  startTierEvaluator,
  manualTierEvaluation
} from './tierEvaluator';

export {
  startExpiryWorker,
  manualExpiry
} from './expiryWorker';

export {
  startCampaignExecutor,
  manualCampaignExecution,
  scheduleCampaign
} from './campaignExecutor';
