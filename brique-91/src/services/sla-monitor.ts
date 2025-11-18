// SLA Monitoring Service
// Tracks and monitors treasury operations SLAs

import { pool } from '../utils/db';

interface SLAMetric {
  metric_name: string;
  metric_value: number;
  threshold: number;
  status: 'ok' | 'warning' | 'critical';
  timestamp: Date;
}

interface SLAReport {
  period: string;
  metrics: SLAMetric[];
  overall_status: 'ok' | 'warning' | 'critical';
  breached_slas: string[];
}

// SLA Thresholds
const SLA_THRESHOLDS = {
  // Reconciliation SLAs
  RECONCILIATION_MATCH_RATE: 0.99,           // 99% match rate
  RECONCILIATION_AUTO_MATCH_RATE: 0.95,      // 95% auto-match rate
  RECONCILIATION_TIME_P95_HOURS: 24,         // P95 < 24 hours

  // Ingestion SLAs
  INGESTION_SUCCESS_RATE: 0.98,              // 98% success rate
  INGESTION_TIME_P95_MINUTES: 10,            // P95 < 10 minutes

  // Plan Execution SLAs
  PLAN_SUCCESS_RATE: 0.99,                   // 99% success rate
  PLAN_EXECUTION_TIME_P95_MINUTES: 30,       // P95 < 30 minutes

  // Float Management SLAs
  SWEEP_EXECUTION_RATE: 0.99,                // 99% sweep execution rate
  BALANCE_ACCURACY: 0.999,                   // 99.9% balance accuracy
};

/**
 * SLA Monitoring Service
 */
export class SLAMonitor {
  /**
   * Generate SLA report for a time period
   */
  async generateReport(hours: number = 24): Promise<SLAReport> {
    console.log(`[SLAMonitor] Generating SLA report for last ${hours} hours`);

    const metrics: SLAMetric[] = [];

    // Reconciliation Metrics
    metrics.push(await this.calculateReconciliationMatchRate(hours));
    metrics.push(await this.calculateReconciliationAutoMatchRate(hours));
    metrics.push(await this.calculateReconciliationTimeP95(hours));

    // Ingestion Metrics
    metrics.push(await this.calculateIngestionSuccessRate(hours));
    metrics.push(await this.calculateIngestionTimeP95(hours));

    // Plan Execution Metrics
    metrics.push(await this.calculatePlanSuccessRate(hours));
    metrics.push(await this.calculatePlanExecutionTimeP95(hours));

    // Float Management Metrics
    metrics.push(await this.calculateSweepExecutionRate(hours));

    // Determine overall status
    const breached_slas = metrics
      .filter(m => m.status === 'critical' || m.status === 'warning')
      .map(m => m.metric_name);

    const overall_status = metrics.some(m => m.status === 'critical')
      ? 'critical'
      : metrics.some(m => m.status === 'warning')
      ? 'warning'
      : 'ok';

    // Store metrics in database
    await this.storeMetrics(metrics);

    return {
      period: `${hours}h`,
      metrics,
      overall_status,
      breached_slas
    };
  }

