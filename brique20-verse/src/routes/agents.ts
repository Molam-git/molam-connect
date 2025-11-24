import { FastifyInstance } from 'fastify';
import { upsertPreference, preview } from '../domain/payout.js';

export default async function agentsRoutes(f: FastifyInstance) {
    f.post('/api/agents/:agentId/payout-preferences', async (req: any, rep) => {
        const { agentId } = req.params;
        const { currency, frequency, min_payout_threshold, auto_withhold } = req.body;
        await upsertPreference(agentId, currency, { frequency, min_payout_threshold, auto_withhold });
        return rep.code(204).send();
    });

    f.get('/api/agents/:agentId/payout-preview', async (req: any, rep) => {
        const { agentId } = req.params;
        const { currency, period } = req.query;
        const [start, end] = String(period).split('/');
        const result = await preview(agentId, currency, start, end);
        return rep.send(result);
    });
}