import { Request, Response } from 'express';
import { AgentService } from '../services/agent.service';
import { validationResult } from 'express-validator';

export class AgentController {
    constructor(private agentService: AgentService) { }

    async onboardAgent(req: Request, res: Response) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { userId, countryCode, currency = 'USD' } = req.body;

            const agent = await this.agentService.onboardAgent({
                user_id: userId,
                country_code: countryCode,
                currency,
                status: 'PENDING',
                kyc_level: 'UNVERIFIED',
                commission_rate: 1.00,
                payout_cycle: 'WEEKLY'
            });

            res.status(201).json(agent);
        } catch (error) {
            console.error('Onboard agent error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async approveAgent(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const agent = await this.agentService.approveAgent(id);

            if (!agent) {
                return res.status(404).json({ error: 'Agent not found' });
            }

            res.json(agent);
        } catch (error) {
            console.error('Approve agent error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async getAgentDetails(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const agent = await this.agentService.getAgentDetails(id);

            if (!agent) {
                return res.status(404).json({ error: 'Agent not found' });
            }

            res.json(agent);
        } catch (error) {
            console.error('Get agent details error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async addLocation(req: Request, res: Response) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const locationData = req.body;

            const location = await this.agentService.addLocation(id, locationData);

            res.status(201).json(location);
        } catch (error) {
            console.error('Add location error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}