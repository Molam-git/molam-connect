/**
 * Molam Connect - Merchant Dashboard API Server
 * Express application with analytics endpoints
 */
import express from 'express';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import cors from 'cors';
import dashboardRouter from './routes/dashboard';
import eventsRouter from './routes/events';
import { healthCheck } from './utils/db';

const app = express();

// Security headers
app.use(helmet());

// CORS - Allow requests from merchant dashboard
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Body parser with size limits
app.use(bodyParser.json({ limit: '10mb' })); // Larger limit for batch events
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check endpoint
app.get('/healthz', async (_req, res) => {
  const dbHealthy = await healthCheck();

  if (!dbHealthy) {
    return res.status(503).json({
      ok: false,
      database: 'unhealthy'
    });
  }

  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    database: 'healthy'
  });
});

// Readiness probe
app.get('/readyz', async (_req, res) => {
  const dbHealthy = await healthCheck();

  if (!dbHealthy) {
    return res.status(503).json({
      ready: false,
      database: 'not_ready'
    });
  }

  res.json({
    ready: true,
    timestamp: new Date().toISOString()
  });
});

// Metrics endpoint for Prometheus
app.get('/metrics', (_req, res) => {
  // In production, use prom-client library
  res.set('Content-Type', 'text/plain');
  res.send('# Molam Connect Metrics\n# TODO: Implement with prom-client\n');
});

// Mount API routes
app.use('/api/dashboard', dashboardRouter);
app.use('/api/events', eventsRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Endpoint not found'
  });
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    error: 'internal_error',
    message: process.env.NODE_ENV === 'production'
      ? 'An error occurred'
      : err.message
  });
});

// Start server
const port = parseInt(process.env.PORT || '8080', 10);

app.listen(port, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Molam Connect - Merchant Dashboard API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Port:        ${port}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Health:      http://localhost:${port}/healthz`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

export default app;
