// src/agents/service.ts
import { Pool } from "pg";
import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { calcFee } from "./utils/fees";
import { withTx } from "../common/db";
import { verifyAgentJWT, requireMTLS, checkRateLimit } from "../common/security";
import { ensureIdempotency } from "../common/idempotency";
import { siraScore } from "../sira/score";
import { publishEvent } from "../common/events";
import { getWalletByUser, creditWallet, debitWallet } from "../wallets/wallet";
import { getPricing } from "./utils/pricing";

const pool = new Pool();

export async function initCashIn(req: Request, res: Response) {
    requireMTLS(req);                     // mTLS client cert validation
    const agent = await verifyAgentJWT(req); // JWT -> {agentId, terminalId, country_code, kyc_level}
    await checkRateLimit(`agent:${agent.agentId}:cashin`, 60, 30); // 30 req/min

    const { opType, amountMinor, currency, receiverUserId, metadata, idempotencyKey } = req.body;
    if (!["CASHIN_SELF", "CASHIN_OTHER"].includes(opType)) return res.status(400).json({ error: "Bad opType" });

    await ensureIdempotency(pool, idempotencyKey, req);

    // Determine emitter (for CASHIN_OTHER the emitter is the agent's customer at the counter; we model as agent-initiated on behalf)
    const emitterUserId = opType === "CASHIN_OTHER" ? (metadata?.emitterUserId) : receiverUserId;
    if (!emitterUserId) return res.status(400).json({ error: "emitterUserId required in metadata for CASHIN_OTHER" });

    // Pricing
    const pricing = await getPricing(pool, {
        country_code: agent.country_code,
        currency,
        kyc_level: metadata?.kyc_level || "P1",
        op_type: opType
    });

    // Fee calculation (FREE for CASHIN_SELF)
    const feeMinor = calcFee(pricing, amountMinor);

    // SIRA scoring
    const sira = await siraScore({
        opType,
        agentId: agent.agentId,
        emitterUserId,
        receiverUserId,
        amountMinor,
        currency,
        country_code: agent.country_code
    });

    const client = await pool.connect();
    try {
        const result = await withTx(client, async (tx) => {
            const { rows: [op] } = await tx.query(
                `INSERT INTO molam_cash_operations
         (idempotency_key, op_type, agent_id, terminal_id, emitter_user_id, receiver_user_id,
          currency, amount_minor, fee_minor, agent_commission_minor, net_amount_minor, status,
          country_code, kyc_level_applied, sira_score, sira_flags, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,'PENDING',$11,$12,$13,$14,$15)
         RETURNING *`,
                [
                    idempotencyKey || uuidv4(),
                    opType,
                    agent.agentId,
                    agent.terminalId || null,
                    emitterUserId,
                    receiverUserId,
                    currency,
                    amountMinor,
                    feeMinor,
                    amountMinor, // net to credit later (fees charged to emitter separately)
                    agent.country_code,
                    metadata?.kyc_level || "P1",
                    sira.score,
                    JSON.stringify(sira.flags || {}),
                    JSON.stringify(metadata || {})
                ]
            );

            await tx.query(
                `INSERT INTO molam_audit_logs(actor_type, actor_id, action, target_id, context, hash_curr)
         VALUES ('AGENT',$1,'${opType}',$2,$3,encode(digest(random()::text,'sha256'),'hex'))`,
                [agent.agentId, op.op_id, JSON.stringify({ amountMinor, currency, feeMinor })]
            );

            return op;
        });

        await publishEvent("cash_op.initiated", { opId: result.op_id });
        return res.status(201).json({ opId: result.op_id, status: result.status, feeMinor });
    } finally {
        client.release();
    }
}

export async function confirmCashIn(req: Request, res: Response) {
    requireMTLS(req);
    const agent = await verifyAgentJWT(req);
    const { opId, approve } = req.body;

    const client = await pool.connect();
    try {
        const opRes = await client.query(`SELECT * FROM molam_cash_operations WHERE op_id=$1 FOR UPDATE`, [opId]);
        if (opRes.rowCount === 0) return res.status(404).json({ error: "not found" });
        const op = opRes.rows[0];
        if (op.status !== "PENDING") return res.status(409).json({ error: "already decided", status: op.status });

        if (!approve) {
            await client.query(`UPDATE molam_cash_operations SET status='DECLINED', updated_at=NOW() WHERE op_id=$1`, [opId]);
            return res.json({ opId, status: "DECLINED" });
        }

        // Apply ledger effects:
        await withTx(client, async (tx) => {
            // 1) Charge emitter fees if any
            if (op.fee_minor > 0 && op.emitter_user_id) {
                await debitWallet(tx, op.emitter_user_id, op.currency, op.fee_minor, {
                    reason: "FEE",
                    ref: `op:${op.op_id}`
                });
            }
            // 2) Credit receiver with net amount
            await creditWallet(tx, op.receiver_user_id, op.currency, op.net_amount_minor, {
                reason: op.op_type,
                ref: `op:${op.op_id}`
            });

            // 3) Accrue agent commission from fee (according pricing)
            const pricing = await getPricing(tx, {
                country_code: op.country_code,
                currency: op.currency,
                kyc_level: op.kyc_level_applied,
                op_type: op.op_type
            });
            const agentShareMinor = Math.floor((op.fee_minor * (pricing.agent_share_bp || 0)) / 10_000);
            await tx.query(
                `INSERT INTO molam_agent_commissions(op_id, agent_id, currency, fee_minor, agent_share_minor, molam_share_minor)
         VALUES ($1,$2,$3,$4,$5,$6)`,
                [op.op_id, op.agent_id, op.currency, op.fee_minor, agentShareMinor, op.fee_minor - agentShareMinor]
            );

            await tx.query(`UPDATE molam_cash_operations SET status='APPROVED', updated_at=NOW() WHERE op_id=$1`, [op.op_id]);

            await tx.query(
                `INSERT INTO molam_audit_logs(actor_type, actor_id, action, target_id, context, hash_curr)
         VALUES ('AGENT',$1,'CASHIN_APPROVE',$2,$3,encode(digest(random()::text,'sha256'),'hex'))`,
                [agent.agentId, op.op_id, JSON.stringify({ agentShareMinor })]
            );
        });

        await publishEvent("cash_op.approved", { opId });
        return res.json({ opId, status: "APPROVED" });
    } finally {
        client.release();
    }
}

