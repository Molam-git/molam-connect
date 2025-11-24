import express from 'express';
import { cashinController } from '../controllers/cashinController';
import { authUserJWT, authAgentJWT } from '../middleware/auth';
import { cashinValidation } from '../middleware/validation';

export const cashinRouter = express.Router();

/**
 * @route POST /api/agents/:agentId/cashin
 * @description User deposits money at agent
 * @access Protected (User JWT + Agent JWT)
 */
cashinRouter.post(
    '/api/agents/:agentId/cashin',
    authUserJWT,
    authAgentJWT,
    cashinValidation,
    cashinController.processCashin
);

/**
 * @route GET /api/transactions/cashin/:transactionId
 * @description Get cash-in transaction status
 * @access Protected
 */
cashinRouter.get(
    '/api/transactions/cashin/:transactionId',
    authUserJWT,
    cashinController.getTransactionStatus
);

export default cashinRouter;