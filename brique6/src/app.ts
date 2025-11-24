// src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

// Import des routes
import qrPayRoutes from './routes/qrPay';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Routes
app.use('/api/pay/qr', qrPayRoutes);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Gestion des erreurs 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});

// Gestion des erreurs globales
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Erreur:', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Serveur Brique6 démarré sur le port ${PORT}`);
    console.log(`📊 Environnement: ${process.env.NODE_ENV}`);
});

export default app;