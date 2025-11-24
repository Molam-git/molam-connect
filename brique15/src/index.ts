import express from 'express';
import { runConsumer } from './services/notify-consumer';
import { runWorkerLoop } from './services/worker-queue';
import preferencesRouter from './api/preferences';
import { router as internalTestRouter } from './api/internal-test';
import { metricsApp } from './observability/metrics';

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());
app.use(preferencesRouter);
app.use(internalTestRouter);

app.listen(port, () => {
    console.log(`Notification service running on port ${port}`);
    runConsumer().catch(console.error);
    runWorkerLoop().catch(console.error);
});

metricsApp.listen(9090, () => {
    console.log('Metrics server running on port 9090');
});