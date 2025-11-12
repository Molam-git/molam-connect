import express from 'express';
import cors from 'cors';
import analyticsRoutes from './routes/analyticsRoutes';
import siraPredictionsRoutes from './routes/siraPredictionsRoutes';
import { healthCheck } from './utils/db';

const app = express();
const PORT = parseInt(process.env.PORT || '8061', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', async (_req, res) => {
  try {
    const dbHealthy = await healthCheck();
    res.json({
      status: dbHealthy ? 'healthy' : 'unhealthy',
      service: 'brique-61-subscription-analytics-ml',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'brique-61-subscription-analytics-ml',
      timestamp: new Date().toISOString(),
    });
  }
});

// Metrics endpoint
app.get('/metrics', (_req, res) => {
  res.json({
    service: 'brique-61-subscription-analytics-ml',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/analytics', analyticsRoutes);
app.use('/api/sira', siraPredictionsRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Brique 61] Subscription Analytics & Churn Prevention running on http://localhost:${PORT}`);
  console.log(`[Brique 61] Health: http://localhost:${PORT}/health`);
  console.log(`[Brique 61] Metrics: http://localhost:${PORT}/metrics`);
});

export default app;
