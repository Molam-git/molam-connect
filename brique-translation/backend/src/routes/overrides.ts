/**
 * BRIQUE TRANSLATION — Admin Overrides Management
 */
import express from "express";
import { pool } from "../db";
import { requireRole } from "../utils/authz";
import { v4 as uuidv4 } from "uuid";

export const overridesRouter = express.Router();

/**
 * GET /api/admin/overrides?namespace=default&target_lang=fr
 */
overridesRouter.get(
  "/",
  requireRole(["pay_admin", "translation_ops", "billing_ops"]),
  async (req: any, res) => {
    const ns = req.query.namespace || "default";
    const lang = req.query.target_lang;

    try {
      if (lang) {
        const { rows } = await pool.query(
          `SELECT * FROM translation_overrides
           WHERE namespace=$1 AND target_lang=$2
           ORDER BY created_at DESC LIMIT 1000`,
          [ns, lang]
        );
        return res.json(rows);
      }

      const { rows } = await pool.query(
        `SELECT * FROM translation_overrides
         WHERE namespace=$1
         ORDER BY created_at DESC LIMIT 1000`,
        [ns]
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: "db_error", detail: e.message });
    }
  }
);

/**
 * POST /api/admin/overrides
 * body: { namespace?, source_text, target_lang, override_text }
 */
overridesRouter.post(
  "/",
  requireRole(["pay_admin", "translation_ops"]),
  async (req: any, res) => {
    const { namespace, source_text, target_lang, override_text } = req.body;

    if (!source_text || !target_lang || !override_text) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const createdBy = req.user?.id || null;
    const id = uuidv4();

    try {
      await pool.query(
        `INSERT INTO translation_overrides(id, namespace, source_text, target_lang, override_text, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, namespace || "default", source_text, target_lang, override_text, createdBy]
      );

      // Audit trail
      await pool.query(
        `INSERT INTO translation_audit(user_id, action, namespace, details)
         VALUES ($1,$2,$3,$4)`,
        [
          createdBy,
          "create_override",
          namespace || "default",
          JSON.stringify({ id, source_text, target_lang })
        ]
      );

      res.status(201).json({ id });
    } catch (e: any) {
      res.status(500).json({ error: "db_error", detail: e.message });
    }
  }
);

/**
 * DELETE /api/admin/overrides/:id
 */
overridesRouter.delete(
  "/:id",
  requireRole(["pay_admin", "translation_ops"]),
  async (req: any, res) => {
    const id = req.params.id;

    try {
      const { rows } = await pool.query(
        `DELETE FROM translation_overrides WHERE id=$1 RETURNING *`,
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "not_found" });
      }

      // Audit trail
      await pool.query(
        `INSERT INTO translation_audit(user_id, action, namespace, details)
         VALUES ($1,$2,$3,$4)`,
        [req.user?.id, "delete_override", rows[0].namespace, JSON.stringify({ id })]
      );

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: "db_error", detail: e.message });
    }
  }
);
