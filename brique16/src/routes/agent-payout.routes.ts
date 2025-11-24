import { Router } from 'express';
import { AgentPayoutController } from '../controllers/agent-payout.controller';
import { AgentPayoutService } from '../services/agent-payout.service';
import { authServiceMTLS, authUserJWT } from '../middleware/auth.middleware';
import { body, param } from 'express-validator';
import { Pool } from 'pg';

export function createAgentPayoutRoutes(db: Pool): Router {
    const router = Router();
    const payoutService = new AgentPayoutService(db);
    const payoutController = new AgentPayoutController(payoutService);

    // Schedule payout (admin only)
    router.post('/:id/payouts',
        authServiceMTLS,
        [
            body('amount').isFloat({ gt: 0 }),
            body('scheduled_for').isISO8601()
        ],
        payoutController.schedulePayout.bind(payoutController)
    );

    // Process payout (admin only)
    router.post('/payouts/:payout_id/process',
        authServiceMTLS,
        [
            param('payout_id').isUUID()
        ],
        payoutController.processPayout.bind(payoutController)
    );

    // Get agent payouts
    router.get('/:id/payouts',
        authUserJWT,
        payoutController.getAgentPayouts.bind(payoutController)
    );

    // Get all pending payouts (admin only)
    router.get('/payouts/pending',
        authServiceMTLS,
        payoutController.getPendingPayouts.bind(payoutController)
    );

    return router;
}