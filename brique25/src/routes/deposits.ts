import { Router } from "express";
import { pool, withTx } from "../utils/db";
import { computeFees } from "../utils/fees";
import { publishEvent } from "../utils/kafka";

export const depositsRouter = Router();

depositsRouter.post("/", async (req: any, res: any) => {
    const { partner_code, rail_code, bank_link_id, wallet_id, amount, currency } = req.body;
    const user = req.user;

    try {
        const { rows: pr } = await pool.query(`SELECT id,countries,currencies FROM bank_partners WHERE code=$1 AND status='active'`, [partner_code]);
        if (!pr.length) return res.status(400).json({ error: "invalid_partner" });
        const partner_id = pr[0].id;

        const { rows: rails } = await pool.query(
            `SELECT * FROM bank_settlement_rails WHERE partner_id=$1 AND rail_code=$2 AND country=$3 AND currency=$4 AND status='active'`,
            [partner_id, rail_code, user.country, currency || user.currency]
        );
        if (!rails.length) return res.status(400).json({ error: "unsupported_rail_country_currency" });
        const rail = rails[0];

        const fees = computeFees(rail, amount);
        const idempotencyKey = req.headers["idempotency-key"] as string;

        await withTx(async (client) => {
            const ins = `INSERT INTO bank_transfers(direction,user_id,wallet_id,partner_id,rail_code,bank_link_id,
                       amount,currency,country,bank_fee,molam_fee,total_fee,amount_net,status,
                       idempotency_key,initiated_by,initiated_via)
                   VALUES('IN',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$14,$15)
                   RETURNING id`;
            const { rows } = await client.query(ins, [
                user.id, wallet_id, partner_id, rail_code, bank_link_id || null,
                amount, currency || user.currency, user.country,
                fees.bank_fee, fees.molam_fee, fees.total_fee, amount - fees.total_fee,
                idempotencyKey, user.id, (req.headers["x-client"] as string) || "app"
            ]);
            const transfer_id = rows[0].id;

            await publishEvent("bank_transfer_created", { transfer_id, direction: "IN", partner_id, rail_code, amount, currency: currency || user.currency });

            res.status(202).json({ transfer_id, status: "pending", fees });
        });
    } catch (e: any) {
        res.status(500).json({ error: "server_error", detail: e.message });
    }
});