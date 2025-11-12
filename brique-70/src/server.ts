import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { pool } from './db/pool';

// Routes
import campaignsRoutes from './routes/campaigns';
import promoCodesRoutes from './routes/promoCodes';
import subscriptionPlansRoutes from './routes/subscriptionPlans';
import subscriptionsRoutes from './routes/subscriptions';
import fraudRoutes from './routes/fraud';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      service: 'brique-70-marketing',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'brique-70-marketing',
      error: 'Database connection failed',
    });
  }
});

// API Routes
app.use('/api/marketing/campaigns', campaignsRoutes);
app.use('/api/marketing/promo-codes', promoCodesRoutes);
app.use('/api/marketing/subscription-plans', subscriptionPlansRoutes);
app.use('/api/marketing/subscriptions', subscriptionsRoutes);
app.use('/api/marketing/fraud', fraudRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(config.server.nodeEnv === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const server = app.listen(config.server.port, () => {
  console.log(`[Brique-70-Marketing] Server running on port ${config.server.port}`);
  console.log(`[Brique-70-Marketing] Environment: ${config.server.nodeEnv}`);
  console.log(`[Brique-70-Marketing] SIRA Integration: ${config.sira.enabled ? 'enabled' : 'disabled'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Brique-70-Marketing] SIGTERM received, closing server...');
  server.close(() => {
    console.log('[Brique-70-Marketing] Server closed');
    pool.end().then(() => {
      console.log('[Brique-70-Marketing] Database pool closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('[Brique-70-Marketing] SIGINT received, closing server...');
  server.close(() => {
    console.log('[Brique-70-Marketing] Server closed');
    pool.end().then(() => {
      console.log('[Brique-70-Marketing] Database pool closed');
      process.exit(0);
    });
  });
});

export default app;
