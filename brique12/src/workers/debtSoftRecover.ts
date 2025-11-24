import { Worker } from "bullmq";
import { db } from "../shared/db.js";
import { siraNotify } from "../shared/sira.js";

const worker = new Worker("rewards-debt", async () => {
    const q = await db.query(
        `SELECT d.*, u.preferred_lang
     FROM molam_reward_debts d
     JOIN molam_users u ON u.id=d.user_id
     WHERE d.status='open'`
    );

    for (const d of q.rows) {
        await siraNotify("reward_debt_open", {
            userId: d.user_id,
            amount: d.amount_due,
            currency: d.currency
        });
    }
}, {
    connection: { host: "localhost", port: 6379 },
    concurrency: 5
});

console.log("Debt soft recovery worker started");