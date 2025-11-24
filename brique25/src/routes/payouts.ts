import { Router } from "express";
import { pool, withTx } from "../utils/db";
import { computeFees } from "../utils/fees";
import { publishEvent } from "../utils/kafka";

export const payoutsRouter = Router();

payoutsRouter.post("/", async (req: any, res: any) => {
    const { partner_code, rail_code, bank_link_id, wallet_id, amount, currency } = req.body;
    const user = req.user;

    try {
        const { rows: pr } = await pool.query(`SELECT id FROM bank_partners WHERE code=$1 AND status='active'`, [partner_code]);
        if (!pr.length) return res.status(400).json({ error: "invalid_partner" });
        const partner_id = pr[0].id;

        if (!bank_link_id) return res.status(400).json({ error: "missing_bank_link" });

        const { rows: railRows } = await pool.query(
            `SELECT * FROM bank_settlement_rails WHERE partner_id=$1 AND rail_code=$2 AND country=$3 AND currency=$4 AND status='active'`,
            [partner_id, rail_code, user.country, currency || user.currency]
        );
        if (!railRows.length) return res.status(400).json({ error: "unsupported_rail" });
        const rail = railRows[0];

        const fees = computeFees(rail, amount);
        const idem = req.headers["idempotency-key"] as string;

        await withTx(async (client) => {
            const { rows: w } = await client.query(`SELECT id, balance FROM molam_wallets WHERE id=$1 FOR UPDATE`, [wallet_id]);
            if (!w.length) throw new Error("wallet_not_found");
            const bal = Number(w[0].balance);
            const totalDebit = Number(amount) + Number(fees.total_fee);
            if (bal < totalDebit) return res.status(402).json({ error: "insufficient_funds" });

            const ins = `INSERT INTO bank_transfers(direction,user_id,wallet_id,partner_id,rail_code,bank_link_id,
                      amount,currency,country,bank_fee,molam_fee,total_fee,amount_net,status,
                      idempotency_key,initiated_by,initiated_via)
                   VALUES('OUT',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'processing',$13,$14,$15)
                   RETURNING id`;
            const { rows: tr } = await client.query(ins, [
                user.id, wallet_id, partner_id, rail_code, bank_link_id,
                amount, currency || user.currency, user.country,
                fees.bank_fee, fees.molam_fee, fees.total_fee, (Number(amount) - Number(fees.total_fee)),
                idem, user.id, (req.headers["x-client"] as string) || "app"
            ]);
            const transfer_id = tr[0].id;

            await publishEvent("wallet_debit_for_bank_payout", {
                wallet_id, amount, currency: currency || user.currency,
                fees, transfer_id
            });

            await publishEvent("bank_transfer_created", { transfer_id, direction: "OUT", partner_id, rail_code, amount, currency: currency || user.currency });

            res.status(202).json({ transfer_id, status: "processing", fees });
        });
    } catch (e: any) {
        res.status(500).json({ error: "server_error", detail: e.message });
    }
});