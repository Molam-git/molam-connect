/**
 * Brique 77 - Dashboard Service
 *
 * Industrial-grade real-time dashboard service for Molam Pay:
 * - Event aggregation (hourly buckets)
 * - Snapshot generation and refresh
 * - Ops actions execution with multi-sig
 * - Widget data fetching
 * - SIRA recommendations integration
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import { Pool, PoolClient } from 'pg';

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// =======================================================================
// TYPES & INTERFACES
// =======================================================================

export type TenantType = 'platform' | 'merchant' | 'agent' | 'bank' | 'region';
export type OpsActionType =
  | 'PAUSE_PAYOUT'
  | 'RESUME_PAYOUT'
  | 'FREEZE_MERCHANT'
  | 'UNFREEZE_MERCHANT'
  | 'EXECUTE_PLAN'
  | 'REQUEUE_DLQ'
  | 'FORCE_RETRY_PAYOUT'
  | 'ISSUE_MANUAL_REFUND'
  | 'ADJUST_FLOAT'
  | 'APPLY_SIRA_RECOMMENDATION'
  | 'EMERGENCY_SHUTDOWN'
  | 'UPDATE_RISK_THRESHOLD'
  | 'ROUTE_PAYOUT_OVERRIDE';

export type OpsActionStatus =
  | 'requested'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'rolled_back';

export interface DashboardSnapshot {
  tenant_type: TenantType;
  tenant_id?: string;
  snapshot_ts: Date;
  payload: Record<string, any>;
}

export interface HourlyMetrics {
  gmv: number;
  transaction_count: number;
  net_revenue: number;
  total_fees: number;
  refunds_amount: number;
  refunds_count: number;
  disputes_count: number;
  payouts_amount: number;
  payouts_count: number;
  float_available: number;
  conversion_rate: number;
  fraud_rate: number;
}

export interface OpsAction {
  id: string;
  actor_id: string;
  actor_role: string;
  action_type: OpsActionType;
  target: Record<string, any>;
  params: Record<string, any>;
  status: OpsActionStatus;
  required_approvals: number;
  approvals: Array<{
    approver_id: string;
    approved_at: string;
    comment?: string;
  }>;
  executed_at?: Date;
  executed_by?: string;
  execution_result?: Record<string, any>;
  error_code?: string;
  error_message?: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  created_at: Date;
  updated_at: Date;
}

export interface DashboardAlert {
  id: string;
  tenant_type: TenantType;
  tenant_id?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  message: string;
  category?: string;
  source?: string;
  action_url?: string;
  action_label?: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  created_at: Date;
}

export interface SiraRecommendation {
  id: string;
  tenant_type: TenantType;
  tenant_id?: string;
  recommendation_type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  suggested_action: Record<string, any>;
  estimated_impact?: Record<string, any>;
  explanation?: Record<string, any>;
  confidence_score: number;
  status: 'pending' | 'applied' | 'rejected' | 'expired';
  created_at: Date;
}

// =======================================================================
// EVENT AGGREGATION
// =======================================================================

/**
 * Process an event and update hourly aggregates
 * This is called by the stream processor (Kafka consumer, etc.)
 */
export async function aggregateEvent(event: {
  occurred_at: Date;
  tenant_type: TenantType;
  tenant_id?: string;
  country?: string;
  region?: string;
  currency?: string;
  metrics: Partial<HourlyMetrics>;
}): Promise<void> {
  const client = await pool.connect();

  try {
    // Compute bucket (start of hour)
    const bucketTs = new Date(event.occurred_at);
    bucketTs.setMinutes(0, 0, 0);

    // Upsert hourly aggregate
    await client.query(
      `SELECT upsert_hourly_aggregate($1, $2, $3, $4, $5, $6, $7)`,
      [
        bucketTs.toISOString(),
        event.tenant_type,
        event.tenant_id,
        event.country || 'UNK',
        event.region || 'GLOBAL',
        event.currency || 'XOF',
        JSON.stringify(event.metrics),
      ]
    );
  } finally {
    client.release();
  }
}

/**
 * Batch process multiple events (for bulk ingestion)
 */
export async function aggregateEventsBatch(
  events: Array<Parameters<typeof aggregateEvent>[0]>
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  for (const event of events) {
    try {
      await aggregateEvent(event);
      processed++;
    } catch (error) {
      console.error('[DashboardService] Event aggregation failed:', error);
      errors++;
    }
  }

  return { processed, errors };
}

// =======================================================================
// SNAPSHOT MANAGEMENT
// =======================================================================

/**
 * Get dashboard snapshot (fast lookup)
 */
