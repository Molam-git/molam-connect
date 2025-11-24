import { Worker } from "bullmq";
import { db } from "../shared/db.js";
import { convertPendingReward } from "../rewards/service.js";
import { notifyUser } from "../shared/notify.js";
import { siraNotify } from "../shared/sira.js";

const worker = new Worker("rewards-auto", async () => {
    const q = await db.query(
        `SELECT id,user_id FROM molam_user_rewards
     WHERE status='pending' AND NOW()-pending_at > INTERVAL '24 hours'
     LIMIT 100`
    );

    for (const r of q.rows) {
        try {
            const conv = await convertPendingReward({ rewardId: r.id, userId: r.user_id, mode: "auto" });
            await notifyUser(r.user_id, `Cashback confirmed: +${conv.amount} ${conv.currency}`);
            await siraNotify("reward_auto_converted", { userId: r.user_id, amount: conv.amount });
        } catch (e) {
            console.error(`Failed to auto-convert reward ${r.id}:`, e);
        }
    }
}, {
    connection: { host: "localhost", port: 6379 },
    concurrency: 10
});

console.log("Rewards auto-conversion worker started");