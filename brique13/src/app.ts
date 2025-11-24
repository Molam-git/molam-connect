import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import historyRoutes from './history/routes';

const app = express();

// Middleware de sécurité
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'molam-pay-history-api',
        timestamp: new Date().toISOString()
    });
});

// Routes de l'historique
app.use('/api/pay/history', historyRoutes);

// Gestion des erreurs 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'not_found' });
});

// Middleware de gestion d'erreurs
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'internal_server_error' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Molam Pay History API running on port ${PORT}`);
});

export default app;