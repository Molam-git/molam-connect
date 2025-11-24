import { Pool } from 'pg';
import { AgentPayoutModel, AgentPayout } from '../models/agent-payout.model';
import { AgentModel } from '../models/agent.model';
import { AgentCommissionModel } from '../models/agent-commission.model';
import { AgentWalletModel } from '../models/agent-wallet.model';

interface PayoutRequest {
    agent_id: string;
    amount: number;
    currency: string;
    scheduled_for: Date;
}

export class AgentPayoutService {
    private payoutModel: AgentPayoutModel;
    private agentModel: AgentModel;
    private commissionModel: AgentCommissionModel;
    private walletModel: AgentWalletModel;

    constructor(private db: Pool) {
        this.payoutModel = new AgentPayoutModel(db);
        this.agentModel = new AgentModel(db);
        this.commissionModel = new AgentCommissionModel(db);
        this.walletModel = new AgentWalletModel(db);
    }

    async schedulePayout(request: PayoutRequest): Promise<AgentPayout> {
        const client = await this.db.connect();

        try {
            await client.query('BEGIN');

            // Verify agent exists and is active
            const agent = await this.agentModel.findById(request.agent_id);
            if (!agent || agent.status !== 'ACTIVE') {
                throw new Error('Agent not found');
            }

            // Calculate total commissions available for payout
            const totalCommissions = await this.commissionModel.getTotalCommissions(request.agent_id);

            if (totalCommissions < request.amount) {
                throw new Error('Insufficient commissions');
            }

            // Create payout record
            const payout = await this.payoutModel.create({
                agent_id: request.agent_id,
                amount: request.amount,
                currency: request.currency,
                status: 'PENDING',
                scheduled_for: request.scheduled_for
            });

            await client.query('COMMIT');
            return payout;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async processPayout(payout_id: string): Promise<AgentPayout> {
        const client = await this.db.connect();

        try {
            await client.query('BEGIN');

            // Get payout details
            const payout = await this.payoutModel.findById(payout_id);
            if (!payout) {
                throw new Error('Payout not found');
            }

            if (payout.status !== 'PENDING') {
                throw new Error('Payout already processed');
            }

            // Here you would integrate with your payment provider
            // For now, we'll simulate a successful payout

            // Update payout status to SENT
            const updatedPayout = await this.payoutModel.updateStatus(payout_id, 'SENT');

            // Deduct the amount from commissions (in real implementation, you'd mark commissions as paid)
            await this.commissionModel.markCommissionsAsPaid(payout.agent_id, payout.amount);

            await client.query('COMMIT');
            return updatedPayout;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async getAgentPayouts(agent_id: string, status?: string, limit: number = 50): Promise<AgentPayout[]> {
        return await this.payoutModel.findByAgentId(agent_id, status, limit);
    }

    async getPendingPayouts(): Promise<AgentPayout[]> {
        return await this.payoutModel.findPendingPayouts();
    }

    async calculatePayoutAmount(agent_id: string): Promise<number> {
        // Calculate total commissions available for payout
        return await this.commissionModel.getTotalCommissions(agent_id);
    }
}