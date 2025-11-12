import { pool } from '../utils/db';
import { NetworkConnectorRegistry } from '../connectors/networkConnector';
import '../connectors/sandboxConnector'; // Auto-register sandbox
import { assembleEvidencePackage } from '../services/evidenceService';
import fetch from 'node-fetch';

const POLL_INTERVAL = 5000; // 5 seconds
const WEBHOOKS_URL = process.env.WEBHOOKS_URL || 'http://localhost:8045';

/**
 * Dispute Actions Worker
 * Processes queued dispute actions (submit_to_network, refund, etc.)
 */

async function tickOnce() {
  const client = await pool.connect();
  try {
    // Lock and fetch queued actions
    const { rows: actions } = await client.query(
      `UPDATE dispute_actions
       SET status = 'processing', updated_at = NOW()
       WHERE id IN (
         SELECT id FROM dispute_actions
         WHERE status = 'queued' AND scheduled_at <= NOW()
         ORDER BY priority DESC, scheduled_at ASC
         LIMIT 20
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`
    );

    if (actions.length === 0) {
      return;
    }

    console.log(`[DisputeActionsWorker] Processing ${actions.length} actions`);

    for (const action of actions) {
      try {
        await processAction(action);
      } catch (error: any) {
        console.error(`[DisputeActionsWorker] Action ${action.id} failed:`, error.message);
        await handleActionFailure(action, error.message);
      }
    }
  } finally {
    client.release();
  }
}

/**
 * Process a single action
 */
