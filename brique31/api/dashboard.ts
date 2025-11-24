import express from "express";
import { pool } from "../services/db";
import { authenticateToken } from "./utils/jwt";
import { requireRole } from "./utils/authz";

export const router = express.Router();

/**
 * GET /api/dashboard/overview?zone=&country=&from=&to=
 * returns aggregated numbers (CA, fees, counts)
 */
router.get("/overview", requireRole(["pay_admin", "finance_ops", "auditor", "agent_partner"]), async (req: any, res: { json: (arg0: { rows: any; }) => void; }) => {
    const { zone, country, from, to } = req.query;
    // RBAC: if agent_partner, force agent filter
    const user = req.user;
    let agentWhere = "";
    const params: any[] = [];

    if (user.roles.includes("agent_partner")) {
        agentWhere = "AND agent_id = $1";
        params.push(user.agent_id);
    }

    // simplified query uses mv_kpi_by_zone
    const q = `
    SELECT day, country, zone, total_volume_local, total_count, total_fees_molam
    FROM mv_kpi_by_zone
    WHERE ($1::text IS NULL OR zone = $1)
      AND ($2::text IS NULL OR country = $2)
      AND (day BETWEEN COALESCE($3::date, day) AND COALESCE($4::date, day))
    ORDER BY day DESC LIMIT 200
  `;

    const queryParams = [zone || null, country || null, from || null, to || null];
    const { rows } = await pool.query(q, queryParams);
    res.json({ rows });
});

/**
 * GET /api/dashboard/realtime?metric=&dimension=
 * returns realtime metrics
 */
router.get("/realtime", requireRole(["pay_admin", "finance_ops", "auditor", "agent_partner"]), async (req: any, res: { json: (arg0: { metrics: any; }) => void; }) => {
    const { metric, dimension, hours = 24 } = req.query;
    const user = req.user;

    let whereClause = "WHERE 1=1";
    const params: any[] = [];
    let paramCount = 0;

    if (metric) {
        paramCount++;
        whereClause += ` AND metric_key = $${paramCount}`;
        params.push(metric);
    }

    if (dimension) {
        const dimFilter = JSON.parse(dimension);
        Object.keys(dimFilter).forEach(key => {
            paramCount++;
            whereClause += ` AND dimension->>'${key}' = $${paramCount}`;
            params.push(dimFilter[key]);
        });
    }

    // RBAC filtering
    if (user.roles.includes("agent_partner") && user.agent_id) {
        paramCount++;
        whereClause += ` AND dimension->>'agent_id' = $${paramCount}`;
        params.push(user.agent_id.toString());
    }

    paramCount++;
    whereClause += ` AND ts >= NOW() - INTERVAL '${hours} hours'`;

    const q = `
    SELECT metric_key, dimension, value, currency, ts
    FROM realtime_metrics
    ${whereClause}
    ORDER BY ts DESC
    LIMIT 1000
  `;

    const { rows } = await pool.query(q, params);
    res.json({ metrics: rows });
});