export async function getDashboardSnapshot(
  tenantType: TenantType,
  tenantId?: string
): Promise<DashboardSnapshot | null> {
  const result = await pool.query<DashboardSnapshot>(
    `SELECT * FROM get_dashboard_snapshot($1, $2)`,
    [tenantType, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  // Return with parsed payload
  return {
    tenant_type: tenantType,
    tenant_id: tenantId,
    snapshot_ts: new Date(),
    payload: result.rows[0] as any,
  };
}

/**
 * Refresh all dashboard snapshots
 * Called by cron job every 1-5 minutes
 */
export async function refreshDashboardSnapshots(): Promise<{
  refreshed: number;
  errors: number;
}> {
  try {
    const result = await pool.query<{ refresh_dashboard_snapshots: number }>(
      `SELECT refresh_dashboard_snapshots() as count`
    );

    return {
      refreshed: result.rows[0]?.refresh_dashboard_snapshots || 0,
      errors: 0,
    };
  } catch (error: any) {
    console.error('[DashboardService] Snapshot refresh failed:', error);
    return {
      refreshed: 0,
      errors: 1,
    };
  }
}

/**
 * Get time-series data for a metric
 */
export async function getMetricTimeSeries(params: {
  tenant_type: TenantType;
  tenant_id?: string;
  metric: keyof HourlyMetrics;
  time_range: string; // e.g., '7d', '24h', '30d'
  group_by?: 'hour' | 'day';
  country?: string;
  region?: string;
}): Promise<Array<{ timestamp: Date; value: number }>> {
  const { tenant_type, tenant_id, metric, time_range, group_by = 'day', country, region } = params;

  // Parse time_range
  const intervalMatch = time_range.match(/^(\d+)(h|d|w|m)$/);
  if (!intervalMatch) {
    throw new Error(`Invalid time_range: ${time_range}`);
  }

  const [, amount, unit] = intervalMatch;
  const intervalMap: Record<string, string> = {
    h: 'hours',
    d: 'days',
    w: 'weeks',
    m: 'months',
  };

  const interval = `${amount} ${intervalMap[unit]}`;

  // Build query
  let query = `
    SELECT
      date_trunc($1, bucket_ts) AS timestamp,
      SUM(${metric}) AS value
    FROM dash_aggregates_hourly
    WHERE tenant_type = $2
      AND bucket_ts >= now() - INTERVAL '${interval}'
  `;

  const queryParams: any[] = [group_by, tenant_type];
  let paramIndex = 3;

  if (tenant_id) {
    query += ` AND tenant_id = $${paramIndex}`;
    queryParams.push(tenant_id);
    paramIndex++;
  }

  if (country) {
    query += ` AND country = $${paramIndex}`;
    queryParams.push(country);
    paramIndex++;
  }

  if (region) {
    query += ` AND region = $${paramIndex}`;
    queryParams.push(region);
    paramIndex++;
  }

  query += ` GROUP BY timestamp ORDER BY timestamp ASC`;

  const result = await pool.query(query, queryParams);

  return result.rows.map((row) => ({
    timestamp: new Date(row.timestamp),
    value: parseFloat(row.value),
  }));
}

// =======================================================================
// OPS ACTIONS
// =======================================================================

/**
 * Create an ops action request
 */
export async function createOpsAction(params: {
  actor_id: string;
  actor_role: string;
  actor_email?: string;
  action_type: OpsActionType;
  target: Record<string, any>;
  params?: Record<string, any>;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  required_approvals?: number;
}): Promise<OpsAction> {
  const {
    actor_id,
    actor_role,
    actor_email,
    action_type,
    target,
    params: actionParams = {},
    risk_level = 'medium',
    required_approvals,
  } = params;

  // Determine required approvals based on risk level
  let reqApprovals = required_approvals;
  if (!reqApprovals) {
    const approvalMap: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    reqApprovals = approvalMap[risk_level];
  }

  const result = await pool.query<OpsAction>(
    `INSERT INTO ops_actions (
      actor_id, actor_role, actor_email, action_type, target, params,
      risk_level, required_approvals, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'requested')
    RETURNING *`,
    [
      actor_id,
      actor_role,
      actor_email,
      action_type,
      JSON.stringify(target),
      JSON.stringify(actionParams),
      risk_level,
      reqApprovals,
    ]
  );

  // Emit event for notification
  // TODO: publishEvent('ops', null, 'ops.action.requested', { action: result.rows[0] });

  return result.rows[0];
}

/**
 * Approve an ops action (multi-sig workflow)
 */
export async function approveOpsAction(params: {
  action_id: string;
  approver_id: string;
  comment?: string;
}): Promise<OpsAction> {
  const { action_id, approver_id, comment } = params;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get current action
    const actionResult = await client.query<OpsAction>(
      `SELECT * FROM ops_actions WHERE id = $1 FOR UPDATE`,
      [action_id]
    );

    if (actionResult.rows.length === 0) {
      throw new Error(`Ops action not found: ${action_id}`);
    }

    const action = actionResult.rows[0];

    if (action.status !== 'requested' && action.status !== 'pending_approval') {
      throw new Error(`Cannot approve action with status: ${action.status}`);
    }

    // Add approval
    const approvals = action.approvals || [];
    approvals.push({
      approver_id,
      approved_at: new Date().toISOString(),
      comment,
    });

    // Update action
    const updatedResult = await client.query<OpsAction>(
      `UPDATE ops_actions
       SET approvals = $1, status = 'pending_approval', updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(approvals), action_id]
    );

    // Check if enough approvals (trigger will auto-update status to 'approved')
    await client.query(`SELECT check_ops_action_approvals($1)`, [action_id]);

    await client.query('COMMIT');

    // Fetch updated action
    const finalResult = await client.query<OpsAction>(`SELECT * FROM ops_actions WHERE id = $1`, [
      action_id,
    ]);

    return finalResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute an approved ops action
 */
export async function executeOpsAction(params: {
  action_id: string;
  executor_id: string;
}): Promise<OpsAction> {
  const { action_id, executor_id } = params;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get action
    const actionResult = await client.query<OpsAction>(
      `SELECT * FROM ops_actions WHERE id = $1 FOR UPDATE`,
      [action_id]
    );

    if (actionResult.rows.length === 0) {
      throw new Error(`Ops action not found: ${action_id}`);
    }

    const action = actionResult.rows[0];

    if (action.status !== 'approved') {
      throw new Error(`Cannot execute action with status: ${action.status}`);
    }

    // Mark as executing
    await client.query(
      `UPDATE ops_actions SET status = 'executing', updated_at = now() WHERE id = $1`,
      [action_id]
    );

    await client.query('COMMIT');

    // Execute action (async, don't block)
    executeActionLogic(action, executor_id).catch((error) => {
      console.error(`[DashboardService] Action execution failed:`, error);
    });

    return action;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute action logic (implementation depends on action type)
 */
async function executeActionLogic(action: OpsAction, executor_id: string): Promise<void> {
  const client = await pool.connect();

  try {
    let executionResult: Record<string, any> = {};

    switch (action.action_type) {
      case 'PAUSE_PAYOUT':
        executionResult = await pausePayout(action.target, action.params);
        break;

      case 'FREEZE_MERCHANT':
        executionResult = await freezeMerchant(action.target, action.params);
        break;

      case 'ISSUE_MANUAL_REFUND':
        executionResult = await issueManualRefund(action.target, action.params);
        break;

      case 'APPLY_SIRA_RECOMMENDATION':
        executionResult = await applySiraRecommendation(action.target, action.params);
        break;

      default:
        throw new Error(`Unsupported action type: ${action.action_type}`);
    }

    // Mark as executed
    await client.query(
      `UPDATE ops_actions
       SET status = 'executed', executed_at = now(), executed_by = $1,
           execution_result = $2, updated_at = now()
       WHERE id = $3`,
      [executor_id, JSON.stringify(executionResult), action.id]
    );
  } catch (error: any) {
    console.error(`[DashboardService] Action execution error:`, error);

    // Mark as failed
    await client.query(
      `UPDATE ops_actions
       SET status = 'failed', error_code = $1, error_message = $2, updated_at = now()
       WHERE id = $3`,
      ['EXECUTION_ERROR', error.message, action.id]
    );

    throw error;
  } finally {
    client.release();
  }
}

// =======================================================================
// ACTION IMPLEMENTATIONS (Stubs)
// =======================================================================

async function pausePayout(
  target: Record<string, any>,
  params: Record<string, any>
): Promise<Record<string, any>> {
  // TODO: Implement pause payout logic
  console.log('[DashboardService] Pausing payout:', target, params);
  return { paused: true, target };
}

async function freezeMerchant(
  target: Record<string, any>,
  params: Record<string, any>
): Promise<Record<string, any>> {
  // TODO: Implement freeze merchant logic
  console.log('[DashboardService] Freezing merchant:', target, params);
  return { frozen: true, merchant_id: target.merchant_id };
}

async function issueManualRefund(
  target: Record<string, any>,
  params: Record<string, any>
): Promise<Record<string, any>> {
  // TODO: Implement manual refund logic
  console.log('[DashboardService] Issuing manual refund:', target, params);
  return { refund_id: 'refund_' + Date.now(), amount: params.amount };
}

async function applySiraRecommendation(
  target: Record<string, any>,
  params: Record<string, any>
): Promise<Record<string, any>> {
  // TODO: Implement SIRA recommendation application logic
  console.log('[DashboardService] Applying SIRA recommendation:', target, params);
  return { applied: true, recommendation_id: target.recommendation_id };
}

// =======================================================================
// ALERTS
// =======================================================================

/**
 * Create a dashboard alert
 */
export async function createAlert(params: {
  tenant_type: TenantType;
  tenant_id?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  message: string;
  category?: string;
  source?: string;
  source_id?: string;
  action_url?: string;
  action_label?: string;
  context?: Record<string, any>;
}): Promise<DashboardAlert> {
  const result = await pool.query<DashboardAlert>(
    `INSERT INTO dash_alerts (
      tenant_type, tenant_id, severity, title, message, category,
      source, source_id, action_url, action_label, context
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      params.tenant_type,
      params.tenant_id,
      params.severity,
      params.title,
      params.message,
      params.category,
      params.source,
      params.source_id,
      params.action_url,
      params.action_label,
      JSON.stringify(params.context || {}),
    ]
  );

  return result.rows[0];
}

/**
 * Get alerts for a tenant
 */
export async function getAlerts(params: {
  tenant_type: TenantType;
  tenant_id?: string;
  status?: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  severity?: string[];
  limit?: number;
}): Promise<DashboardAlert[]> {
  const { tenant_type, tenant_id, status = 'open', severity, limit = 50 } = params;

  let query = `
    SELECT * FROM dash_alerts
    WHERE tenant_type = $1
      AND status = $2
      AND (expires_at IS NULL OR expires_at > now())
  `;

  const queryParams: any[] = [tenant_type, status];
  let paramIndex = 3;

  if (tenant_id) {
    query += ` AND tenant_id = $${paramIndex}`;
    queryParams.push(tenant_id);
    paramIndex++;
  }

  if (severity && severity.length > 0) {
    query += ` AND severity = ANY($${paramIndex})`;
    queryParams.push(severity);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
  queryParams.push(limit);

  const result = await pool.query<DashboardAlert>(query, queryParams);

  return result.rows;
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(params: {
  alert_id: string;
  user_id: string;
}): Promise<void> {
  await pool.query(
    `UPDATE dash_alerts
     SET status = 'acknowledged', acknowledged_at = now(), acknowledged_by = $1
     WHERE id = $2`,
    [params.user_id, params.alert_id]
  );
}

// =======================================================================
// SIRA RECOMMENDATIONS
// =======================================================================

/**
 * Create a SIRA recommendation
 */
export async function createSiraRecommendation(params: {
  tenant_type: TenantType;
  tenant_id?: string;
  recommendation_type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  suggested_action: Record<string, any>;
  estimated_impact?: Record<string, any>;
  explanation?: Record<string, any>;
  confidence_score: number;
}): Promise<SiraRecommendation> {
  const result = await pool.query<SiraRecommendation>(
    `INSERT INTO sira_dash_recommendations (
      tenant_type, tenant_id, recommendation_type, priority, title, description,
      suggested_action, estimated_impact, explanation, confidence_score
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      params.tenant_type,
      params.tenant_id,
      params.recommendation_type,
      params.priority,
      params.title,
      params.description,
      JSON.stringify(params.suggested_action),
      JSON.stringify(params.estimated_impact || {}),
      JSON.stringify(params.explanation || {}),
      params.confidence_score,
    ]
  );

  // Also create an alert for high/critical priority recommendations
  if (params.priority === 'high' || params.priority === 'critical') {
    await createAlert({
      tenant_type: params.tenant_type,
      tenant_id: params.tenant_id,
      severity: params.priority,
      title: `SIRA Recommendation: ${params.title}`,
      message: params.description,
      category: 'sira_recommendation',
      source: 'sira',
      source_id: result.rows[0].id,
      action_url: `/dashboard/sira/recommendations/${result.rows[0].id}`,
      action_label: 'View Recommendation',
    });
  }

  return result.rows[0];
}

/**
 * Get SIRA recommendations for a tenant
 */
export async function getSiraRecommendations(params: {
  tenant_type: TenantType;
  tenant_id?: string;
  status?: 'pending' | 'applied' | 'rejected';
  limit?: number;
}): Promise<SiraRecommendation[]> {
  const { tenant_type, tenant_id, status = 'pending', limit = 50 } = params;

  let query = `
    SELECT * FROM sira_dash_recommendations
    WHERE tenant_type = $1 AND status = $2
      AND (expires_at IS NULL OR expires_at > now())
  `;

  const queryParams: any[] = [tenant_type, status];
  let paramIndex = 3;

  if (tenant_id) {
    query += ` AND tenant_id = $${paramIndex}`;
    queryParams.push(tenant_id);
    paramIndex++;
  }

  query += ` ORDER BY priority DESC, created_at DESC LIMIT $${paramIndex}`;
  queryParams.push(limit);

  const result = await pool.query<SiraRecommendation>(query, queryParams);

  return result.rows;
}

// =======================================================================
// WIDGETS
// =======================================================================

/**
 * Get widget data
 */
export async function getWidgetData(params: {
  widget_id: string;
  tenant_type: TenantType;
  tenant_id?: string;
}): Promise<any> {
  const { widget_id, tenant_type, tenant_id } = params;

  // Get widget config
  const widgetResult = await pool.query(
    `SELECT * FROM dash_widgets WHERE id = $1`,
    [widget_id]
  );

  if (widgetResult.rows.length === 0) {
    throw new Error(`Widget not found: ${widget_id}`);
  }

  const widget = widgetResult.rows[0];
  const config = widget.config;

  // Fetch data based on widget kind
  switch (widget.kind) {
    case 'chart_line':
    case 'chart_bar':
      return getMetricTimeSeries({
        tenant_type,
        tenant_id,
        metric: config.metric,
        time_range: config.time_range || '7d',
        group_by: config.groupBy || 'day',
      });

    case 'gauge':
    case 'metric':
      const snapshot = await getDashboardSnapshot(tenant_type, tenant_id);
      return {
        value: snapshot?.payload[config.metric] || 0,
        ...config,
      };

    case 'alert_list':
      return getAlerts({
        tenant_type,
        tenant_id,
        severity: config.severities,
        limit: config.limit || 10,
      });

    case 'table':
      // TODO: Implement table data fetching
      return [];

    default:
      throw new Error(`Unsupported widget kind: ${widget.kind}`);
  }
}

// =======================================================================
// SCHEDULED JOBS
// =======================================================================

/**
 * Main dashboard refresh job (run every 1-5 minutes)
 */
export async function runDashboardRefreshJob(): Promise<{
  snapshots_refreshed: number;
  errors: number;
}> {
  console.log('[DashboardService] Running dashboard refresh job...');

  const result = await refreshDashboardSnapshots();

  console.log(
    `[DashboardService] Refresh complete: ${result.refreshed} snapshots, ${result.errors} errors`
  );

  return result;
}

/**
 * Alert threshold checker (run every 5 minutes)
 */
export async function runAlertThresholdChecker(): Promise<{
  alerts_created: number;
}> {
  console.log('[DashboardService] Running alert threshold checker...');

  let alertsCreated = 0;

  // Check float threshold
  const floatResult = await pool.query(`
    SELECT tenant_type, tenant_id, AVG(float_available) as avg_float
    FROM dash_aggregates_hourly
    WHERE bucket_ts >= now() - INTERVAL '1 hour'
    GROUP BY tenant_type, tenant_id
    HAVING AVG(float_available) < 1000000
  `);

  for (const row of floatResult.rows) {
    await createAlert({
      tenant_type: row.tenant_type,
      tenant_id: row.tenant_id,
      severity: 'high',
      title: 'Low Float Alert',
      message: `Float available (${row.avg_float}) is below threshold (1,000,000)`,
      category: 'float',
      source: 'threshold',
    });
    alertsCreated++;
  }

  // Check fraud rate threshold
  const fraudResult = await pool.query(`
    SELECT tenant_type, tenant_id, AVG(fraud_rate) as avg_fraud_rate
    FROM dash_aggregates_hourly
    WHERE bucket_ts >= now() - INTERVAL '1 hour'
    GROUP BY tenant_type, tenant_id
    HAVING AVG(fraud_rate) > 0.10
  `);

  for (const row of fraudResult.rows) {
    await createAlert({
      tenant_type: row.tenant_type,
      tenant_id: row.tenant_id,
      severity: 'critical',
      title: 'High Fraud Rate Alert',
      message: `Fraud rate (${(row.avg_fraud_rate * 100).toFixed(2)}%) is above threshold (10%)`,
      category: 'fraud',
      source: 'threshold',
    });
    alertsCreated++;
  }

  console.log(`[DashboardService] Alert checker complete: ${alertsCreated} alerts created`);

  return { alerts_created: alertsCreated };
}

// Export pool for external use
export { pool };
