import { pool } from '../db';
import { createPayout } from './treasuryClient';
import { computeAgentShare } from '../utils/commission';

interface SettlementBatch {
    id: string;
    agent_id: number;
    currency: string;
    status: string;
    total_gross: number;
    total_fees: number;
    total_agent_due: number;
    reserved_buffer: number;
}

interface AgentContract {
    id: string;
    agent_id: number;
    currency: string;
    agent_share_pct: number;
    reserve_pct: number;
    payout_account: any;
    status: string;
}

export async function generateBatch(agentId: number, startDate: string, endDate: string): Promise<SettlementBatch> {
    // Récupère les transactions (simulation - adapter selon votre schéma)
    const { rows: txs } = await pool.query(
        `SELECT * FROM wallet_transactions 
     WHERE agent_id=$1 AND occurred_at::date BETWEEN $2 AND $3`,
        [agentId, startDate, endDate]
    );

    // Contrat de l'agent
    const contractResult = await pool.query(
        "SELECT * FROM agent_contracts WHERE agent_id=$1 AND status='active'",
        [agentId]
    );

    if (contractResult.rows.length === 0) {
        throw new Error(`No active contract found for agent ${agentId}`);
    }

    const contract: AgentContract = contractResult.rows[0];

    let totalGross = 0, totalFees = 0, totalAgentDue = 0;
    const lines = [];

    for (const tx of txs) {
        const agentShare = computeAgentShare(tx, contract);
        totalGross += Number(tx.amount);
        totalFees += Number(tx.fee_molam || 0) + Number(tx.fee_partner || 0);
        totalAgentDue += agentShare;
        lines.push({ ...tx, agentShare });
    }

    const reserved = (totalAgentDue * (contract.reserve_pct || 5)) / 100;

    const { rows: batchRows } = await pool.query(
        `INSERT INTO agent_settlement_batches
     (agent_id, currency, period_start, period_end, total_gross, total_fees, total_agent_due, reserved_buffer, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft') RETURNING *`,
        [agentId, contract.currency, startDate, endDate, totalGross, totalFees, totalAgentDue, reserved]
    );

    const batch: SettlementBatch = batchRows[0];

    // Insertion des lignes de détail
    for (const line of lines) {
        await pool.query(
            `INSERT INTO agent_settlement_lines 
       (batch_id, wallet_txn_id, type, amount, fee_molam, fee_partner, agent_share)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [batch.id, line.id, line.type, line.amount, line.fee_molam, line.fee_partner, line.agentShare]
        );
    }

    return batch;
}

export async function approveBatch(batchId: string, approverId: string): Promise<SettlementBatch> {
    const { rows } = await pool.query(
        `UPDATE agent_settlement_batches 
     SET status='approved', approved_by=jsonb_build_array($2), updated_at=now()
     WHERE id=$1 RETURNING *`,
        [batchId, approverId]
    );

    if (rows.length === 0) {
        throw new Error(`Batch ${batchId} not found`);
    }

    return rows[0];
}

export async function executeBatch(batchId: string, approverId: string): Promise<{ batch: SettlementBatch; payout: any }> {
    const batchResult = await pool.query("SELECT * FROM agent_settlement_batches WHERE id=$1", [batchId]);

    if (batchResult.rows.length === 0) {
        throw new Error(`Batch ${batchId} not found`);
    }

    const batch: SettlementBatch = batchResult.rows[0];

    if (batch.status !== "approved") {
        throw new Error("batch_not_approved");
    }

    const netAmount = Number(batch.total_agent_due) - Number(batch.reserved_buffer);
    if (netAmount <= 0) {
        throw new Error("no_amount_due");
    }

    const contractResult = await pool.query("SELECT * FROM agent_contracts WHERE agent_id=$1", [batch.agent_id]);
    if (contractResult.rows.length === 0) {
        throw new Error(`Contract not found for agent ${batch.agent_id}`);
    }

    const contract: AgentContract = contractResult.rows[0];

    const payout = await createPayout(batch.id, {
        origin_module: "agents",
        origin_entity_id: batch.agent_id,
        amount: netAmount,
        currency: batch.currency,
        beneficiary: contract.payout_account
    });

    await pool.query(
        `UPDATE agent_settlement_batches SET payout_id=$1, status='processing', updated_at=now() WHERE id=$2`,
        [payout.id, batchId]
    );

    return { batch, payout };
}

export async function getBatch(batchId: string): Promise<SettlementBatch> {
    const { rows } = await pool.query("SELECT * FROM agent_settlement_batches WHERE id=$1", [batchId]);

    if (rows.length === 0) {
        throw new Error(`Batch ${batchId} not found`);
    }

    return rows[0];
}