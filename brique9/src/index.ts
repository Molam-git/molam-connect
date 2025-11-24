import Fastify from 'fastify';
import { billsRouter } from './routes/bills';
import { verifyJWT } from './security/jwt';
import rateLimit from '@fastify/rate-limit';
const app = Fastify({
    logger: {
        level: 'info',
        transport: {
            target: 'pino-pretty'
        }
    }
});

app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    skipOnError: false
});

// global auth for all /v1 except webhooks
app.addHook('onRequest', async (req: any, reply: any) => {
    if (req.routerPath?.startsWith('/v1/webhooks')) return;
    await verifyJWT(req, reply);
});

app.register(billsRouter, { prefix: '/v1' });

// Health checks
app.get('/healthz', async () => ({ status: 'OK', timestamp: new Date().toISOString() }));
app.get('/livez', async () => ({ status: 'OK' }));

const port = Number(process.env.PORT || 8080);
app.listen({ port, host: '0.0.0.0' }).catch((e) => {
    app.log.error(e);
    process.exit(1);
});

export { app };