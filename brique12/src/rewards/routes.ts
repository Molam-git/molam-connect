import { Router } from "express";
import { db } from "../shared/db.js";
import { requireScopes } from "../shared/scopes.js";
import { siraNotify } from "../shared/sira.js";
import { convertPendingReward } from "./service.js";

const r = Router();

r.get("/me", requireScopes(["pay:rewards:read"]), async (req, res) => {
    const userId = (req as any).user.id;
    const { limit = 50, offset = 0 } = req.query as any;

    const q = await db.query(
        `SELECT * FROM molam_user_rewards
     WHERE user_id=$1 ORDER BY pending_at DESC
     LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
    );

    res.json({ items: q.rows });
});

r.post("/claim", requireScopes(["pay:rewards:claim"]), async (req, res) => {
    const userId = (req as any).user.id;
    const { reward_id } = req.body as { reward_id: string };

    const out = await convertPendingReward({ rewardId: reward_id, userId, mode: "manual" });
    await siraNotify("reward_claimed", { userId, rewardId: reward_id, amount: out.amount });

    res.status(200).json({ ok: true, conversion: out });
});

export default r;