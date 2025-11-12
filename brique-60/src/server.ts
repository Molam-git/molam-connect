import express from 'express';
import cors from 'cors';
import { register } from 'prom-client';
import subscriptionsRoutes from './routes/subscriptionsRoutes';
import { healthCheck } from './utils/db';

const app = express();
const PORT = parseInt(process.env.PORT || '8060', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', async (_req, res) => {
  const dbHealthy = await healthCheck();
  if (dbHealthy) {
    res.json({ status: 'healthy', service: 'brique-60-recurring-billing' });
  } else {
    res.status(503).json({ status: 'unhealthy', service: 'brique-60-recurring-billing' });
  }
});

// Metrics (Prometheus)
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// API Routes
app.use('/api/subscriptions', subscriptionsRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Brique-60] Recurring Billing & Subscriptions service listening on port ${PORT}`);
});
