import { Router } from "express";
import { pool } from "../utils/db";
export const banksRouter = Router();

banksRouter.post("/partners", async (req, res) => {
    const { code, name, countries, currencies, ip_allowlist } = req.body;
    const q = `INSERT INTO bank_partners(code,name,countries,currencies,ip_allowlist)
             VALUES($1,$2,$3,$4,$5) RETURNING *`;
    const { rows } = await pool.query(q, [code, name, countries, currencies, ip_allowlist || []]);
    res.status(201).json(rows[0]);
});

banksRouter.post("/partners/:partnerId/rails", async (req, res) => {
    const { partnerId } = req.params;
    const payload = req.body;
    const q = `INSERT INTO bank_settlement_rails(partner_id, rail_code, country, currency,
             supports_in, supports_out, bank_fee_fixed, bank_fee_pct, molam_fee_fixed, molam_fee_pct,
             min_amount, max_amount, sla_minutes)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (partner_id, rail_code, country, currency) DO UPDATE SET
             supports_in=$5,supports_out=$6,bank_fee_fixed=$7,bank_fee_pct=$8,
             molam_fee_fixed=$9,molam_fee_pct=$10,min_amount=$11,max_amount=$12,sla_minutes=$13
             RETURNING *`;
    const { rows } = await pool.query(q, [
        partnerId, payload.rail_code, payload.country, payload.currency,
        payload.supports_in ?? true, payload.supports_out ?? true,
        payload.bank_fee_fixed ?? 0, payload.bank_fee_pct ?? 0,
        payload.molam_fee_fixed ?? 0, payload.molam_fee_pct ?? 0.009,
        payload.min_amount ?? 0, payload.max_amount ?? 0, payload.sla_minutes ?? 1440
    ]);
    res.status(201).json(rows[0]);
});

banksRouter.post("/partners/:partnerId/accounts", async (req, res) => {
    const { partnerId } = req.params;
    const { country, currency, account_name, account_number, bank_identifier, meta } = req.body;
    const q = `INSERT INTO bank_partner_accounts(partner_id,country,currency,account_name,account_number,bank_identifier,meta)
             VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`;
    const { rows } = await pool.query(q, [partnerId, country, currency, account_name, account_number, bank_identifier, meta || {}]);
    res.status(201).json(rows[0]);
});