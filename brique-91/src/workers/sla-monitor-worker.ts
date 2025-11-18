// SLA Monitor Worker
// Periodically monitors and reports on SLAs

import { SLAMonitor } from '../services/sla-monitor';

const POLL_INTERVAL_MS = parseInt(process.env.SLA_MONITOR_POLL_MS || '3600000'); // Default: 1 hour

/**
 * SLA Monitor Worker
 */
export class SLAMonitorWorker {
  private monitor: SLAMonitor;
  private isRunning: boolean = false;

  constructor() {
    this.monitor = new SLAMonitor();
  }

  /**
   * Start the worker
   */
  async start() {
    this.isRunning = true;
    console.log('[SLAMonitorWorker] Starting...');
    console.log(`[SLAMonitorWorker] Poll interval: ${POLL_INTERVAL_MS}ms (${POLL_INTERVAL_MS / 60000} minutes)`);

    // Run immediately on start
    await this.runMonitoring();

    while (this.isRunning) {
      await this.sleep(POLL_INTERVAL_MS);

      try {
        await this.runMonitoring();
      } catch (error) {
        console.error('[SLAMonitorWorker] Error in monitoring cycle:', error);
      }
    }

    console.log('[SLAMonitorWorker] Stopped');
  }

  /**
   * Stop the worker
   */
  stop() {
    this.isRunning = false;
    console.log('[SLAMonitorWorker] Stopping...');
  }

  /**
   * Run monitoring cycle
   */
  private async runMonitoring(): Promise<void> {
    console.log('[SLAMonitorWorker] Running SLA monitoring...');

    try {
      // Generate 24-hour report
      const report = await this.monitor.generateReport(24);

      // Print summary
      console.log('[SLAMonitorWorker] SLA Report Summary:');
      console.log(`  Overall Status: ${report.overall_status.toUpperCase()}`);
      console.log(`  Metrics Checked: ${report.metrics.length}`);

      // Print each metric
      for (const metric of report.metrics) {
        const statusIcon = metric.status === 'ok' ? '✓' : metric.status === 'warning' ? '⚠' : '✗';
        const valueStr = metric.metric_name.includes('Rate')
          ? `${(metric.metric_value * 100).toFixed(2)}%`
          : metric.metric_value.toFixed(2);
        const thresholdStr = metric.metric_name.includes('Rate')
          ? `${(metric.threshold * 100).toFixed(2)}%`
          : metric.threshold.toFixed(2);

        console.log(`  ${statusIcon} ${metric.metric_name}: ${valueStr} (threshold: ${thresholdStr})`);
      }

      // Send alerts for breached SLAs
      if (report.breached_slas.length > 0) {
        console.log(`[SLAMonitorWorker] ⚠ ${report.breached_slas.length} SLA(s) breached:`);

        for (const metric of report.metrics) {
          if (metric.status !== 'ok') {
            console.log(`  - ${metric.metric_name}`);
            await this.monitor.sendAlert(metric);
          }
        }
      } else {
        console.log('[SLAMonitorWorker] ✓ All SLAs are within acceptable range');
      }

      // Generate additional period reports
      if (report.overall_status !== 'ok') {
        console.log('[SLAMonitorWorker] Generating extended reports due to SLA breach...');

        // 7-day report
        const weekReport = await this.monitor.generateReport(24 * 7);
        console.log(`[SLAMonitorWorker] 7-day status: ${weekReport.overall_status}`);
      }

    } catch (error) {
      console.error('[SLAMonitorWorker] Error generating SLA report:', error);
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main entry point
 */
if (require.main === module) {
  const worker = new SLAMonitorWorker();

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, stopping worker...');
    worker.stop();
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, stopping worker...');
    worker.stop();
  });

  // Start worker
  worker.start().catch(error => {
    console.error('Fatal error in worker:', error);
    process.exit(1);
  });
}

export default SLAMonitorWorker;
