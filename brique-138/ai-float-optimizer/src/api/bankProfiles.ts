import express from "express";
import { pool } from "../db";

const router = express.Router();

router.patch("/:id/risk_update", async (req, res) => {
  try {
    const { id } = req.params;
    const { risk_score, reason, updated_by } = req.body;

    if (typeof risk_score !== "number" || risk_score < 0 || risk_score > 1) {
      return res.status(400).json({ error: "risk_score must be between 0 and 1" });
    }

    const { rowCount } = await pool.query(
      `UPDATE bank_profiles
         SET risk_score = $1,
             updated_at = now()
       WHERE id = $2`,
      [risk_score, id]
    );

    if (!rowCount) {
      return res.status(404).json({ error: "bank_profile not found" });
    }

    await pool.query(
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity TEXT,
        action TEXT,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT now(),
        created_by TEXT
      )`
    );

    await pool.query(
      `INSERT INTO audit_logs(id, entity, action, details, created_at, created_by)
       VALUES (gen_random_uuid(), 'bank_profile', 'risk_update', $1, now(), $2)`,
      [JSON.stringify({ bank_profile_id: id, risk_score, reason }), updated_by || "sira"]
    );

    res.json({ success: true, bank_profile_id: id, new_risk_score: risk_score });
  } catch (error) {
    console.error("risk_update failed", error);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;

