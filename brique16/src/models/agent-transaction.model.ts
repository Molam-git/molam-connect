import { Pool } from 'pg';

export interface AgentTransaction {
    tx_id: string;
    agent_id: string;
    user_id: string;
    type: 'CASHIN' | 'CASHOUT';
    amount: number;
    currency: string;
    commission: number;
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    created_at: Date;
}

export class AgentTransactionModel {
    constructor(private db: Pool) { }

    async create(transaction: Omit<AgentTransaction, 'tx_id' | 'created_at'>): Promise<AgentTransaction> {
        const query = `
      INSERT INTO agent_transactions (agent_id, user_id, type, amount, currency, commission, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
        const values = [
            transaction.agent_id,
            transaction.user_id,
            transaction.type,
            transaction.amount,
            transaction.currency,
            transaction.commission,
            transaction.status
        ];

        const { rows } = await this.db.query(query, values);
        return rows[0];
    }

    async findByAgentId(agent_id: string, limit = 50): Promise<AgentTransaction[]> {
        const { rows } = await this.db.query(
            'SELECT * FROM agent_transactions WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2',
            [agent_id, limit]
        );
        return rows;
    }

    async updateStatus(tx_id: string, status: AgentTransaction['status']): Promise<AgentTransaction> {
        const { rows } = await this.db.query(
            'UPDATE agent_transactions SET status = $1 WHERE tx_id = $2 RETURNING *',
            [status, tx_id]
        );
        return rows[0];
    }
}