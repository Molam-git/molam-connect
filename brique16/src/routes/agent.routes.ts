import { Router } from 'express';
import { AgentController } from '../controllers/agent.controller';
import { AgentService } from '../services/agent.service';
import { authServiceMTLS, authUserJWT } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { Pool } from 'pg';

export function createAgentRoutes(db: Pool): Router {
    const router = Router();
    const agentService = new AgentService(db);
    const agentController = new AgentController(agentService);

    // Onboard new agent (admin only)
    router.post('/onboard',
        authServiceMTLS,
        [
            body('userId').isUUID(),
            body('countryCode').isString().isLength({ min: 2, max: 2 }),
            body('currency').optional().isString().isLength({ min: 3, max: 3 })
        ],
        agentController.onboardAgent.bind(agentController)
    );

    // Approve agent after KYC (admin only)
    router.put('/:id/approve',
        authServiceMTLS,
        agentController.approveAgent.bind(agentController)
    );

    // Get agent details
    router.get('/:id',
        authUserJWT,
        agentController.getAgentDetails.bind(agentController)
    );

    // Add location to agent
    router.post('/:id/locations',
        authUserJWT,
        [
            body('name').isString().notEmpty(),
            body('address').isString().notEmpty(),
            body('city').isString().notEmpty(),
            body('latitude').optional().isNumeric(),
            body('longitude').optional().isNumeric(),
            body('open_hours').optional().isObject(),
            body('services').isArray()
        ],
        agentController.addLocation.bind(agentController)
    );

    return router;
}