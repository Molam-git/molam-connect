import { Request, Response } from 'express';
import { AgentTransactionService } from '../services/agent-transaction.service';
import { validationResult } from 'express-validator';

export class AgentTransactionController {
    constructor(private transactionService: AgentTransactionService) { }

    async createTransaction(req: Request, res: Response) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const { type, amount, userId } = req.body;

            const transaction = await this.transactionService.processTransaction({
                agent_id: id,
                user_id: userId,
                type,
                amount,
                currency: 'USD' // Default, should come from agent's currency
            });

            res.status(201).json(transaction);
        } catch (error: any) {
            console.error('Create transaction error:', error);

            if (error.message === 'Agent not found' || error.message === 'Agent wallet not found') {
                return res.status(404).json({ error: error.message });
            }
            if (error.message === 'Insufficient funds') {
                return res.status(400).json({ error: error.message });
            }

            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async getAgentTransactions(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { limit = '50' } = req.query;

            const transactions = await this.transactionService.getAgentTransactions(
                id,
                parseInt(limit as string)
            );

            res.json(transactions);
        } catch (error) {
            console.error('Get transactions error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}