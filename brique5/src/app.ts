import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import transferRoutes from './routes/transfers';
import { db } from './utils/db';

// Charger les variables d'environnement
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de sécurité
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes - respectant strictement le document
app.use('/api/pay', transferRoutes);

// Route de santé
app.get('/health', async (req, res) => {
    const healthCheck: any = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Molam P2P Transfer API',
        database: 'Unknown',
        tables: {}
    };

    try {
        // Test de connexion DB
        await db.one('SELECT 1 as test');
        healthCheck.database = 'Connected';

        // Vérifier les tables principales
        const transfersTable = await db.oneOrNone(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'molam_transfers'
      ) as exists
    `);

        const eventsTable = await db.oneOrNone(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'molam_transfer_events'
      ) as exists
    `);

        healthCheck.tables = {
            molam_transfers: transfersTable?.exists || false,
            molam_transfer_events: eventsTable?.exists || false
        };

        res.status(200).json(healthCheck);
    } catch (error: any) {
        healthCheck.status = 'ERROR';
        healthCheck.database = 'Disconnected';
        healthCheck.error = error.message;
        res.status(500).json(healthCheck);
    }
});

// Gestion des routes non trouvées
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl
    });
});

// Gestionnaire d'erreurs global
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', error);
    res.status(error.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
});

// Démarrer le serveur
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Molam P2P Transfer API running on port ${PORT}`);
        console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
}

export default app;