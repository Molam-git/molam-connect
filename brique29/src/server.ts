import express from 'express';
import templatesRouter from './routes/templates';
import dotenv from 'dotenv';

export function createServer() {
    const app = express();
    app.use(express.json());
    app.use('/api/templates', templatesRouter);

    app.get('/health', (req, res) => {
        res.json({ status: 'OK', message: 'Notification Templates API is running!' });
    });

    return app;
}

const app = createServer();

// Démarrage du serveur seulement si ce n'est pas un test
if (require.main === module) {
    dotenv.config();
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📧 Notification Templates API ready`);
    });
}

export default app;