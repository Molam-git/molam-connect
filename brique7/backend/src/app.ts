import express from 'express';
import qrStaticRoutes from './routes/qrStatic.routes';
import { authenticate } from './middleware/auth';

// Charger dotenv TRÈS tôt et avec debug
import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';

console.log('🔍 Recherche du fichier .env...');

// Chercher le fichier .env
const envPath = path.resolve(process.cwd(), '.env');
console.log('   Chemin .env:', envPath);
console.log('   Fichier existe:', existsSync(envPath));

// Charger avec debug
const result = dotenv.config({ debug: true });
if (result.error) {
    console.error('❌ Erreur chargement .env:', result.error);
} else {
    console.log('✅ .env chargé avec succès');
    console.log('   Variables chargées:', Object.keys(result.parsed || {}).join(', '));
}

// Afficher toutes les variables DB pour debug
console.log('\n🔧 Vérification variables DB:');
console.log('   DB_USER:', process.env.DB_USER || 'UNDEFINED');
console.log('   DB_HOST:', process.env.DB_HOST || 'UNDEFINED');
console.log('   DB_NAME:', process.env.DB_NAME || 'UNDEFINED');
console.log('   DB_PASSWORD:', process.env.DB_PASSWORD ? '***' + process.env.DB_PASSWORD.slice(-3) : 'UNDEFINED');
console.log('   DB_PORT:', process.env.DB_PORT || 'UNDEFINED');
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@') : 'UNDEFINED');

const app = express();
app.use(express.json());

// Import de la DB après le chargement des variables d'environnement
import { pool, testConnection } from './db/index';

// Route de health check
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as time');
        res.json({
            status: 'OK',
            database: {
                connected: true,
                timestamp: result.rows[0].time
            },
            service: 'Molam Pay QR Static',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            database: {
                connected: false,
                error: (error as Error).message
            },
            service: 'Molam Pay QR Static',
            timestamp: new Date().toISOString()
        });
    }
});

// Routes protégées
app.use('/api/pay/qr/static', authenticate, qrStaticRoutes);

// Route 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        available_routes: ['/health', '/api/pay/qr/static/parse']
    });
});

const PORT = process.env.PORT || 8080;

// Démarrer le serveur
async function startServer() {
    console.log('\n🔄 Test de connexion à la base de données...');

    const dbConnected = await testConnection();

    if (!dbConnected) {
        console.log('\n⚠️  Utilisation de la configuration de repli...');
    }

    app.listen(PORT, () => {
        console.log(`\n🚀 Serveur Molam Pay QR Static démarré sur le port ${PORT}`);
        console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    });
}

startServer().catch(console.error);

export default app;