import { PoolClient } from "pg";
import { db } from "../shared/db.js";

export async function ledgerConvert(client: PoolClient, reward: any) {
    const pool = await client.query(
        `UPDATE molam_system_wallets
       SET balance = balance - $1, updated_at=NOW()
     WHERE country_code=$2 AND currency=$3
     RETURNING *`,
        [reward.amount, reward.country_code, reward.currency]
    );

    if (!pool.rowCount) throw new Error("pool_not_found_or_insufficient");

    await client.query(
        `UPDATE molam_wallets
       SET balance = balance + $1, updated_at=NOW()
     WHERE user_id=$2 AND currency=$3`,
        [reward.amount, reward.user_id, reward.currency]
    );

    await client.query(
        `INSERT INTO molam_reward_ledger
       (event,user_id,tx_id,reward_id,debit_pool,credit_user,currency,country_code,meta)
     VALUES ('convert',$1,$2,$3,$4,$4,$5,$6,'{"source":"reward"}')`,
        [reward.user_id, reward.tx_id, reward.id, reward.amount, reward.currency, reward.country_code]
    );
}

export async function ledgerClawback(reward: any, amount: number): Promise<boolean> {
    // Correction : utiliser withTxn depuis db directement
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const w = await client.query(
            `UPDATE molam_wallets SET balance = balance - $1, updated_at=NOW()
       WHERE user_id=$2 AND currency=$3 AND balance >= $1 RETURNING *`,
            [amount, reward.user_id, reward.currency]
        );

        if (!w.rowCount) {
            await client.query('ROLLBACK');
            return false;
        }

        await client.query(
            `UPDATE molam_system_wallets SET balance = balance + $1, updated_at=NOW()
       WHERE country_code=$2 AND currency=$3`,
            [amount, reward.country_code, reward.currency]
        );

        await client.query(
            `INSERT INTO molam_reward_ledger
         (event,user_id,tx_id,reward_id,debit_user,credit_pool,currency,country_code,meta)
       VALUES ('clawback',$1,$2,$3,$4,$4,$5,$6,'{}')`,
            [reward.user_id, reward.tx_id, reward.id, amount, reward.currency, reward.country_code]
        );

        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function createDebtIfNeeded(reward: any, amount: number) {
    await db.query(
        `INSERT INTO molam_reward_debts (user_id,reward_id,amount_due,currency)
     VALUES ($1,$2,$3,$4)`,
        [reward.user_id, reward.id, amount, reward.currency]
    );
}