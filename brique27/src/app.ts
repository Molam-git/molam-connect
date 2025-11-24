import * as express from 'express';
import { startConsumer } from './orchestrator/consumer';
import { runSmsWorker } from './workers/sms';
import { runPushWorker } from './workers/push';
import { runEmailWorker } from './workers/email';
import { runUssdWorker } from './workers/ussd';
import { runWebhookWorker } from './workers/webhook';
import { apiRouter } from './routes';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', apiRouter);

app.listen(port, () => {
    console.log(`Notifications service running on port ${port}`);

    // Start Kafka consumer
    startConsumer().catch(console.error);

    // Start workers
    runSmsWorker().catch(console.error);
    runPushWorker().catch(console.error);
    runEmailWorker().catch(console.error);
    runUssdWorker().catch(console.error);
    runWebhookWorker().catch(console.error);
});