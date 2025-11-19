/**
 * Molam Ma Wallet API Server
 * Express application with JWT auth, metrics, health checks
 */
import express from 'express';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import cors from 'cors';
import walletRouter from './routes/wallet';
import { initPublisher } from './utils/ledgerPublisher';
import { healthCheck } from './utils/db';

const app = express();

// Security headers
app.use(helmet());

// CORS - Allow requests from Molam frontends
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:19006'],
  credentials: true
}));

// Body parser with size limits
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check endpoint (for K8s liveness/readiness probes)
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

// Readiness probe (checks all dependencies)
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

// Metrics endpoint for Prometheus (basic)
app.get('/metrics', (_req, res) => {
  // In production, use prom-client library
  res.set('Content-Type', 'text/plain');
  res.send('# Wallet API Metrics\n# TODO: Implement with prom-client\n');
});

// Mount wallet routes
app.use('/api/wallet', walletRouter);

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

// Initialize RabbitMQ publisher
const initializeServices = async () => {
  try {
    await initPublisher();
    console.log('✓ Ledger publisher initialized');
  } catch (error) {
    console.error('Failed to initialize ledger publisher:', error);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

// Start server
const port = parseInt(process.env.PORT || '8080', 10);

const startServer = async () => {
  await initializeServices();

  app.listen(port, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Molam Ma Wallet API');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Port:        ${port}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Health:      http://localhost:${port}/healthz`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
