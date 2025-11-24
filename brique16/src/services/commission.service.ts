import { Pool } from 'pg';
import { AgentCommissionModel } from '../models/agent-commission.model';
import { AgentModel } from '../models/agent.model';

export interface CommissionRecord {
    agent_id: string;
    amount: number;
    currency: string;
    source_tx_id: string;
}

export class CommissionService {
    private commissionModel: AgentCommissionModel;
    private agentModel: AgentModel;

    constructor(private db: Pool) {
        this.commissionModel = new AgentCommissionModel(db);
        this.agentModel = new AgentModel(db);
    }

    async calculateCommission(agent_id: string, transaction_type: 'CASHIN' | 'CASHOUT' | 'P2P', amount: number): Promise<number> {
        // Get agent details including country and custom commission rate
        const agent = await this.agentModel.findById(agent_id);
        if (!agent) {
            throw new Error('Agent not found');
        }

        // Apply commission rules based on transaction type
        let commissionRate = 0;

        switch (transaction_type) {
            case 'CASHIN':
                commissionRate = 0; // No commission for cash-in
                break;
            case 'CASHOUT':
                commissionRate = agent.commission_rate; // Use agent's custom rate or default
                break;
            case 'P2P':
                commissionRate = agent.commission_rate; // Same as cash-out for now
                break;
        }

        // Calculate commission amount
        const commission = (amount * commissionRate) / 100;

        return parseFloat(commission.toFixed(2));
    }

    async recordCommission(commission: CommissionRecord): Promise<void> {
        await this.commissionModel.create(commission);
    }

    async getAgentCommissions(agent_id: string, start_date?: Date, end_date?: Date): Promise<number> {
        return await this.commissionModel.getTotalCommissions(agent_id, start_date, end_date);
    }

    async getCommissionBreakdown(agent_id: string): Promise<any> {
        const breakdown = await this.commissionModel.getCommissionBreakdown(agent_id);
        const total = await this.commissionModel.getTotalCommissions(agent_id);

        return {
            total_commissions: total,
            breakdown: breakdown
        };
    }
}