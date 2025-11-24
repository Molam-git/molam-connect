import { pool } from "../db";

export async function fetchMatchingRules(ctx: any) {
    // naive rule fetch: returns active rules matching metric & optional thresholds.
    const q = `SELECT id, name, severity, notify_channels, voice_template_id, webhook_url, email_list, sms_template, country_priority, retry_policy
             FROM alert_rules WHERE enabled = true
             AND (region IS NULL OR region = $1 OR region = '')
             LIMIT 50;`;
    const { rows } = await pool.query(q, [ctx.country]);
    // Advanced: filter by amount thresholds, metric types, expression eval (future).
    return rows;
}

export async function insertDashboardAlert({
    alert_type,
    severity,
    payload,
    triggered_by,
    rule_id
}: {
    alert_type: string,
    severity: string,
    payload: any,
    triggered_by: string,
    rule_id: number | null
}) {
    const q = `INSERT INTO dashboard_alerts(id, alert_type, severity, payload, triggered_by, created_at, rule_id)
             VALUES (gen_random_uuid(), $1,$2,$3,$4, now(), $5) RETURNING *;`;
    const { rows } = await pool.query(q, [alert_type, severity, payload, triggered_by, rule_id]);
    return rows[0];
}

export async function logDelivery(
    alert_id: any,
    rule_id: any,
    channel: string,
    target: any,
    status: string,
    detail: any
) {
    const q = `INSERT INTO alert_delivery_logs(id, alert_id, rule_id, channel, target, status, detail, attempt, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 1, now()) RETURNING *;`;
    const { rows } = await pool.query(q, [alert_id, rule_id, channel, String(target), status, detail || {}]);
    return rows[0];
}