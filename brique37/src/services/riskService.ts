import { pool } from "../db";
import { AgentRiskScore } from "../types/insurance";

export async function getLatestRiskScore(agentId: number): Promise<AgentRiskScore | null> {
    const { rows } = await pool.query(
        `SELECT * FROM agent_risk_scores WHERE agent_id=$1 ORDER BY computed_at DESC LIMIT 1`,
        [agentId]
    );
    return rows[0] || null;
}

export async function getRiskScores(agentId: number, limit: number = 30): Promise<AgentRiskScore[]> {
    const { rows } = await pool.query(
        `SELECT * FROM agent_risk_scores WHERE agent_id=$1 ORDER BY computed_at DESC LIMIT $2`,
        [agentId, limit]
    );
    return rows;
}