import express from 'express';
import registerBankRoutes from './http/banks.routes';


const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Register bank routes
registerBankRoutes(app);

// Error handling middleware
app.use((err: any, _req: any, res: any) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (_req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
    console.log(`Brique 22 - API Banques partenaires running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});

export default app;