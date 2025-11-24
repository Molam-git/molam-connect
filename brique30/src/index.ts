import express from 'express';
import { voiceRouter } from './routes/voice';
import { voiceRulesRouter } from './routes/voiceRules';
import { providerWebhookRouter } from './routes/providerWebhook';
import { runVoiceWorker } from './workers/voiceWorker';
import { initKafka } from './lib/kafka';
import { pool } from './db';

export const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Routes
app.use('/api/voice', voiceRouter);
app.use('/api/voice/rules', voiceRulesRouter);
app.use('/webhook', providerWebhookRouter);

// Health check
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'OK', db: 'OK' });
    } catch (err) {
        res.status(500).json({ status: 'ERROR', db: 'ERROR' });
    }
});

app.listen(port, () => {
    console.log(`Voice service running on port ${port}`);
    initKafka().then(() => {
        runVoiceWorker().catch(console.error);
    });
});