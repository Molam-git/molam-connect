/**
 * Brique 69 - Analytics Dashboard API Server
 * Real-time analytics API with RBAC, caching, and observability
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import { authenticate } from './middleware/auth';
import analyticsRoutes from './routes/analytics';
import alertsRoutes from './routes/alerts';
import reportsRoutes from './routes/reports';
import customViewsRoutes from './routes/customViews';
import { metricsRegistry } from './utils/metrics';
import { getPool, closePool } from './services/db';
import { getRedisClient, closeRedis } from './services/redis';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8082;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.get('/health', async (req, res) => {
  try {
    // Check database
    const pool = getPool();
    await pool.query('SELECT 1');

    // Check Redis
    const redis = getRedisClient();
    await redis.ping();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        redis: 'up',
      },
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Service degraded',
    });
  }
});

// Metrics endpoint (Prometheus)
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    const metrics = await metricsRegistry.metrics();
    res.send(metrics);
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

// API Routes (protected by authentication)
app.use('/api/analytics', authenticate, analyticsRoutes);
app.use('/api/analytics/alerts', authenticate, alertsRoutes);
app.use('/api/analytics/reports', authenticate, reportsRoutes);
app.use('/api/analytics/views', authenticate, customViewsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
async function start() {
  try {
    // Initialize connections
    getPool();
    getRedisClient();

    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🚀 Molam Analytics Dashboard API (Brique 69)            ║
║  --------------------------------------------------------  ║
║  Port:        ${PORT}                                        ║
║  Environment: ${process.env.NODE_ENV || 'development'}                            ║
║  Health:      http://localhost:${PORT}/health                 ║
║  Metrics:     http://localhost:${PORT}/metrics                ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down gracefully...');
  await closePool();
  await closeRedis();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start if run directly
if (require.main === module) {
  start();
}

export default app;