  /**
   * Calculate reconciliation match rate
   */
  private async calculateReconciliationMatchRate(hours: number): Promise<SLAMetric> {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE reconciliation_status = 'matched') as matched_count,
         COUNT(*) as total_count
       FROM bank_statement_lines
       WHERE created_at > NOW() - INTERVAL '${hours} hours'
         AND direction = 'debit'`
    );

    const matched_count = parseInt(rows[0].matched_count || '0');
    const total_count = parseInt(rows[0].total_count || '0');

    const metric_value = total_count > 0 ? matched_count / total_count : 1.0;
    const threshold = SLA_THRESHOLDS.RECONCILIATION_MATCH_RATE;

    return {
      metric_name: 'Reconciliation Match Rate',
      metric_value,
      threshold,
      status: this.getStatus(metric_value, threshold),
      timestamp: new Date()
    };
  }

  /**
   * Calculate reconciliation auto-match rate
   */
  private async calculateReconciliationAutoMatchRate(hours: number): Promise<SLAMetric> {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE match_method IN ('exact_reference', 'amount_date', 'fuzzy')) as auto_matched_count,
         COUNT(*) FILTER (WHERE reconciliation_status = 'matched') as total_matched
       FROM bank_statement_lines
       WHERE created_at > NOW() - INTERVAL '${hours} hours'
         AND direction = 'debit'`
    );

    const auto_matched_count = parseInt(rows[0].auto_matched_count || '0');
    const total_matched = parseInt(rows[0].total_matched || '0');

    const metric_value = total_matched > 0 ? auto_matched_count / total_matched : 1.0;
    const threshold = SLA_THRESHOLDS.RECONCILIATION_AUTO_MATCH_RATE;

    return {
      metric_name: 'Reconciliation Auto-Match Rate',
      metric_value,
      threshold,
      status: this.getStatus(metric_value, threshold),
      timestamp: new Date()
    };
  }

  /**
   * Calculate reconciliation time P95
   */
  private async calculateReconciliationTimeP95(hours: number): Promise<SLAMetric> {
    const { rows } = await pool.query(
      `SELECT
         PERCENTILE_CONT(0.95) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (matched_at - created_at)) / 3600
         ) as p95_hours
       FROM bank_statement_lines
       WHERE created_at > NOW() - INTERVAL '${hours} hours'
         AND reconciliation_status = 'matched'
         AND matched_at IS NOT NULL`
    );

    const metric_value = parseFloat(rows[0]?.p95_hours || '0');
    const threshold = SLA_THRESHOLDS.RECONCILIATION_TIME_P95_HOURS;

    return {
      metric_name: 'Reconciliation Time P95 (hours)',
      metric_value,
      threshold,
      status: this.getStatusInverse(metric_value, threshold), // Lower is better
      timestamp: new Date()
    };
  }

  /**
   * Calculate ingestion success rate
   */
  private async calculateIngestionSuccessRate(hours: number): Promise<SLAMetric> {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'parsed') as success_count,
         COUNT(*) as total_count
       FROM bank_statements_raw
       WHERE created_at > NOW() - INTERVAL '${hours} hours'`
    );

    const success_count = parseInt(rows[0].success_count || '0');
    const total_count = parseInt(rows[0].total_count || '0');

    const metric_value = total_count > 0 ? success_count / total_count : 1.0;
    const threshold = SLA_THRESHOLDS.INGESTION_SUCCESS_RATE;

    return {
      metric_name: 'Ingestion Success Rate',
      metric_value,
      threshold,
      status: this.getStatus(metric_value, threshold),
      timestamp: new Date()
    };
  }

  /**
   * Calculate ingestion time P95
   */
  private async calculateIngestionTimeP95(hours: number): Promise<SLAMetric> {
    const { rows } = await pool.query(
      `SELECT
         PERCENTILE_CONT(0.95) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (parsed_at - created_at)) / 60
         ) as p95_minutes
       FROM bank_statements_raw
       WHERE created_at > NOW() - INTERVAL '${hours} hours'
         AND status = 'parsed'
         AND parsed_at IS NOT NULL`
    );

    const metric_value = parseFloat(rows[0]?.p95_minutes || '0');
    const threshold = SLA_THRESHOLDS.INGESTION_TIME_P95_MINUTES;

    return {
      metric_name: 'Ingestion Time P95 (minutes)',
      metric_value,
      threshold,
      status: this.getStatusInverse(metric_value, threshold),
      timestamp: new Date()
    };
  }

  /**
   * Calculate plan execution success rate
   */
  private async calculatePlanSuccessRate(hours: number): Promise<SLAMetric> {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed') as success_count,
         COUNT(*) FILTER (WHERE status IN ('completed', 'failed', 'partially_completed')) as total_count
       FROM treasury_plans
       WHERE executed_at > NOW() - INTERVAL '${hours} hours'`
    );

    const success_count = parseInt(rows[0].success_count || '0');
    const total_count = parseInt(rows[0].total_count || '0');

    const metric_value = total_count > 0 ? success_count / total_count : 1.0;
    const threshold = SLA_THRESHOLDS.PLAN_SUCCESS_RATE;

    return {
      metric_name: 'Plan Execution Success Rate',
      metric_value,
      threshold,
      status: this.getStatus(metric_value, threshold),
      timestamp: new Date()
    };
  }

  /**
   * Calculate plan execution time P95
   */
  private async calculatePlanExecutionTimeP95(hours: number): Promise<SLAMetric> {
    const { rows } = await pool.query(
      `SELECT
         PERCENTILE_CONT(0.95) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (completed_at - executed_at)) / 60
         ) as p95_minutes
       FROM treasury_plans
       WHERE executed_at > NOW() - INTERVAL '${hours} hours'
         AND status = 'completed'
         AND completed_at IS NOT NULL`
    );

    const metric_value = parseFloat(rows[0]?.p95_minutes || '0');
    const threshold = SLA_THRESHOLDS.PLAN_EXECUTION_TIME_P95_MINUTES;

    return {
      metric_name: 'Plan Execution Time P95 (minutes)',
      metric_value,
      threshold,
      status: this.getStatusInverse(metric_value, threshold),
      timestamp: new Date()
    };
  }

  /**
   * Calculate sweep execution rate
   */
  private async calculateSweepExecutionRate(hours: number): Promise<SLAMetric> {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed') as success_count,
         COUNT(*) FILTER (WHERE action_type = 'sweep') as total_count
       FROM treasury_plan_actions
       WHERE created_at > NOW() - INTERVAL '${hours} hours'
         AND action_type = 'sweep'`
    );

    const success_count = parseInt(rows[0].success_count || '0');
    const total_count = parseInt(rows[0].total_count || '0');

    const metric_value = total_count > 0 ? success_count / total_count : 1.0;
    const threshold = SLA_THRESHOLDS.SWEEP_EXECUTION_RATE;

    return {
      metric_name: 'Sweep Execution Rate',
      metric_value,
      threshold,
      status: this.getStatus(metric_value, threshold),
      timestamp: new Date()
    };
  }

  /**
   * Determine metric status (higher is better)
   */
  private getStatus(value: number, threshold: number): 'ok' | 'warning' | 'critical' {
    if (value >= threshold) {
      return 'ok';
    } else if (value >= threshold * 0.9) {
      return 'warning';
    } else {
      return 'critical';
    }
  }

  /**
   * Determine metric status (lower is better)
   */
  private getStatusInverse(value: number, threshold: number): 'ok' | 'warning' | 'critical' {
    if (value <= threshold) {
      return 'ok';
    } else if (value <= threshold * 1.1) {
      return 'warning';
    } else {
      return 'critical';
    }
  }

  /**
   * Store metrics in database
   */
  private async storeMetrics(metrics: SLAMetric[]): Promise<void> {
    for (const metric of metrics) {
      await pool.query(
        `INSERT INTO treasury_sla_metrics (
          metric_name,
          metric_value,
          threshold,
          status,
          period_hours,
          recorded_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          metric.metric_name,
          metric.metric_value,
          metric.threshold,
          metric.status,
          24 // Default to 24h period
        ]
      );
    }
  }

  /**
   * Get SLA history for a metric
   */
  async getMetricHistory(metric_name: string, days: number = 7): Promise<SLAMetric[]> {
    const { rows } = await pool.query(
      `SELECT metric_name, metric_value, threshold, status, recorded_at as timestamp
       FROM treasury_sla_metrics
       WHERE metric_name = $1
         AND recorded_at > NOW() - INTERVAL '${days} days'
       ORDER BY recorded_at DESC`,
      [metric_name]
    );

    return rows.map(row => ({
      metric_name: row.metric_name,
      metric_value: parseFloat(row.metric_value),
      threshold: parseFloat(row.threshold),
      status: row.status,
      timestamp: new Date(row.timestamp)
    }));
  }

  /**
   * Send SLA alert
   */
  async sendAlert(metric: SLAMetric): Promise<void> {
    console.log(`[SLAMonitor] 🚨 SLA ALERT: ${metric.metric_name}`);
    console.log(`  Status: ${metric.status.toUpperCase()}`);
    console.log(`  Value: ${(metric.metric_value * 100).toFixed(2)}%`);
    console.log(`  Threshold: ${(metric.threshold * 100).toFixed(2)}%`);

    // In production, send alerts via:
    // - Email
    // - Slack webhook
    // - PagerDuty
    // - SMS

    // Example webhook call:
    // await axios.post(process.env.ALERT_WEBHOOK_URL, {
    //   metric: metric.metric_name,
    //   status: metric.status,
    //   value: metric.metric_value,
    //   threshold: metric.threshold,
    //   timestamp: metric.timestamp
    // });
  }
}

export default SLAMonitor;
