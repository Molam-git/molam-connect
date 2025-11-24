import { Pool } from 'pg';

export interface AgentPayout {
    payout_id: string;
    agent_id: string;
    amount: number;
    currency: string;
    status: 'PENDING' | 'SENT' | 'FAILED';
    scheduled_for: Date;
    created_at: Date;
}

export class AgentPayoutModel {
    constructor(private db: Pool) { }

    async create(payout: Omit<AgentPayout, 'payout_id' | 'created_at'>): Promise<AgentPayout> {
        const query = `
      INSERT INTO agent_payouts (agent_id, amount, currency, status, scheduled_for)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
        const values = [
            payout.agent_id,
            payout.amount,
            payout.currency,
            payout.status,
            payout.scheduled_for
        ];

        const { rows } = await this.db.query(query, values);
        return rows[0];
    }

    async findById(payout_id: string): Promise<AgentPayout | null> {
        const { rows } = await this.db.query('SELECT * FROM agent_payouts WHERE payout_id = $1', [payout_id]);
        return rows[0] || null;
    }

    async updateStatus(payout_id: string, status: AgentPayout['status']): Promise<AgentPayout> {
        const { rows } = await this.db.query(
            'UPDATE agent_payouts SET status = $1 WHERE payout_id = $2 RETURNING *',
            [status, payout_id]
        );
        return rows[0];
    }

    async findByAgentId(agent_id: string, status?: string, limit: number = 50): Promise<AgentPayout[]> {
        let query = 'SELECT * FROM agent_payouts WHERE agent_id = $1';
        const params: any[] = [agent_id];

        if (status) {
            query += ' AND status = $2';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
        params.push(limit);

        const { rows } = await this.db.query(query, params);
        return rows;
    }

    async findPendingPayouts(): Promise<AgentPayout[]> {
        const { rows } = await this.db.query(
            `SELECT ap.*, ma.user_id, ma.country_code 
       FROM agent_payouts ap
       JOIN molam_agents ma ON ap.agent_id = ma.agent_id
       WHERE ap.status = 'PENDING' AND ap.scheduled_for <= NOW()
       ORDER BY ap.scheduled_for ASC`
        );
        return rows;
    }
}