import { pool } from '../utils/db';

/**
 * Sync disputes from card networks / banks
 */
export async function ingestNetworkDisputes(data: any[]) {
  for (const d of data) {
    const existing = await pool.query(
      `SELECT * FROM disputes WHERE network_ref = $1 LIMIT 1`,
      [d.network_ref]
    );

    if (!existing.rowCount) {
      await pool.query(
        `INSERT INTO disputes(connect_tx_id, merchant_id, amount, currency, reason, network_ref, status)
         VALUES($1, $2, $3, $4, $5, $6, 'open')`,
        [d.connect_tx_id, d.merchant_id, d.amount, d.currency, d.reason, d.network_ref]
      );
    }
  }
}

/**
 * Poll card network APIs for new disputes
 */
export async function pollNetworkAPIs() {
  console.log('[Worker] Polling card networks for new disputes...');

  // Example: Poll Visa, Mastercard, Amex APIs
  // In production, these would be actual API calls to card networks

  try {
    // Visa disputes
    // const visaDisputes = await fetchVisaDisputes();
    // await ingestNetworkDisputes(visaDisputes);

    // Mastercard disputes
    // const mcDisputes = await fetchMastercardDisputes();
    // await ingestNetworkDisputes(mcDisputes);

    // Amex disputes
    // const amexDisputes = await fetchAmexDisputes();
    // await ingestNetworkDisputes(amexDisputes);

    console.log('[Worker] Polling complete');
  } catch (e: any) {
    console.error('[Worker] Error polling networks:', e.message);
  }
}

/**
 * Check for disputes approaching deadline
 */
export async function checkDisputeDeadlines() {
  console.log('[Worker] Checking dispute deadlines...');

  try {
    const { rows } = await pool.query(
      `SELECT d.*, m.email as merchant_email
       FROM disputes d
       LEFT JOIN merchants m ON m.id = d.merchant_id
       WHERE d.status IN ('open', 'evidence_submitted', 'under_review')
         AND d.respond_by <= NOW() + INTERVAL '3 days'
         AND d.respond_by > NOW()`
    );

    for (const dispute of rows) {
      console.log(`[Worker] Dispute ${dispute.id} approaching deadline: ${dispute.respond_by}`);

      // Send notification (would integrate with notification service)
      // await sendEmail(dispute.merchant_email, 'Dispute deadline approaching', ...);

      // Log alert
      await pool.query(
        `INSERT INTO dispute_logs(dispute_id, action, actor, details)
         VALUES($1, 'deadline_alert', 'system', $2)`,
        [dispute.id, JSON.stringify({ days_remaining: 3, respond_by: dispute.respond_by })]
      );
    }

    console.log(`[Worker] Found ${rows.length} disputes approaching deadline`);
  } catch (e: any) {
    console.error('[Worker] Error checking deadlines:', e.message);
  }
}

/**
 * Auto-escalate disputes with missing evidence
 */
export async function autoEscalateDisputes() {
  console.log('[Worker] Auto-escalating disputes...');

  try {
    const { rows } = await pool.query(
      `SELECT d.*
       FROM disputes d
       WHERE d.status = 'open'
         AND d.respond_by < NOW()
         AND NOT EXISTS (
           SELECT 1 FROM dispute_evidence de WHERE de.dispute_id = d.id
         )`
    );

    for (const dispute of rows) {
      console.log(`[Worker] Auto-escalating dispute ${dispute.id} (no evidence submitted)`);

      await pool.query(
        `UPDATE disputes
         SET status = 'lost', resolved_at = NOW()
         WHERE id = $1`,
        [dispute.id]
      );

      await pool.query(
        `INSERT INTO dispute_logs(dispute_id, action, actor, details)
         VALUES($1, 'auto_escalated', 'system', $2)`,
        [dispute.id, JSON.stringify({ reason: 'no_evidence_by_deadline' })]
      );

      // Charge fees
      await pool.query(
        `UPDATE dispute_fees
         SET status = 'charged', charged_at = NOW()
         WHERE dispute_id = $1 AND fee_type = 'bank_fee'`,
        [dispute.id]
      );

      // Add chargeback loss
      await pool.query(
        `INSERT INTO dispute_fees(dispute_id, fee_type, amount, currency, status, charged_at)
         VALUES($1, 'chargeback_loss', $2, $3, 'charged', NOW())`,
        [dispute.id, dispute.amount, dispute.currency]
      );
    }

    console.log(`[Worker] Auto-escalated ${rows.length} disputes`);
  } catch (e: any) {
    console.error('[Worker] Error auto-escalating:', e.message);
  }
}

/**
 * Generate dispute reports
 */
export async function generateDisputeReports() {
  console.log('[Worker] Generating dispute reports...');

  try {
    // Weekly report
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) as total_disputes,
         COUNT(*) FILTER (WHERE status = 'won') as won,
         COUNT(*) FILTER (WHERE status = 'lost') as lost,
         SUM(amount) FILTER (WHERE status = 'lost') as total_lost_amount,
         ROUND(
           100.0 * COUNT(*) FILTER (WHERE status = 'won') /
           NULLIF(COUNT(*) FILTER (WHERE status IN ('won', 'lost')), 0),
           2
         ) as win_rate_pct
       FROM disputes
       WHERE created_at >= NOW() - INTERVAL '7 days'`
    );

    const report = rows[0];
    console.log('[Worker] Weekly Dispute Report:', {
      total: report.total_disputes,
      won: report.won,
      lost: report.lost,
      lost_amount: report.total_lost_amount,
      win_rate: `${report.win_rate_pct}%`
    });

    // Store report (optional)
    // await pool.query(
    //   `INSERT INTO reports(type, period_start, period_end, data)
    //    VALUES('dispute_weekly', NOW() - INTERVAL '7 days', NOW(), $1)`,
    //   [JSON.stringify(report)]
    // );

  } catch (e: any) {
    console.error('[Worker] Error generating reports:', e.message);
  }
}

/**
 * Main worker loop
 */
export async function runDisputeWorker() {
  console.log('[Worker] Dispute worker started');

  // Run immediately on startup
  await pollNetworkAPIs();
  await checkDisputeDeadlines();
  await autoEscalateDisputes();
  await generateDisputeReports();

  // Schedule periodic runs
  setInterval(async () => {
    await pollNetworkAPIs();
  }, 15 * 60 * 1000); // Every 15 minutes

  setInterval(async () => {
    await checkDisputeDeadlines();
  }, 60 * 60 * 1000); // Every hour

  setInterval(async () => {
    await autoEscalateDisputes();
  }, 60 * 60 * 1000); // Every hour

  setInterval(async () => {
    await generateDisputeReports();
  }, 24 * 60 * 60 * 1000); // Every 24 hours

  console.log('[Worker] Periodic tasks scheduled');
}

// Run worker if executed directly
if (require.main === module) {
  runDisputeWorker().catch((e) => {
    console.error('[Worker] Fatal error:', e);
    process.exit(1);
  });
}