async function processAction(action: any) {
  console.log(`[DisputeActionsWorker] Processing action ${action.action_type} for dispute ${action.dispute_id}`);

  switch (action.action_type) {
    case 'request_evidence':
      await handleRequestEvidence(action);
      break;
    case 'submit_to_network':
      await handleSubmitToNetwork(action);
      break;
    case 'auto_accept':
      await handleAutoAccept(action);
      break;
    case 'auto_refute':
      await handleAutoRefute(action);
      break;
    case 'refund':
      await handleRefund(action);
      break;
    case 'issue_credit':
      await handleIssueCredit(action);
      break;
    case 'escalate':
      await handleEscalate(action);
      break;
    case 'close':
      await handleClose(action);
      break;
    default:
      throw new Error(`Unknown action type: ${action.action_type}`);
  }

  // Mark as done
  await pool.query(
    `UPDATE dispute_actions SET status = 'done', processed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [action.id]
  );

  console.log(`[DisputeActionsWorker] Action ${action.id} completed`);
}

/**
 * Handle request_evidence action
 */
async function handleRequestEvidence(action: any) {
  const { dispute_id } = action;

  // Update dispute status
  await pool.query('UPDATE disputes SET status = $1, updated_at = NOW() WHERE id = $2', [
    'evidence_requested',
    dispute_id,
  ]);

  // Create event
  await pool.query(
    `INSERT INTO dispute_events (dispute_id, actor, actor_type, action, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [dispute_id, 'system', 'system', 'evidence_requested', JSON.stringify(action.payload)]
  );

  // Get dispute details for webhook
  const { rows } = await pool.query('SELECT * FROM disputes WHERE id = $1', [dispute_id]);
  const dispute = rows[0];

  // Publish webhook
  await fetch(`${WEBHOOKS_URL}/api/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: dispute.merchant_id,
      event_type: 'dispute.evidence_requested',
      payload: {
        dispute_id: dispute.id,
        dispute_ref: dispute.dispute_ref,
        deadline: dispute.network_deadline,
      },
    }),
  });
}

/**
 * Handle submit_to_network action
 */
async function handleSubmitToNetwork(action: any) {
  const { dispute_id, payload } = action;

  // Get dispute
  const { rows: disputes } = await pool.query('SELECT * FROM disputes WHERE id = $1', [dispute_id]);
  if (disputes.length === 0) throw new Error('Dispute not found');
  const dispute = disputes[0];

  // Assemble evidence package
  const evidencePackage = await assembleEvidencePackage(dispute_id);

  // Get network connector
  const network = dispute.network || 'sandbox';
  if (!NetworkConnectorRegistry.has(network)) {
    throw new Error(`No connector available for network: ${network}`);
  }

  const connector = NetworkConnectorRegistry.get(network);

  // Submit to network
  const submission = {
    dispute_id: dispute.id,
    dispute_ref: dispute.dispute_ref,
    merchant_id: dispute.merchant_id,
    amount: dispute.amount,
    currency: dispute.currency,
    reason_code: dispute.reason_code,
    evidence: evidencePackage.evidence.map((e) => ({
      type: e.evidence_type,
      s3_key: e.file_s3_key,
      file_name: e.file_name,
      mime_type: e.mime_type,
    })),
    notes: payload.notes || '',
  };

  const response = await connector.submitDispute(submission);

  // Update dispute
  await pool.query(
    `UPDATE disputes
     SET status = $1, submitted_at = NOW(), network_response = $2, updated_at = NOW()
     WHERE id = $3`,
    [response.success ? 'submitted' : 'evidence_requested', JSON.stringify(response), dispute_id]
  );

  // Create event
  await pool.query(
    `INSERT INTO dispute_events (dispute_id, actor, actor_type, action, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [dispute_id, payload.requested_by || 'system', 'ops', 'submitted_to_network', JSON.stringify(response)]
  );

  // Publish webhook
  await fetch(`${WEBHOOKS_URL}/api/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: dispute.merchant_id,
      event_type: 'dispute.submitted',
      payload: {
        dispute_id: dispute.id,
        provider_ref: response.provider_ref,
        success: response.success,
      },
    }),
  });
}

/**
 * Handle auto_accept action (high confidence loss)
 */
async function handleAutoAccept(action: any) {
  const { dispute_id, payload } = action;

  // Get dispute
  const { rows } = await pool.query('SELECT * FROM disputes WHERE id = $1', [dispute_id]);
  const dispute = rows[0];

  // Update status to lost
  await pool.query(
    `UPDATE disputes SET status = 'lost', outcome = 'lost', resolved_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [dispute_id]
  );

  // Create event
  await pool.query(
    `INSERT INTO dispute_events (dispute_id, actor, actor_type, action, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [dispute_id, 'system', 'system', 'auto_accepted', JSON.stringify(payload)]
  );

  // Create credit note (chargeback to merchant)
  await pool.query(
    `INSERT INTO credit_notes (merchant_id, reason, amount, currency, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      dispute.merchant_id,
      'chargeback',
      dispute.amount,
      dispute.currency,
      'issued',
      JSON.stringify({ dispute_id: dispute_id, auto_accepted: true }),
    ]
  );

  console.log(`[DisputeActionsWorker] Auto-accepted dispute ${dispute_id} (SIRA confidence: ${payload.confidence})`);
}

/**
 * Handle auto_refute action (high confidence win)
 */
async function handleAutoRefute(action: any) {
  // Submit evidence automatically
  await handleSubmitToNetwork(action);
}

/**
 * Handle refund action
 */
async function handleRefund(action: any) {
  const { dispute_id, payload } = action;

  // Create refund via payments service
  const { rows } = await pool.query('SELECT * FROM disputes WHERE id = $1', [dispute_id]);
  const dispute = rows[0];

  if (!dispute.payment_id) {
    throw new Error('Cannot refund: no payment_id associated');
  }

  // Call refunds API (B54)
  await fetch(`${process.env.PAYMENTS_URL}/api/refunds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payment_id: dispute.payment_id,
      amount: payload.amount || dispute.amount,
      reason: 'dispute_resolution',
      metadata: { dispute_id: dispute_id },
    }),
  });

  // Update dispute
  await pool.query('UPDATE disputes SET status = $1, outcome = $2, resolved_at = NOW() WHERE id = $3', [
    'settled',
    'settled',
    dispute_id,
  ]);
}

/**
 * Handle issue_credit action
 */
async function handleIssueCredit(action: any) {
  const { dispute_id, payload } = action;

  const { rows } = await pool.query('SELECT * FROM disputes WHERE id = $1', [dispute_id]);
  const dispute = rows[0];

  // Create credit note
  await pool.query(
    `INSERT INTO credit_notes (merchant_id, reason, amount, currency, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      dispute.merchant_id,
      payload.reason || 'dispute_chargeback',
      payload.amount || dispute.amount,
      dispute.currency,
      'issued',
      JSON.stringify({ dispute_id: dispute_id }),
    ]
  );
}

/**
 * Handle escalate action
 */
async function handleEscalate(action: any) {
  // Create ops ticket / send alert
  console.log(`[DisputeActionsWorker] Escalating dispute ${action.dispute_id} to ops`);
  // TODO: Integrate with ops ticketing system
}

/**
 * Handle close action
 */
async function handleClose(action: any) {
  await pool.query('UPDATE disputes SET status = $1, updated_at = NOW() WHERE id = $2', ['closed', action.dispute_id]);
}

/**
 * Handle action failure
 */
async function handleActionFailure(action: any, errorMessage: string) {
  const newAttempts = action.attempts + 1;

  if (newAttempts >= action.max_attempts) {
    // Max retries reached, mark as failed
    await pool.query(
      `UPDATE dispute_actions SET status = 'failed', attempts = $1, last_error = $2, updated_at = NOW() WHERE id = $3`,
      [newAttempts, errorMessage, action.id]
    );

    // Create escalation event
    await pool.query(
      `INSERT INTO dispute_events (dispute_id, actor, actor_type, action, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        action.dispute_id,
        'system',
        'system',
        'action_failed',
        JSON.stringify({ action_id: action.id, action_type: action.action_type, error: errorMessage }),
      ]
    );

    console.error(`[DisputeActionsWorker] Action ${action.id} permanently failed after ${newAttempts} attempts`);
  } else {
    // Retry with exponential backoff
    const retryDelay = Math.min(Math.pow(2, newAttempts) * 1000, 300000); // Max 5 minutes
    const scheduledAt = new Date(Date.now() + retryDelay);

    await pool.query(
      `UPDATE dispute_actions
       SET status = 'queued', attempts = $1, last_error = $2, scheduled_at = $3, updated_at = NOW()
       WHERE id = $4`,
      [newAttempts, errorMessage, scheduledAt, action.id]
    );

    console.log(`[DisputeActionsWorker] Action ${action.id} will retry in ${retryDelay}ms (attempt ${newAttempts})`);
  }
}

// Main loop
async function run() {
  console.log('[DisputeActionsWorker] Starting...');

  setInterval(async () => {
    try {
      await tickOnce();
    } catch (error: any) {
      console.error('[DisputeActionsWorker] Error in tick:', error.message);
    }
  }, POLL_INTERVAL);

  // Run immediately on start
  await tickOnce();
}

run().catch((error) => {
  console.error('[DisputeActionsWorker] Fatal error:', error);
  process.exit(1);
});
