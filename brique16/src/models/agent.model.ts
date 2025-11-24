import { Pool } from 'pg';

export interface Agent {
    agent_id: string;
    user_id: string;
    status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
    kyc_level: 'UNVERIFIED' | 'BASIC' | 'VERIFIED';
    commission_rate: number;
    payout_cycle: 'WEEKLY' | 'MONTHLY';
    country_code: string;
    currency: string;
    created_at: Date;
    updated_at: Date;
}

export class AgentModel {
    constructor(private db: Pool) { }

    async create(agent: Omit<Agent, 'agent_id' | 'created_at' | 'updated_at'>): Promise<Agent> {
        const query = `
      INSERT INTO molam_agents (user_id, status, kyc_level, commission_rate, payout_cycle, country_code, currency)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
        const values = [
            agent.user_id,
            agent.status,
            agent.kyc_level,
            agent.commission_rate,
            agent.payout_cycle,
            agent.country_code,
            agent.currency
        ];

        const { rows } = await this.db.query(query, values);
        return rows[0];
    }

    async findById(agent_id: string): Promise<Agent | null> {
        const { rows } = await this.db.query('SELECT * FROM molam_agents WHERE agent_id = $1', [agent_id]);
        return rows[0] || null;
    }

    async updateStatus(agent_id: string, status: Agent['status'], kyc_level: Agent['kyc_level']): Promise<Agent> {
        const { rows } = await this.db.query(
            'UPDATE molam_agents SET status = $1, kyc_level = $2, updated_at = NOW() WHERE agent_id = $3 RETURNING *',
            [status, kyc_level, agent_id]
        );
        return rows[0];
    }

    async findByUserId(user_id: string): Promise<Agent | null> {
        const { rows } = await this.db.query('SELECT * FROM molam_agents WHERE user_id = $1', [user_id]);
        return rows[0] || null;
    }
}