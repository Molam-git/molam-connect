// src/agents/commission.service.ts
import { Pool } from "pg";
import { Request, Response } from "express";
import { withTx } from "../common/db";
import { verifyEmployeeJWT, verifyAgentJWT, requireFinanceRole } from "../common/security";
import { publishEvent } from "../common/events";

const pool = new Pool();

export async function getBalances(req: Request, res: Response) {
    // Agent can view only their balances; finance can view any.
    const auth = await (req.headers["x-actor-type"] === "EMPLOYEE" ? verifyEmployeeJWT(req) : verifyAgentJWT(req));
    const agentId = Number(req.query.agentId);
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    if (auth.type === "AGENT" && auth.agentId !== agentId) return res.status(403).json({ error: "forbidden" });

    const { rows } = await pool.query(
        `SELECT currency, accrued_minor, locked_minor, paid_minor, updated_at
       FROM molam_agent_commission_balances
      WHERE agent_id=$1`,
        [agentId]
    );
    res.json({ agentId, balances: rows });
}

export async function createStatement(req: Request, res: Response) {
    await requireFinanceRole(req, ["pay_finance", "superadmin"]);
    const { agentId, currency, periodStart, periodEnd } = req.body;
    if (!agentId || !currency || !periodStart || !periodEnd) return res.status(400).json({ error: "bad params" });

    const client = await pool.connect();
    try {
        const { rows: [{ fn_commission_lock_period: statementId }] } = await client.query(
            `SELECT fn_commission_lock_period($1,$2,$3::timestamptz,$4::timestamptz)`,
            [agentId, currency, periodStart, periodEnd]
        );
        const detail = await client.query(
            `SELECT * FROM molam_agent_statements WHERE statement_id=$1`,
            [statementId]
        );
        return res.status(201).json({ statement: detail.rows[0] });
    } finally {
        client.release();
    }
}

export async function getStatement(req: Request, res: Response) {
    const statementId = Number(req.params.statementId);
    if (!statementId) return res.status(400).json({ error: "bad id" });

    const { rows: [header] } = await pool.query(
        `SELECT * FROM molam_agent_statements WHERE statement_id=$1`, [statementId]
    );
    if (!header) return res.status(404).json({ error: "not found" });

    const lines = await pool.query(
        `SELECT l.*, o.op_type, o.created_at
       FROM molam_agent_statement_lines l
       JOIN molam_cash_operations o ON o.op_id = l.op_id
      WHERE l.statement_id=$1
      ORDER BY l.line_id ASC`, [statementId]
    );

    res.json({ header, lines: lines.rows });
}

export async function addAdjustment(req: Request, res: Response) {
    await requireFinanceRole(req, ["pay_finance", "auditor", "superadmin"]);
    const statementId = Number(req.params.statementId);
    const { amountMinor, reasonCode } = req.body;
    if (!statementId || !amountMinor || !reasonCode) return res.status(400).json({ error: "bad params" });

    const client = await pool.connect();
    try {
        await withTx(client, async (tx) => {
            const { rows: [st] } = await tx.query(
                `SELECT * FROM molam_agent_statements WHERE statement_id=$1 FOR UPDATE`, [statementId]
            );
            if (!st) throw new Error("not found");
            if (st.status !== "OPEN") throw new Error("statement not OPEN");

            await tx.query(
                `INSERT INTO molam_agent_commission_adjustments(agent_id, currency, amount_minor, reason_code, related_statement)
         VALUES ($1,$2,$3,$4,$5)`,
                [st.agent_id, st.currency, amountMinor, reasonCode, statementId]
            );

            await tx.query(`SELECT fn_statement_apply_adjustment($1,$2,$3)`, [statementId, amountMinor, reasonCode]);

            await tx.query(
                `INSERT INTO molam_audit_logs(actor_type, actor_id, action, target_id, context, hash_curr)
         VALUES ('EMPLOYEE',NULL,'AGENT_COMM_ADJUST',$1,$2,encode(digest(random()::text,'sha256'),'hex'))`,
                [statementId, JSON.stringify({ amountMinor, reasonCode })]
            );
        });

        res.json({ ok: true });
    } finally {
        client.release();
    }
}

export async function lockStatement(req: Request, res: Response) {
    await requireFinanceRole(req, ["pay_finance", "superadmin"]);
    const statementId = Number(req.params.statementId);
    if (!statementId) return res.status(400).json({ error: "bad id" });

    const client = await pool.connect();
    try {
        await withTx(client, async (tx) => {
            const { rows: [st] } = await tx.query(
                `SELECT * FROM molam_agent_statements WHERE statement_id=$1 FOR UPDATE`, [statementId]
            );
            if (!st) throw new Error("not found");
            if (st.status !== "OPEN") throw new Error("statement not OPEN");

            await tx.query(`SELECT fn_statement_lock($1)`, [statementId]);

            await tx.query(
                `INSERT INTO molam_audit_logs(actor_type, actor_id, action, target_id, context, hash_curr)
         VALUES ('EMPLOYEE',NULL,'AGENT_COMM_LOCK',$1,$2,encode(digest(random()::text,'sha256'),'hex'))`,
                [statementId, JSON.stringify({})]
            );
        });

        await publishEvent("agent.statement.locked", { statementId });
        res.json({ ok: true, status: "LOCKED" });
    } finally {
        client.release();
    }
}