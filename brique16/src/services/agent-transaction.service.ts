import { Pool } from 'pg';
import { AgentTransactionModel } from '../models/agent-transaction.model';
import { AgentModel } from '../models/agent.model';
import { AgentWalletModel } from '../models/agent-wallet.model';
import { CommissionService } from './commission.service';

interface TransactionRequest {
    agent_id: string;
    user_id: string;
    type: 'CASHIN' | 'CASHOUT';
    amount: number;
    currency: string;
}

export class AgentTransactionService {
    private transactionModel: AgentTransactionModel;
    private agentModel: AgentModel;
    private walletModel: AgentWalletModel;
    private commissionService: CommissionService;

    constructor(private db: Pool) {
        this.transactionModel = new AgentTransactionModel(db);
        this.agentModel = new AgentModel(db);
        this.walletModel = new AgentWalletModel(db);
        this.commissionService = new CommissionService(db);
    }

    async processTransaction(request: TransactionRequest) {
        const client = await this.db.connect();

        try {
            await client.query('BEGIN');

            // Verify agent exists and is active
            const agent = await this.agentModel.findById(request.agent_id);
            if (!agent || agent.status !== 'ACTIVE') {
                throw new Error('Agent not found or inactive');
            }

            // Get agent wallet
            const wallet = await this.walletModel.findByAgentId(request.agent_id);
            if (!wallet) {
                throw new Error('Agent wallet not found');
            }

            // Calculate commission
            const commission = await this.commissionService.calculateCommission(
                request.agent_id,
                request.type,
                request.amount
            );

            let transactionStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';

            // Process based on transaction type
            if (request.type === 'CASHIN') {
                // For cash-in, add to agent's wallet
                await this.walletModel.updateBalance(request.agent_id, request.amount);
            } else if (request.type === 'CASHOUT') {
                // For cash-out, check balance and deduct
                if (wallet.balance < request.amount) {
                    throw new Error('Insufficient funds');
                }
                await this.walletModel.updateBalance(request.agent_id, -request.amount);
            }

            // Create transaction record
            const transaction = await this.transactionModel.create({
                agent_id: request.agent_id,
                user_id: request.user_id,
                type: request.type,
                amount: request.amount,
                currency: request.currency,
                commission,
                status: transactionStatus
            });

            // Record commission if applicable
            if (commission > 0) {
                await this.commissionService.recordCommission({
                    agent_id: request.agent_id,
                    amount: commission,
                    currency: request.currency,
                    source_tx_id: transaction.tx_id
                });
            }

            await client.query('COMMIT');
            return transaction;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async getAgentTransactions(agent_id: string, limit: number = 50) {
        return await this.transactionModel.findByAgentId(agent_id, limit);
    }
}