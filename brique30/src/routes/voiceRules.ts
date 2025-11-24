// src/routes/voiceRules.ts
import { Router } from "express";
import { pool } from "../db";
import { requireRole } from "../utils/authz";

export const voiceRulesRouter = Router();

voiceRulesRouter.get("/", requireRole(["notif_admin", "pay_admin"]), async (req: any, res) => {
    const { country, region } = req.query;
    const q = `
    SELECT * FROM voice_channel_rules
    WHERE ($1::text IS NULL OR country=$1)
      AND ($2::text IS NULL OR region=$2)
    ORDER BY updated_at DESC
    LIMIT 50
  `;
    const { rows } = await pool.query(q, [country || null, region || null]);
    res.json(rows);
});

voiceRulesRouter.post("/", requireRole(["notif_admin", "pay_admin"]), async (req: any, res) => {
    const {
        region, country, city, fallback_enabled, fallback_delay_seconds,
        max_message_seconds, budget_daily_usd, budget_monthly_usd,
        allowed_hours, preferred_providers
    } = req.body;

    const q = `
    INSERT INTO voice_channel_rules(region,country,city,fallback_enabled,fallback_delay_seconds,
      max_message_seconds,budget_daily_usd,budget_monthly_usd,allowed_hours,preferred_providers,updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `;
    const { rows } = await pool.query(q, [
        region, country, city || null, fallback_enabled, fallback_delay_seconds,
        max_message_seconds, budget_daily_usd, budget_monthly_usd,
        allowed_hours, preferred_providers, req.user?.id
    ]);
    res.json(rows[0]);
});