export async function initCashOut(req: Request, res: Response) {
    requireMTLS(req);
    const agent = await verifyAgentJWT(req);
    await checkRateLimit(`agent:${agent.agentId}:cashout`, 60, 30);

    const { amountMinor, currency, receiverUserId, idempotencyKey } = req.body;
    await ensureIdempotency(pool, idempotencyKey, req);

    // Cash-out is free to beneficiary -> fee=0; debit beneficiary wallet net
    const client = await pool.connect();
    try {
        const result = await withTx(client, async (tx) => {
            // SIRA
            const sira = await siraScore({
                opType: "CASHOUT",
                agentId: agent.agentId,
                emitterUserId: receiverUserId,
                receiverUserId,
                amountMinor,
                currency,
                country_code: agent.country_code
            });

            const { rows: [op] } = await tx.query(
                `INSERT INTO molam_cash_operations
           (idempotency_key, op_type, agent_id, terminal_id, emitter_user_id, receiver_user_id,
            currency, amount_minor, fee_minor, agent_commission_minor, net_amount_minor, status,
            country_code, kyc_level_applied, sira_score, sira_flags)
         VALUES ($1,'CASHOUT',$2,$3,$4,$4,$5,$6,0,0,$6,'PENDING',$7,$8,$9,$10)
         RETURNING *`,
                [
                    idempotencyKey || uuidv4(),
                    agent.agentId,
                    agent.terminalId || null,
                    receiverUserId,
                    currency,
                    amountMinor,
                    agent.country_code,
                    "P1",
                    sira.score,
                    JSON.stringify(sira.flags || {})
                ]
            );

            await tx.query(
                `INSERT INTO molam_audit_logs(actor_type, actor_id, action, target_id, context, hash_curr)
         VALUES ('AGENT',$1,'CASHOUT',$2,$3,encode(digest(random()::text,'sha256'),'hex'))`,
                [agent.agentId, op.op_id, JSON.stringify({ amountMinor, currency })]
            );

            return op;
        });

        return res.status(201).json({ opId: result.op_id, status: result.status, feeMinor: 0 });
    } finally {
        client.release();
    }
}

export async function confirmCashOut(req: Request, res: Response) {
    requireMTLS(req);
    const agent = await verifyAgentJWT(req);
    const { opId, approve } = req.body;

    const client = await pool.connect();
    try {
        const opRes = await client.query(`SELECT * FROM molam_cash_operations WHERE op_id=$1 FOR UPDATE`, [opId]);
        if (opRes.rowCount === 0) return res.status(404).json({ error: "not found" });
        const op = opRes.rows[0];
        if (op.status !== "PENDING") return res.status(409).json({ error: "already decided", status: op.status });
        if (op.op_type !== "CASHOUT") return res.status(400).json({ error: "wrong type" });

        if (!approve) {
            await client.query(`UPDATE molam_cash_operations SET status='DECLINED', updated_at=NOW() WHERE op_id=$1`, [opId]);
            return res.json({ opId, status: "DECLINED" });
        }

        await withTx(client, async (tx) => {
            // Debit beneficiary wallet (no fee)
            await debitWallet(tx, op.receiver_user_id, op.currency, op.net_amount_minor, {
                reason: "CASHOUT",
                ref: `op:${op.op_id}`
            });
            await tx.query(`UPDATE molam_cash_operations SET status='APPROVED', updated_at=NOW() WHERE op_id=$1`, [op.op_id]);
            await tx.query(
                `INSERT INTO molam_audit_logs(actor_type, actor_id, action, target_id, context, hash_curr)
         VALUES ('AGENT',$1,'CASHOUT_APPROVE',$2,$3,encode(digest(random()::text,'sha256'),'hex'))`,
                [agent.agentId, op.op_id, JSON.stringify({})]
            );
        });

        await publishEvent("cash_op.approved", { opId });
        return res.json({ opId, status: "APPROVED" });
    } finally {
        client.release();
    }
}

export async function getOperationStatus(req: Request, res: Response) {
    requireMTLS(req);
    await verifyAgentJWT(req);
    const { opId } = req.params;

    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            `SELECT op_id, op_type, status, amount_minor, fee_minor, currency, created_at 
       FROM molam_cash_operations WHERE op_id = $1`,
            [opId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Operation not found" });
        }

        return res.json(rows[0]);
    } finally {
        client.release();
    }
}