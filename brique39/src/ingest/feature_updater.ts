import { pool } from "../db";

export async function upsertFeaturesForTxn(tx: {
    origin_user_id: string;
    amount: number;
    type: string;
    occurred_at: string;
}) {
    const day = new Date(tx.occurred_at).toISOString().slice(0, 10);

    await pool.query(
        `INSERT INTO features_user_daily (user_id, day, tx_count_7d, tx_vol_7d, p2p_count_7d, cashout_count_7d, updated_at)
     VALUES ($1, $2, 1, $3, CASE WHEN $4 = 'p2p' THEN 1 ELSE 0 END, CASE WHEN $4 = 'cashout' THEN 1 ELSE 0 END, now())
     ON CONFLICT (user_id, day) DO UPDATE
     SET tx_count_7d = features_user_daily.tx_count_7d + 1,
         tx_vol_7d = features_user_daily.tx_vol_7d + EXCLUDED.tx_vol_7d,
         p2p_count_7d = features_user_daily.p2p_count_7d + EXCLUDED.p2p_count_7d,
         cashout_count_7d = features_user_daily.cashout_count_7d + EXCLUDED.cashout_count_7d,
         updated_at = now()`,
        [tx.origin_user_id, day, tx.amount, tx.type]
    );
}