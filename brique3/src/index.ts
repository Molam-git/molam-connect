import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { testConnection, runSQLFile } from './config/database';
import topupsRouter from './routes/topups';

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Routes
app.use(topupsRouter);

// Health check étendu
app.get('/health', async (req, res) => {
    try {
        const dbHealthy = await testConnection();
        const status = dbHealthy ? 'healthy' : 'unhealthy';

        res.status(dbHealthy ? 200 : 503).json({
            status,
            service: 'molam-pay-brique-3',
            database: dbHealthy ? 'connected' : 'disconnected',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Info endpoint
app.get('/info', (req, res) => {
    res.json({
        name: 'Molam Pay - Brique 3',
        version: '1.0.0',
        description: 'API Recharge wallet multi-moyens',
        endpoints: {
            topups: '/api/pay/topups',
            health: '/health'
        }
    });
});

// Démarrage du serveur
async function startServer() {
    try {
        console.log('🔧 Starting Molam Pay Brique 3...');

        // Test de connexion à la base de données
        const dbConnected = await testConnection();
        if (!dbConnected) {
            console.error('❌ Cannot start server without database connection');
            process.exit(1);
        }

        app.listen(PORT, () => {
            console.log(`
🎉 Molam Pay Brique 3 started successfully!

📍 Server running on: http://localhost:${PORT}
📊 Health check: http://localhost:${PORT}/health
ℹ️  Info: http://localhost:${PORT}/info
💳 Topups API: http://localhost:${PORT}/api/pay/topups

📋 Available commands:
   make dev       - Start development server
   make test      - Run tests
   make db-up     - Start database
   make db-init   - Initialize database
      `);
        });
    } catch (error) {
        console.error('💥 Failed to start server:', error);
        process.exit(1);
    }
}

startServer();