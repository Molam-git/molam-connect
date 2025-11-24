import { Pool } from 'pg';
import { AgentModel, Agent } from '../models/agent.model';
import { AgentLocationModel } from '../models/agent-location.model';
import { AgentWalletModel } from '../models/agent-wallet.model';

export class AgentService {
    private agentModel: AgentModel;
    private locationModel: AgentLocationModel;
    private walletModel: AgentWalletModel;

    constructor(private db: Pool) {
        this.agentModel = new AgentModel(db);
        this.locationModel = new AgentLocationModel(db);
        this.walletModel = new AgentWalletModel(db);
    }

    async onboardAgent(agentData: Omit<Agent, 'agent_id' | 'created_at' | 'updated_at'>) {
        const client = await this.db.connect();

        try {
            await client.query('BEGIN');

            // Check if user already has an agent account
            const existingAgent = await this.agentModel.findByUserId(agentData.user_id);
            if (existingAgent) {
                throw new Error('User already has an agent account');
            }

            // Create agent
            const agent = await this.agentModel.create(agentData);

            // Create default wallet with 0 balance
            await this.walletModel.create({
                agent_id: agent.agent_id,
                balance: 0,
                currency: agentData.currency
            });

            await client.query('COMMIT');
            return agent;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async approveAgent(agent_id: string) {
        return await this.agentModel.updateStatus(agent_id, 'ACTIVE', 'VERIFIED');
    }

    async getAgentDetails(agent_id: string) {
        const [agent, locations, wallet] = await Promise.all([
            this.agentModel.findById(agent_id),
            this.locationModel.findByAgentId(agent_id),
            this.walletModel.findByAgentId(agent_id)
        ]);

        if (!agent) return null;

        return {
            ...agent,
            locations,
            wallet
        };
    }

    async addLocation(agent_id: string, locationData: any) {
        // Verify agent exists
        const agent = await this.agentModel.findById(agent_id);
        if (!agent) {
            throw new Error('Agent not found');
        }

        return await this.locationModel.create({
            agent_id,
            ...locationData
        });
    }
}