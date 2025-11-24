// src/index.ts
import express from 'express';
import { Pool } from 'pg';
import { createServer } from 'http';
import { config } from 'dotenv';

// Chargement des variables d'environnement
config();

// Configuration de la base de données
const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

const app = express();
const port = process.env.PORT || 3000;

// Middlewares de base
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes de santé
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'molam-pay-commission-agent'
    });
});

// Routes des commissions
import * as commissionRoutes from './agents/commission.service';

app.get('/api/agents/commissions/summary', commissionRoutes.getBalances);
app.post('/api/agents/commissions/statements', commissionRoutes.createStatement);
app.get('/api/agents/commissions/statements/:statementId', commissionRoutes.getStatement);
app.post('/api/agents/commissions/statements/:statementId/adjustments', commissionRoutes.addAdjustment);
app.post('/api/agents/commissions/statements/:statementId/lock', commissionRoutes.lockStatement);

// Gestion des erreurs
app.use((err: any, req: any, res: any, next: any) => {
    console.error('Erreur non gérée:', err);
    res.status(500).json({
        error: 'Erreur interne du serveur',
        ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
});

// Route 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});

const server = createServer(app);

server.listen(port, () => {
    console.log(`🚀 Service Commission Agent démarré sur le port ${port}`);
    console.log(`📊 Environnement: ${process.env.NODE_ENV}`);
    console.log(`🔍 Health check: http://localhost:${port}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Réception SIGTERM, arrêt gracieux...');
    server.close();
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 Réception SIGINT, arrêt gracieux...');
    server.close();
    await pool.end();
    process.exit(0);
});

export { app, pool };