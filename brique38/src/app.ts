import express from 'express';
import disputesRouter from './routes/disputes';

const app = express();

// Middlewares
app.use(express.json());

// Routes
app.use('/api/disputes', disputesRouter);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

export default app;