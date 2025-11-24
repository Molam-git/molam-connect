import { Router } from 'express';
import { AgentTransactionController } from '../controllers/agent-transaction.controller';
import { AgentTransactionService } from '../services/agent-transaction.service';
import { authUserJWT } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { Pool } from 'pg';

export function createAgentTransactionRoutes(db: Pool): Router {
    const router = Router();
    const transactionService = new AgentTransactionService(db);
    const transactionController = new AgentTransactionController(transactionService);

    // Create transaction (cash-in/cash-out)
    router.post('/:id/transactions',
        authUserJWT,
        [
            body('type').isIn(['CASHIN', 'CASHOUT']),
            body('amount').isFloat({ gt: 0 }),
            body('userId').isUUID()
        ],
        transactionController.createTransaction.bind(transactionController)
    );

    // Get agent transactions
    router.get('/:id/transactions',
        authUserJWT,
        transactionController.getAgentTransactions.bind(transactionController)
    );

    return router;
}