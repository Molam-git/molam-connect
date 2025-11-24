import Fastify from 'fastify';
import agentsRoutes from './routes/agents.js';
import cyclesRoutes from './routes/cycles.js';
import webhookRoutes from './routes/webhooks.js';
import rateLimit from '@fastify/rate-limit';

export function buildApp() {
    const app = Fastify({ trustProxy: true, logger: true });
    app.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute'
    });

    app.register(agentsRoutes);
    app.register(cyclesRoutes);
    app.register(webhookRoutes);
    return app;
}