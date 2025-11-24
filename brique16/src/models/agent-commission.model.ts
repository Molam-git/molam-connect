import { Pool } from 'pg';

export interface AgentCommission {
    commission_id: string;
    agent_id: string;
    amount: number;
    currency: string;
    source_tx_id: string;
    created_at: Date;
}

export class AgentCommissionModel {
    constructor(private db: Pool) { }

    async create(commission: Omit<AgentCommission, 'commission_id' | 'created_at'>): Promise<AgentCommission> {
        const { rows } = await this.db.query(
            'INSERT INTO agent_commissions (agent_id, amount, currency, source_tx_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [commission.agent_id, commission.amount, commission.currency, commission.source_tx_id]
        );
        return rows[0];
    }

    async getTotalCommissions(agent_id: string, start_date?: Date, end_date?: Date): Promise<number> {
        let query = 'SELECT COALESCE(SUM(amount), 0) as total FROM agent_commissions WHERE agent_id = $1';
        const params: any[] = [agent_id];

        if (start_date) {
            query += ' AND created_at >= $2';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND created_at <= $3';
            params.push(end_date);
        }

        const { rows } = await this.db.query(query, params);
        return parseFloat(rows[0].total);
    }

    async getCommissionBreakdown(agent_id: string): Promise<any[]> {
        const { rows } = await this.db.query(
            `SELECT 
        DATE(ac.created_at) as date,
        COUNT(*) as transaction_count,
        SUM(ac.amount) as total_commissions
       FROM agent_commissions ac
       JOIN agent_transactions at ON ac.source_tx_id = at.tx_id
       WHERE ac.agent_id = $1
       GROUP BY DATE(ac.created_at)
       ORDER BY date DESC
       LIMIT 30`,
            [agent_id]
        );
        return rows;
    }

    async markCommissionsAsPaid(agent_id: string, amount: number): Promise<void> {
        // In a real implementation, you would update a status field or move to a paid table
        // For now, we'll just log this action
        console.log(`Marking ${amount} in commissions as paid for agent ${agent_id}`);
    }
}