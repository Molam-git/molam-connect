// index.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Routes
import transactionRoutes from './routes/transactions';

// Chargement des variables d'environnement
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de sécurité
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    credentials: true
}));

// Compression
app.use(compression());

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limite par IP
    message: {
        error: 'Trop de requêtes, veuillez réessayer plus tard.',
        code: 'RATE_LIMIT_EXCEEDED'
    }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use(transactionRoutes);

// Route de santé
app.get('/health', (_req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Molam Pay API',
        version: '1.0.0'
    });
});

// Route 404
app.use('*', (_req, res) => {
    res.status(404).json({
        error: 'Route non trouvée',
        code: 'ROUTE_NOT_FOUND'
    });
});

// Middleware de gestion d'erreurs
app.use((error: any, _req: express.Request, res: express.Response) => {
    console.error('Erreur non gérée:', error);

    if (error.type === 'entity.parse.failed') {
        res.status(400).json({
            error: 'JSON mal formé',
            code: 'INVALID_JSON'
        });
        return;
    }

    res.status(500).json({
        error: 'Erreur interne du serveur',
        code: 'INTERNAL_SERVER_ERROR'
    });
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`🚀 Molam Pay API démarrée sur le port ${PORT}`);
    console.log(`📊 Environnement: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

export default app;