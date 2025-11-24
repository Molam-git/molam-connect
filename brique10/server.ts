// src/server.ts
import * as express from 'express';
import operatorsRoutes from './src/routes/operators';
import productsRoutes from './src/routes/products';
import topupRoutes from './src/routes/topup';
import webhookRoutes from './src/routes/webhook';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Routes
app.use('/api/pay/topup', operatorsRoutes);
app.use('/api/pay/topup', productsRoutes);
app.use('/api/pay/topup', topupRoutes);
app.use('/api/pay/topup', webhookRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Molam Pay Top-up API',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Top-up API running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
});

export { app };