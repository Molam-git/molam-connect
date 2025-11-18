// Express server for Brique 86 - Statement Reconciliation
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { register as metricsRegister } from './utils/metrics';
import reconciliationRoutes from './routes/reconciliation';

const app = express();
const PORT = process.env.PORT || 3086;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'brique-86-reconciliation' });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metricsRegister.contentType);
  res.end(await metricsRegister.metrics());
});

// API routes
app.use('/api/reco', reconciliationRoutes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Brique 86 - Reconciliation API listening on port ${PORT}`);
    console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
  });
}

export default app;
