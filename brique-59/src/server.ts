import express from 'express';
import cors from 'cors';
import { register } from 'prom-client';
import siraRoutes from './routes/siraRoutes';
import { healthCheck } from './utils/db';

const app = express();
const PORT = parseInt(process.env.PORT || '8059', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', async (_req, res) => {
  const dbHealthy = await healthCheck();
  if (dbHealthy) {
    res.json({ status: 'healthy', service: 'sira-analytics' });
  } else {
    res.status(503).json({ status: 'unhealthy', service: 'sira-analytics' });
  }
});

// Metrics
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Routes
app.use('/api/sira', siraRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Brique-59] SIRA Analytics & Auto-Resolution Service listening on port ${PORT}`);
});
