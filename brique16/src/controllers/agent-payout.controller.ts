import { Request, Response } from 'express';
import { AgentPayoutService } from '../services/agent-payout.service';
import { validationResult } from 'express-validator';

export class AgentPayoutController {
    constructor(private payoutService: AgentPayoutService) { }

    async schedulePayout(req: Request, res: Response) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const { amount, scheduled_for } = req.body;

            const payout = await this.payoutService.schedulePayout({
                agent_id: id,
                amount,
                currency: 'USD', // Should come from agent's currency
                scheduled_for: new Date(scheduled_for)
            });

            res.status(201).json(payout);
        } catch (error: any) {
            console.error('Schedule payout error:', error);

            if (error.message === 'Agent not found') {
                return res.status(404).json({ error: error.message });
            }
            if (error.message === 'Insufficient commissions') {
                return res.status(400).json({ error: error.message });
            }

            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async processPayout(req: Request, res: Response) {
        try {
            const { payout_id } = req.params;

            const payout = await this.payoutService.processPayout(payout_id);

            res.json(payout);
        } catch (error: any) {
            console.error('Process payout error:', error);

            if (error.message === 'Payout not found') {
                return res.status(404).json({ error: error.message });
            }

            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async getAgentPayouts(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { limit = '50', status } = req.query;

            const payouts = await this.payoutService.getAgentPayouts(
                id,
                status as string,
                parseInt(limit as string)
            );

            res.json(payouts);
        } catch (error) {
            console.error('Get payouts error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async getPendingPayouts(req: Request, res: Response) {
        try {
            const payouts = await this.payoutService.getPendingPayouts();

            res.json(payouts);
        } catch (error) {
            console.error('Get pending payouts error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}