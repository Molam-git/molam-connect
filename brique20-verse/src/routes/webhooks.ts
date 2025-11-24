import { FastifyInstance } from 'fastify';
import { verifyHmacSignature } from '../security/hmac.js';
import { reconcileProviderWebhook } from '../domain/payout.js';
import { config } from '../config.js';

export default async function webhookRoutes(f: FastifyInstance) {
    f.post('/api/webhooks/payouts/provider', async (req: any, rep) => {
        const signature = req.headers['x-molam-signature'];
        const raw = JSON.stringify(req.body);
        if (!signature || !verifyHmacSignature(raw, String(signature), config.security.webhookSecret)) {
            return rep.code(401).send({ error: 'INVALID_SIGNATURE' });
        }
        await reconcileProviderWebhook(req.body);
        return rep.code(200).send({ ok: true });
    });
}