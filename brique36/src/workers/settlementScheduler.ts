import { Queue } from "bullmq";
import { generateBatch } from "../services/agentSettlements";
import { pool } from "../db"; // Ajout de l'importation

export async function scheduleWeeklySettlements() {
    const agents = await pool.query("SELECT * FROM agent_contracts WHERE status='active'");
    for (const a of agents.rows) {
        if (a.payout_frequency === "weekly") {
            await settlementQueue.add("generate-batch", { agentId: a.agent_id });
        }
    }
}

const settlementQueue = new Queue("agent-settlements");