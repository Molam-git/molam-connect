import express from "express";
import { pool } from "../services/db";
import { requireRole } from "./utils/authz";

export const rulesRouter = express.Router();

// GET /api/alerts/rules
rulesRouter.get("/", requireRole(["notif_admin", "pay_admin"]), async (req: any, res) => {
    const { rows } = await pool.query("SELECT * FROM alert_rules ORDER BY id DESC LIMIT 1000");
    res.json({ rows });
});

// POST /api/alerts/rules  (create)
rulesRouter.post("/", requireRole(["notif_admin"]), async (req: any, res) => {
    const body = req.body;
    const q = `INSERT INTO alert_rules (name, region, country, metric_key, operator, threshold, severity, 
             notify_channels, voice_template_id, country_priority, webhook_url, email_list, sms_template, 
             enabled, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14) RETURNING *`;

    const vals = [
        body.name,
        body.region || null,
        body.country || null,
        body.metric_key,
        body.operator,
        body.threshold,
        body.severity,
        body.notify_channels,
        body.voice_template_id,
        body.country_priority,
        body.webhook_url,
        body.email_list,
        body.sms_template,
        req.user?.id
    ];

    const { rows } = await pool.query(q, vals);

    // audit log
    await pool.query(
        "INSERT INTO molam_audit_logs(action, actor, details, created_at) VALUES($1,$2,$3,now())",
        ['alert_rule.create', req.user?.id, JSON.stringify(rows[0])]
    );

    res.json({ rule: rows[0] });
});

// PUT /api/alerts/rules/:id
rulesRouter.put("/:id", requireRole(["notif_admin"]), async (req: any, res) => {
    const { id } = req.params;
    const body = req.body;

    const q = `UPDATE alert_rules 
             SET name=$1, region=$2, country=$3, metric_key=$4, operator=$5, threshold=$6, severity=$7,
                 notify_channels=$8, voice_template_id=$9, country_priority=$10, webhook_url=$11, 
                 email_list=$12, sms_template=$13, updated_by=$14, updated_at=now()
             WHERE id=$15 RETURNING *`;

    const vals = [
        body.name, body.region || null, body.country || null, body.metric_key, body.operator,
        body.threshold, body.severity, body.notify_channels, body.voice_template_id,
        body.country_priority, body.webhook_url, body.email_list, body.sms_template,
        req.user?.id, id
    ];

    const { rows } = await pool.query(q, vals);

    if (rows.length === 0) {
        return res.status(404).json({ error: "Rule not found" });
    }

    // audit log
    await pool.query(
        "INSERT INTO molam_audit_logs(action, actor, details, created_at) VALUES($1,$2,$3,now())",
        ['alert_rule.update', req.user?.id, JSON.stringify(rows[0])]
    );

    res.json({ rule: rows[0] });
});

// GET /api/alerts
rulesRouter.get("/alerts", requireRole(["pay_admin", "finance_ops", "auditor", "notif_admin"]), async (req: any, res) => {
    const { resolved, severity, limit = 100 } = req.query;

    let whereClause = "WHERE 1=1";
    const params: any[] = [];
    let paramCount = 0;

    if (resolved === 'false') {
        whereClause += " AND resolved_at IS NULL";
    } else if (resolved === 'true') {
        whereClause += " AND resolved_at IS NOT NULL";
    }

    if (severity) {
        paramCount++;
        whereClause += ` AND severity = $${paramCount}`;
        params.push(severity);
    }

    paramCount++;
    whereClause += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const q = `SELECT * FROM dashboard_alerts ${whereClause}`;
    const { rows } = await pool.query(q, params);

    res.json({ alerts: rows });
});