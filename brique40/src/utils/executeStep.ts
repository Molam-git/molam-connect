// src/utils/executeStep.ts
import { pool } from "../db";

export async function executeStep(step: any, ctx: any) {
    const type = step.type;
    switch (type) {
        case "ledger_hold":
            return executeLedgerHold(step, ctx);
        case "ledger_release":
            return executeLedgerRelease(step, ctx);
        case "refund":
            return executeRefund(step, ctx);
        case "notify":
            return executeNotify(step, ctx);
        case "create_approval":
            return executeCreateApproval(step, ctx);
        default:
            throw new Error(`unknown step type: ${type}`);
    }
}

async function executeLedgerHold(step: any, ctx: any) {
    const idemp = ctx.idempotency || step.idempotency_key || `hold:${ctx.fraudCase.id}:${step.name}`;
    await pool.query(
        `INSERT INTO fraud_automation_logs (source, event) VALUES ($1,$2)`,
        ["worker", { action: "ledger_hold", case: ctx.fraudCase.id, step, idemp }]
    );
    return { ok: true, idempotency: idemp };
}

async function executeLedgerRelease(step: any, ctx: any) {
    await pool.query(
        `INSERT INTO fraud_automation_logs (source, event) VALUES ($1,$2)`,
        ["worker", { action: "ledger_release", case: ctx.fraudCase.id, step }]
    );
    return { ok: true };
}

async function executeRefund(step: any, ctx: any) {
    await pool.query(
        `INSERT INTO fraud_automation_logs (source, event) VALUES ($1,$2)`,
        ["worker", { action: "refund", case: ctx.fraudCase.id, step }]
    );
    return { ok: true };
}

async function executeNotify(step: any, ctx: any) {
    await pool.query(
        `INSERT INTO fraud_automation_logs (source, event) VALUES ($1,$2)`,
        ["worker", { action: "notify", case: ctx.fraudCase.id, params: step.params }]
    );
    return { ok: true };
}

async function executeCreateApproval(step: any, ctx: any) {
    const required = step.params?.required_roles || [];
    const { rows } = await pool.query(
        `INSERT INTO fraud_approvals (fraud_case_id, action_type, required_signers, approvals) VALUES ($1,$2,$3,$4) RETURNING *`,
        [ctx.fraudCase.id, step.name || "approval", JSON.stringify(required), JSON.stringify([])]
    );
    return { ok: true, approval: rows[0] };
}