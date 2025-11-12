/**
 * Main Server - Developer Console & API Management
 * Brique 73 - Webhooks & Developer Tools
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { register } from 'prom-client';
import { healthCheck } from './db';
import { redisHealthCheck } from './redis';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3073', 10);
const METRICS_PORT = parseInt(process.env.METRICS_PORT || '9073', 10);

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
    service: 'Brique 73 - Developer Console & API Management',
    version: '1.0.0',
    status: 'running',
    features: [
      'API Key Management',
      'Rate Limiting & Quotas',
      'Webhook Management',
      'Developer Playground',
      'Sandbox Environment',
      'Usage Analytics',
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

// Mount API routes (to be implemented)
// app.use('/api/apps', appsRouter);
// app.use('/api/keys', keysRouter);
// app.use('/api/playground', playgroundRouter);
// app.use('/api/webhooks', webhooksRouter);

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
    const dbHealthy = await healthCheck();
    if (!dbHealthy) {
      throw new Error('Database health check failed');
    }
    console.log('✓ Database connection verified');

    const redisHealthy = await redisHealthCheck();
    if (!redisHealthy) {
      throw new Error('Redis health check failed');
    }
    console.log('✓ Redis connection verified');

    app.listen(PORT, () => {
      console.log(`✓ API server listening on port ${PORT}`);
      console.log(`  http://localhost:${PORT}`);
    });

    metricsApp.listen(METRICS_PORT, () => {
      console.log(`✓ Metrics server listening on port ${METRICS_PORT}`);
      console.log(`  http://localhost:${METRICS_PORT}/metrics`);
    });

    console.log('\n🚀 Brique 73 - Developer Console is ready!\n');
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
