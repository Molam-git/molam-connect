import { pool } from '../utils/db';

export interface DashboardWidget {
  id: string;
  merchant_id: string;
  user_id: string;
  widget_type: string;
  config: any;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardTile {
  id: string;
  merchant_id: string;
  tile_type: string;
  priority: string;
  payload: any;
  computed_at: string;
  expires_at: string | null;
  source: string;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

export interface OpsDashboardRule {
  id: string;
  rule_name: string;
  scope: string;
  rule_type: string;
  params: any;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get all widgets for a merchant user
 */
export async function getWidgets(merchantId: string, userId: string): Promise<DashboardWidget[]> {
  const { rows } = await pool.query<DashboardWidget>(
    `SELECT * FROM dashboard_widgets
     WHERE merchant_id = $1 AND user_id = $2 AND is_visible = true
     ORDER BY sort_order ASC, created_at ASC`,
    [merchantId, userId]
  );
  return rows;
}

/**
 * Create or update a widget
 */
export async function upsertWidget(input: {
  merchant_id: string;
  user_id: string;
  widget_type: string;
  config?: any;
  sort_order?: number;
}): Promise<DashboardWidget> {
  const { rows } = await pool.query<DashboardWidget>(
    `INSERT INTO dashboard_widgets(merchant_id, user_id, widget_type, config, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.merchant_id,
      input.user_id,
      input.widget_type,
      JSON.stringify(input.config || {}),
      input.sort_order || 0,
    ]
  );
  return rows[0];
}

/**
 * Update widget configuration
 */
export async function updateWidgetConfig(widgetId: string, config: any): Promise<void> {
  await pool.query(
    `UPDATE dashboard_widgets
     SET config = $2, updated_at = NOW()
     WHERE id = $1`,
    [widgetId, JSON.stringify(config)]
  );
}

/**
 * Delete (hide) a widget
 */
export async function deleteWidget(widgetId: string): Promise<void> {
  await pool.query(
    `UPDATE dashboard_widgets
     SET is_visible = false, updated_at = NOW()
     WHERE id = $1`,
    [widgetId]
  );
}

/**
 * Get active tiles for merchant (unacknowledged + recent)
 */
export async function getTiles(merchantId: string, limit: number = 50): Promise<DashboardTile[]> {
  const { rows } = await pool.query<DashboardTile>(
    `SELECT * FROM dashboard_tiles_cache
     WHERE merchant_id = $1
       AND (acknowledged = false OR computed_at > NOW() - INTERVAL '24 hours')
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY
       CASE priority
         WHEN 'critical' THEN 1
         WHEN 'high' THEN 2
         WHEN 'normal' THEN 3
         WHEN 'low' THEN 4
       END,
       computed_at DESC
     LIMIT $2`,
    [merchantId, limit]
  );
  return rows;
}

/**
 * Create a new tile
 */
export async function createTile(input: {
  merchant_id: string;
  tile_type: string;
  priority?: string;
  payload: any;
  source?: string;
  expires_at?: Date;
}): Promise<DashboardTile> {
  const { rows } = await pool.query<DashboardTile>(
    `INSERT INTO dashboard_tiles_cache(merchant_id, tile_type, priority, payload, source, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.merchant_id,
      input.tile_type,
      input.priority || 'normal',
      JSON.stringify(input.payload),
      input.source || 'system',
      input.expires_at || null,
    ]
  );
  return rows[0];
}

/**
 * Acknowledge a tile
 */
export async function acknowledgeTile(tileId: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE dashboard_tiles_cache
     SET acknowledged = true, acknowledged_by = $2, acknowledged_at = NOW()
     WHERE id = $1`,
    [tileId, userId]
  );

  // Log action
  await pool.query(
    `INSERT INTO dashboard_action_log(merchant_id, user_id, action_type, entity_type, entity_id, details)
     SELECT merchant_id, $2, 'acknowledge_tile', 'tile', $1, '{}'::jsonb
     FROM dashboard_tiles_cache WHERE id = $1`,
    [tileId, userId]
  );
}

/**
 * Get active ops rules
 */
export async function getOpsRules(scope?: string): Promise<OpsDashboardRule[]> {
  let query = `SELECT * FROM ops_dashboard_rules WHERE active = true`;
  const params: any[] = [];

  if (scope) {
    query += ` AND (scope = $1 OR scope = 'all')`;
    params.push(scope);
  }

  query += ` ORDER BY created_at DESC`;

  const { rows } = await pool.query<OpsDashboardRule>(query, params);
  return rows;
}

/**
 * Create or update ops rule
 */
export async function upsertOpsRule(input: {
  rule_name: string;
  scope: string;
  rule_type: string;
  params: any;
  active?: boolean;
  created_by?: string;
}): Promise<OpsDashboardRule> {
  const { rows } = await pool.query<OpsDashboardRule>(
    `INSERT INTO ops_dashboard_rules(rule_name, scope, rule_type, params, active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (rule_name)
     DO UPDATE SET
       scope = EXCLUDED.scope,
       rule_type = EXCLUDED.rule_type,
       params = EXCLUDED.params,
       active = EXCLUDED.active,
       updated_at = NOW()
     RETURNING *`,
    [
      input.rule_name,
      input.scope,
      input.rule_type,
      JSON.stringify(input.params),
      input.active !== undefined ? input.active : true,
      input.created_by || null,
    ]
  );
  return rows[0];
}

/**
 * Get metrics summary for merchant
 */
export async function getMetricsSummary(merchantId: string, days: number = 30): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM dashboard_metrics_summary
     WHERE merchant_id = $1 AND metric_date >= CURRENT_DATE - INTERVAL '${days} days'
     ORDER BY metric_date DESC`,
    [merchantId]
  );
  return rows;
}

/**
 * Update metrics summary (called by workers)
 */
export async function updateMetricsSummary(merchantId: string, metricDate: Date, metrics: any): Promise<void> {
  await pool.query(
    `INSERT INTO dashboard_metrics_summary(merchant_id, metric_date, metrics)
     VALUES ($1, $2, $3)
     ON CONFLICT (merchant_id, metric_date)
     DO UPDATE SET metrics = EXCLUDED.metrics, updated_at = NOW()`,
    [merchantId, metricDate, JSON.stringify(metrics)]
  );
}
