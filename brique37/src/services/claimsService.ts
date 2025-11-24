import { pool } from "../db";
import { publishEvent } from "../events";
import { InsuranceClaim } from "../types/insurance";

export async function submitClaim(
    policyId: string,
    agentId: number,
    amount: number,
    evidence: any
): Promise<InsuranceClaim> {
    const { rows } = await pool.query(
        `INSERT INTO agent_insurance_claims (policy_id, agent_id, claim_amount, currency, evidence) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [policyId, agentId, amount, "LOCAL", evidence]
    );
    const claim = rows[0];
    await publishEvent("agent.claim.submitted", { claimId: claim.id, agentId, amount });
    return claim;
}

export async function resolveClaim(claimId: string, approve: boolean, approver: string): Promise<void> {
    if (approve) {
        await pool.query(
            `UPDATE agent_insurance_claims SET status='approved', approved_at=now() WHERE id=$1`,
            [claimId]
        );
        const { rows } = await pool.query(`SELECT * FROM agent_insurance_claims WHERE id=$1`, [claimId]);
        const claim = rows[0];
        await publishEvent("agent.claim.approved", {
            claimId: claim.id,
            amount: claim.claim_amount,
            agentId: claim.agent_id
        });
    } else {
        await pool.query(`UPDATE agent_insurance_claims SET status='rejected' WHERE id=$1`, [claimId]);
    }
}