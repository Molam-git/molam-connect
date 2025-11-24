import { db } from "../shared/db.js";
import { withTxn } from "../shared/tx.js";
import { toAmountWithinCaps } from "./util.js";
import { ledgerConvert, ledgerClawback, createDebtIfNeeded } from "./ledger.js";
import { PoolClient } from "pg";

export async function attributeRewardFromTx(tx: {
    id: string; user_id: string; amount: number; currency: string; country_code: string;
    channel: string; merchant_id?: string | null; mcc?: string | null; is_fee_free?: boolean;
}) {
    if (tx.is_fee_free) return;

    const rules = await db.query(
        `SELECT * FROM molam_reward_rules
     WHERE is_active=TRUE
       AND (country_code IS NULL OR country_code=$1)
       AND (currency IS NULL OR currency=$2)
       AND (channel IS NULL OR channel=$3)
       AND (merchant_id IS NULL OR merchant_id=$4)
       AND (mcc IS NULL OR mcc=$5)
       AND start_at<=NOW() AND (end_at IS NULL OR end_at>NOW())`,
        [tx.country_code, tx.currency, tx.channel, tx.merchant_id, tx.mcc]
    );

    for (const rule of rules.rows) {
        const amt = toAmountWithinCaps({ txAmount: tx.amount, rule });
        if (amt <= 0) continue;

        await db.query(
            `INSERT INTO molam_user_rewards (user_id, tx_id, rule_id, kind, amount, currency, country_code, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
       ON CONFLICT DO NOTHING`,
            [tx.user_id, tx.id, rule.id, rule.kind, amt, tx.currency, tx.country_code]
        );
    }
}

export async function convertPendingReward({ rewardId, userId, mode }: {
    rewardId: string; userId: string; mode: "manual" | "auto";
}) {
    return withTxn(async (client: PoolClient) => {
        const r = await client.query(
            `SELECT * FROM molam_user_rewards WHERE id=$1 AND user_id=$2 FOR UPDATE`,
            [rewardId, userId]
        );

        if (!r.rowCount) throw new Error("reward_not_found");
        const reward = r.rows[0];
        if (reward.status !== 'pending') throw new Error("not_pending");

        await ledgerConvert(client, reward);

        await client.query(
            `UPDATE molam_user_rewards
         SET status='confirmed', confirmed_at=NOW(), notes = jsonb_set(coalesce(notes,'{}'::jsonb), '{mode}', to_jsonb($1::text), true)
       WHERE id=$2`,
            [mode, rewardId]
        );

        return { reward_id: rewardId, amount: reward.amount, currency: reward.currency };
    });
}

export async function clawbackForRefund(txId: string, proportion: number) {
    const rewards = await db.query(
        `SELECT * FROM molam_user_rewards WHERE tx_id=$1 AND status IN ('pending','confirmed')`,
        [txId]
    );

    for (const r of rewards.rows) {
        if (r.status === 'pending') {
            await db.query(`UPDATE molam_user_rewards SET status='cancelled', cancelled_at=NOW() WHERE id=$1`, [r.id]);
            continue;
        }

        const clawAmt = Number(r.amount) * proportion;
        const ok = await ledgerClawback(r, clawAmt);

        if (!ok) {
            await createDebtIfNeeded(r, clawAmt);
            await db.query(
                `UPDATE molam_user_rewards SET status='debt_created', notes = jsonb_set(coalesce(notes,'{}'::jsonb), '{debt}', '"open"', true) WHERE id=$1`,
                [r.id]
            );
        } else {
            await db.query(`UPDATE molam_user_rewards SET status='clawed_back', clawed_back_at=NOW() WHERE id=$1`, [r.id]);
        }
    }
}