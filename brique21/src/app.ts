import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import agentRoutes from './routes/agents.js';
import internalRoutes from './routes/internal.js';

export function buildApp() {
    const app = Fastify({ trustProxy: true, logger: true });
    app.register(rateLimit, { max: 200, timeWindow: '1 minute' });
    app.register(agentRoutes);
    app.register(internalRoutes);
    return app;
}