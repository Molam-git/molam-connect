import { Router } from "express";
import { db } from "../shared/db.js";
import { requireRole } from "../shared/roles.js";

const a = Router();

a.post("/rules", requireRole("pay_admin"), async (req, res) => {
    const body = req.body;

    const q = await db.query(
        `INSERT INTO molam_reward_rules
     (name,kind,country_code,currency,channel,merchant_id,mcc,min_amount,percent,fixed_amount,cap_per_tx,daily_user_cap,start_at,end_at,is_active,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
        [
            body.name, body.kind, body.country_code, body.currency, body.channel, body.merchant_id,
            body.mcc, body.min_amount, body.percent, body.fixed_amount, body.cap_per_tx,
            body.daily_user_cap, body.start_at, body.end_at, body.is_active ?? true, (req as any).user.id
        ]
    );

    res.status(201).json(q.rows[0]);
});

a.patch("/rules/:id/toggle", requireRole("pay_admin"), async (req, res) => {
    const q = await db.query(
        `UPDATE molam_reward_rules SET is_active = NOT is_active, updated_at=NOW()
     WHERE id=$1 RETURNING *`,
        [req.params.id]
    );

    res.json(q.rows[0]);
});

export default a;