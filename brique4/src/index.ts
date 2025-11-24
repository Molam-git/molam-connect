// src/index.ts
import express from 'express';
import withdrawalsRouter from './routes/withdrawals';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use(withdrawalsRouter);

// Health check amélioré
app.get('/health', async (req, res) => {
    try {
        // Vérifier la connexion DB
        await require('./util/db').db.one('SELECT 1 as health_check');
        res.json({
            status: 'OK',
            service: 'molam-pay-withdrawals',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error: unknown) {
        // Gestion correcte du type unknown
        let errorMessage = 'Unknown error';
        if (error instanceof Error) {
            errorMessage = error.message;
        }

        res.status(500).json({
            status: 'ERROR',
            service: 'molam-pay-withdrawals',
            database: 'disconnected',
            error: errorMessage
        });
    }
});

// Route 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', error);

    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
        errorMessage = error.message;
    }

    res.status(500).json({
        error: errorMessage,
        timestamp: new Date().toISOString()
    });
});

app.listen(port, () => {
    console.log(`🚀 Molam Pay Withdrawals API running on port ${port}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    console.log(`🗄️  Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
});