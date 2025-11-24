import { pool } from "../db";
import { AgentInsurancePolicy } from "../types/insurance";

export async function quotePremium(agentId: number, coverPct: number, currency: string) {
    const { rows } = await pool.query(
        `SELECT float_closing FROM agent_float_snapshots WHERE agent_id=$1 ORDER BY snapshot_ts DESC LIMIT 1`,
        [agentId]
    );
    const float = rows[0]?.float_closing || 0;
    const exposure = (float * coverPct) / 100;

    const { rows: rrows } = await pool.query(
        `SELECT score FROM agent_risk_scores WHERE agent_id=$1 ORDER BY computed_at DESC LIMIT 1`,
        [agentId]
    );
    const risk = rrows[0]?.score ?? 50;

    const basePct = 0.005;
    const riskMultiplier = 1 + (risk - 50) / 100;
    const premium = Math.max(1, Number((exposure * basePct * riskMultiplier).toFixed(2)));

    return { exposure, premium, currency };
}

export async function createPolicy(
    agentId: number,
    coverPct: number,
    currency: string,
    startDate: string,
    endDate: string,
    reinsurancePartnerId?: string
): Promise<AgentInsurancePolicy> {
    const q = `INSERT INTO agent_insurance_policies (agent_id, cover_pct, currency, start_date, end_date, policy_status, reinsurance_partner_id) 
             VALUES ($1,$2,$3,$4,$5,'active',$6) RETURNING *`;
    const { rows } = await pool.query(q, [agentId, coverPct, currency, startDate, endDate, reinsurancePartnerId || null]);
    return rows[0];
}