import { buildApp } from './app.js';

const app = buildApp();
const port = Number(process.env.PORT || 8080);

app.listen({ port, host: '0.0.0.0' })
    .then(() => app.log.info(`agent-payouts up on :${port}`))
    .catch((e) => { app.log.error(e); process.exit(1); });