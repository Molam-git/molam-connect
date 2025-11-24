import { pool } from "../db";
import { kafkaProducer } from "../kafka";
import { computeRiskScore } from "../utils/risk";

export async function computeAndStoreRisk(agentId: number): Promise<number> {
    const { rows: metricsRows } = await pool.query(
        `SELECT 
       COALESCE(SUM(amount),0) as volume,
       COALESCE(stddev_pop(amount),0) as volatility,
       SUM(CASE WHEN status='disputed' THEN 1 ELSE 0 END) as disputes,
       MAX(snapshot_ts) as last_float_snapshot
     FROM wallet_transactions wt
     LEFT JOIN agent_float_snapshots afs ON afs.agent_id = wt.agent_id
     WHERE wt.agent_id=$1 AND wt.occurred_at > now() - interval '30 days'`,
        [agentId]
    );
    const metrics = metricsRows[0];

    const score = computeRiskScore({
        volume: Number(metrics.volume || 0),
        volatility: Number(metrics.volatility || 0),
        disputes: Number(metrics.disputes || 0)
    });

    await pool.query(
        `INSERT INTO agent_risk_scores (agent_id, score, factors) VALUES ($1,$2,$3)`,
        [agentId, score, {
            volume: metrics.volume,
            volatility: metrics.volatility,
            disputes: metrics.disputes
        }]
    );

    await kafkaProducer.send({
        topic: "agent.risk.updated",
        messages: [{ key: String(agentId), value: JSON.stringify({ agentId, score }) }]
    });

    return score;
}