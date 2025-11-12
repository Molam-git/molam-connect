/**
 * Main Server - Account Capabilities & Limits Service
 * Brique 72 - Account Capabilities & Limits
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { register } from 'prom-client';
import limitsRouter from './routes/limits';
import capabilitiesRouter from './routes/capabilities';
import siraRouter from './routes/sira';
import { healthCheck } from './db';
import { redisHealthCheck } from './redis';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3072', 10);
const METRICS_PORT = parseInt(process.env.METRICS_PORT || '9072', 10);

// ========================================
// Middleware
// ========================================

app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ========================================
// Routes
// ========================================

app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Brique 72 - Account Capabilities & Limits',
    version: '1.0.0',
    status: 'running',
    features: [
      'Fast enforcement (<5ms cached)',
      'Dynamic capabilities',
      'Multi-tier limits',
      'SIRA ML recommendations',
      'Real-time usage tracking',
      'Audit trail',
    ],
  });
});

app.get('/health', async (req: Request, res: Response) => {
  try {
    const dbHealthy = await healthCheck();
    const redisHealthy = await redisHealthCheck();

    const healthy = dbHealthy && redisHealthy;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealthy ? 'ok' : 'error',
        redis: redisHealthy ? 'ok' : 'error',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
    });
  }
});

// Mount API routes
app.use('/api/limits', limitsRouter);
app.use('/api/capabilities', capabilitiesRouter);
app.use('/api/sira', siraRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Unhandled error', { error: err, path: req.path });
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ========================================
// Metrics Server (Prometheus)
// ========================================

const metricsApp = express();

metricsApp.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    console.error('Metrics error', error);
    res.status(500).end();
  }
});

metricsApp.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ========================================
// Start Servers
// ========================================

async function startServer() {
  try {
    // Verify database connection
    const dbHealthy = await healthCheck();
    if (!dbHealthy) {
      throw new Error('Database health check failed');
    }
    console.log('✓ Database connection verified');

    // Verify Redis connection
    const redisHealthy = await redisHealthCheck();
    if (!redisHealthy) {
      throw new Error('Redis health check failed');
    }
    console.log('✓ Redis connection verified');

    // Start main server
    app.listen(PORT, () => {
      console.log(`✓ API server listening on port ${PORT}`);
      console.log(`  http://localhost:${PORT}`);
    });

    // Start metrics server
    metricsApp.listen(METRICS_PORT, () => {
      console.log(`✓ Metrics server listening on port ${METRICS_PORT}`);
      console.log(`  http://localhost:${METRICS_PORT}/metrics`);
    });

    console.log('\n🚀 Brique 72 - Limits Service is ready!\n');
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

// Start
startServer();
