/**
 * Scheduled Report Worker
 * Executes scheduled reports based on CRON expressions
 */

import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import { getReportGenerator } from '../services/reportGenerator';
import { getStorageService } from '../services/storage';
import { getMailerService } from '../services/mailer';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

const CHECK_INTERVAL = parseInt(process.env.REPORT_SCHEDULER_INTERVAL || '60000', 10); // 1 minute

interface ReportSchedule {
  id: string;
  merchant_id?: string;
  org_id?: string;
  created_by: string;
  name: string;
  format: 'csv' | 'xlsx' | 'pdf';
  query_params: any;
  recipients: Array<{ email: string; role?: string }>;
  webhook_url?: string;
  cron_expr: string;
  delivery_method: string;
}

export async function runScheduledReports() {
  try {
    console.log('🔍 Checking for scheduled reports to execute...');

    // Fetch due schedules
    const { rows: schedules } = await pool.query<ReportSchedule>(
      `SELECT * FROM analytics_report_schedules
       WHERE status = 'active'
         AND is_enabled = true
         AND (next_run_at IS NULL OR next_run_at <= now())
       ORDER BY next_run_at ASC
       LIMIT 10`
    );

    if (schedules.length === 0) {
      console.log('No scheduled reports due at this time');
      return;
    }

    console.log(`Found ${schedules.length} scheduled report(s) to execute`);

    for (const schedule of schedules) {
      try {
        await executeScheduledReport(schedule);
      } catch (error) {
        console.error(`Error executing schedule ${schedule.id}:`, error);
        await recordScheduleError(schedule.id, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    console.log('✅ Scheduled reports check complete');
  } catch (error) {
    console.error('Error in report scheduler:', error);
  }
}

async function executeScheduledReport(schedule: ReportSchedule) {
  console.log(`📊 Executing report: ${schedule.name} (${schedule.id})`);

  const startTime = Date.now();

  try {
    // Update status to running
    await pool.query(
      `UPDATE analytics_report_schedules
       SET last_run_at = now(), last_run_status = 'running'
       WHERE id = $1`,
      [schedule.id]
    );

    // Generate report
    const reportGenerator = getReportGenerator(pool);
    const report = await reportGenerator.generateReport(
      schedule.query_params,
      schedule.format,
      schedule.name
    );

    console.log(`Generated ${schedule.format} report: ${report.fileName} (${report.rowCount} rows, ${report.fileSizeBytes} bytes)`);

    // Upload to S3
    const storageService = getStorageService();
    const uploadResult = await storageService.uploadFile(
      report.filePath,
      report.fileName,
      {
        scheduleId: schedule.id,
        merchantId: schedule.merchant_id || 'system',
        reportName: schedule.name,
      }
    );

    console.log(`Uploaded to storage: ${uploadResult.key}`);

    // Record audit log
    await pool.query(
      `INSERT INTO analytics_report_audit
       (schedule_id, merchant_id, org_id, report_name, format, query_params, file_url, file_size_bytes, file_expires_at, row_count, execution_time_ms, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        schedule.id,
        schedule.merchant_id || null,
        schedule.org_id || null,
        schedule.name,
        schedule.format,
        schedule.query_params,
        uploadResult.url,
        report.fileSizeBytes,
        uploadResult.expiresAt,
        report.rowCount,
        Date.now() - startTime,
        'completed',
        schedule.created_by,
      ]
    );

    // Send notifications
    const mailerService = getMailerService();

    if (schedule.delivery_method === 'email' || schedule.delivery_method === 'both') {
      for (const recipient of schedule.recipients) {
        try {
          await mailerService.sendReportNotification(
            recipient.email,
            schedule.name,
            uploadResult.url,
            uploadResult.expiresAt
          );
          console.log(`📧 Sent email to ${recipient.email}`);
        } catch (error) {
          console.error(`Failed to send email to ${recipient.email}:`, error);
        }
      }
    }

    if (schedule.delivery_method === 'webhook' || schedule.delivery_method === 'both') {
      if (schedule.webhook_url) {
        try {
          await sendWebhookNotification(schedule.webhook_url, {
            scheduleId: schedule.id,
            reportName: schedule.name,
            format: schedule.format,
            downloadUrl: uploadResult.url,
            expiresAt: uploadResult.expiresAt,
            rowCount: report.rowCount,
            generatedAt: new Date().toISOString(),
          });
          console.log(`🔗 Sent webhook to ${schedule.webhook_url}`);
        } catch (error) {
          console.error(`Failed to send webhook:`, error);
        }
      }
    }

    // Update schedule status
    await pool.query(
      `UPDATE analytics_report_schedules
       SET last_run_at = now(),
           last_run_status = 'success',
           run_count = run_count + 1,
           error_count = 0,
           last_error = NULL,
           next_run_at = calculate_next_run(cron_expr, now())
       WHERE id = $1`,
      [schedule.id]
    );

    console.log(`✅ Report completed: ${schedule.name}`);
  } catch (error) {
    console.error(`❌ Report failed: ${schedule.name}`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update schedule with error
    await pool.query(
      `UPDATE analytics_report_schedules
       SET last_run_at = now(),
           last_run_status = 'failed',
           error_count = error_count + 1,
           last_error = $2,
           next_run_at = calculate_next_run(cron_expr, now())
       WHERE id = $1`,
      [schedule.id, errorMessage]
    );

    // Notify recipients of failure
    const mailerService = getMailerService();
    for (const recipient of schedule.recipients) {
      try {
        await mailerService.sendReportErrorNotification(
          recipient.email,
          schedule.name,
          errorMessage
        );
      } catch (err) {
        console.error(`Failed to send error notification to ${recipient.email}:`, err);
      }
    }

    throw error;
  }
}

async function recordScheduleError(scheduleId: string, errorMessage: string) {
  try {
    await pool.query(
      `UPDATE analytics_report_schedules
       SET last_run_status = 'failed',
           error_count = error_count + 1,
           last_error = $2,
           next_run_at = calculate_next_run(cron_expr, now())
       WHERE id = $1`,
      [scheduleId, errorMessage]
    );
  } catch (error) {
    console.error('Failed to record schedule error:', error);
  }
}

async function sendWebhookNotification(url: string, data: any) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Molam-Analytics/1.0',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Webhook failed with status ${response.status}`);
  }
}

// Continuous scheduler
async function start() {
  console.log('🚀 Starting scheduled reports worker...');
  console.log(`Check interval: ${CHECK_INTERVAL}ms`);

  // Run immediately
  await runScheduledReports();

  // Schedule periodic checks
  setInterval(async () => {
    await runScheduledReports();
  }, CHECK_INTERVAL);

  console.log('✅ Scheduled reports worker is running');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await pool.end();
  process.exit(0);
});

// Start if run directly
if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start report scheduler:', error);
    process.exit(1);
  });
}

export { runScheduledReports };
