import { Pool } from 'pg';

export interface AgentWallet {
    wallet_id: string;
    agent_id: string;
    balance: number;
    currency: string;
    updated_at: Date;
}

export class AgentWalletModel {
    constructor(private db: Pool) { }

    async create(wallet: Omit<AgentWallet, 'wallet_id' | 'updated_at'>): Promise<AgentWallet> {
        const { rows } = await this.db.query(
            'INSERT INTO agent_wallets (agent_id, balance, currency) VALUES ($1, $2, $3) RETURNING *',
            [wallet.agent_id, wallet.balance, wallet.currency]
        );
        return rows[0];
    }

    async findByAgentId(agent_id: string): Promise<AgentWallet | null> {
        const { rows } = await this.db.query('SELECT * FROM agent_wallets WHERE agent_id = $1', [agent_id]);
        return rows[0] || null;
    }

    async updateBalance(agent_id: string, amount: number): Promise<AgentWallet> {
        const { rows } = await this.db.query(
            'UPDATE agent_wallets SET balance = balance + $1, updated_at = NOW() WHERE agent_id = $2 RETURNING *',
            [amount, agent_id]
        );
        return rows[0];
    }
}