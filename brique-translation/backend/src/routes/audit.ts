/**
 * BRIQUE TRANSLATION — Audit Trail API
 */
import express from "express";
import { pool } from "../db";
import { requireRole } from "../utils/authz";

export const auditRouter = express.Router();

/**
 * GET /api/admin/audit?namespace=default&limit=200
 */
auditRouter.get(
  "/",
  requireRole(["pay_admin", "auditor", "translation_ops", "billing_ops"]),
  async (req: any, res) => {
    const ns = req.query.namespace || "default";
    const limit = Math.min(500, Number(req.query.limit || 200));

    try {
      const { rows } = await pool.query(
        `SELECT id, user_id, action, namespace, details, created_at
         FROM translation_audit
         WHERE namespace=$1
         ORDER BY created_at DESC
         LIMIT $2`,
        [ns, limit]
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: "db_error", detail: e.message });
    }
  }
);
