import express from 'express';
import { Pool } from 'pg';
import { createAgentRoutes } from './routes/agent.routes';
import { createAgentTransactionRoutes } from './routes/agent-transaction.routes';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/agents', createAgentRoutes(db));
app.use('/api/agents', createAgentTransactionRoutes(db));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    logger.info(`Molam Agents API running on port ${PORT}`);
});

export default app;