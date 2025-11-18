/**
 * Brique 95 - Auto-switch Routing Service
 * Main server entry point
 */

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { routingRouter } from './routes/routing';
import { adminRouter } from './routes/admin';
import { pool, checkDatabaseHealth, getDatabaseStats } from './db';
import { redis, getCacheStats } from './lib/cache';
import { checkSiraHealth } from './lib/siraClient';
// OLD metrics system - keeping for compatibility
import { initMetrics, metricsMiddleware } from './utils/metrics';
// NEW observability stack
import { startTracing, shutdownTracing, traceMiddleware } from './telemetry/otel';
import { metricsHandler, httpMetricsMiddleware } from './telemetry/prom';
import { requestLoggingMiddleware, logger } from './telemetry/logger';

// Load environment variables
dotenv.config();

// Initialize OpenTelemetry tracing before any other imports
startTracing().catch((err) => {
  console.error('Failed to start tracing:', err);
});

const app = express();
const PORT = process.env.PORT || 8082;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security middleware
app.use(helmet());

// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN?.split(',') || [
  'http://localhost:3000',
  'http://localhost:3001'
];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Observability middleware (NEW)
app.use(traceMiddleware()); // OpenTelemetry distributed tracing
app.use(httpMetricsMiddleware()); // Prometheus HTTP metrics
app.use(requestLoggingMiddleware()); // Structured JSON logging

// OLD metrics middleware (keeping for backward compatibility)
app.use(metricsMiddleware());

// =====================================================
// Health & Status Endpoints
// =====================================================

/**
 * GET /health
 * Basic health check
 */
app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  const cacheHealthy = redis.status === 'ready';

  const status = {
    status: dbHealthy && cacheHealthy ? 'healthy' : 'degraded',
    version: '1.0.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealthy ? 'healthy' : 'unhealthy',
      cache: cacheHealthy ? 'healthy' : 'unhealthy',
      sira: await checkSiraHealth() ? 'healthy' : 'degraded'
    }
  };

  const httpStatus = status.status === 'healthy' ? 200 : 503;
  res.status(httpStatus).json(status);
});

/**
 * GET /healthz
 * Kubernetes-style health check
 */
app.get('/healthz', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  if (dbHealthy) {
    res.status(200).send('OK');
  } else {
    res.status(503).send('Service Unavailable');
  }
});

/**
 * GET /readyz
 * Readiness check
 */
app.get('/readyz', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  const cacheHealthy = redis.status === 'ready';

  if (dbHealthy && cacheHealthy) {
    res.status(200).send('Ready');
  } else {
    res.status(503).send('Not Ready');
  }
});

/**
 * GET /status
 * Detailed status information
 */
app.get('/status', async (req: Request, res: Response) => {
  try {
    const [dbStats, cacheStats, siraHealthy] = await Promise.all([
      getDatabaseStats(),
      getCacheStats(),
      checkSiraHealth()
    ]);

    res.json({
      service: 'routing-service',
      version: '1.0.0',
      environment: NODE_ENV,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      database: {
        connected: await checkDatabaseHealth(),
        stats: dbStats
      },
      cache: {
        connected: redis.status === 'ready',
        stats: cacheStats
      },
      sira: {
        available: siraHealthy
      }
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'status_error',
      message: error.message
    });
  }
});

// =====================================================
// API Routes
// =====================================================

app.use('/v1/routing', routingRouter);
app.use('/v1/admin', adminRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Molam Routing Service',
    version: '1.0.0',
    description: 'Auto-switch routing decision service',
    documentation: 'https://docs.molam.com/routing',
    endpoints: {
      health: '/health',
      metrics: '/metrics',
      routing: '/v1/routing',
      admin: '/v1/admin'
    }
  });
});

// =====================================================
// Error Handling
// =====================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

  res.status(500).json({
    error: 'internal_server_error',
    message: NODE_ENV === 'development' ? err.message : 'An error occurred',
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// =====================================================
// Initialize Metrics
// =====================================================

// NEW Prometheus metrics endpoint
metricsHandler(app);

// OLD metrics endpoint (keeping for backward compatibility)
initMetrics(app);

// =====================================================
// Start Server
// =====================================================

async function startServer() {
  try {
    // Test database connection
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }

    // Test Redis connection
    if (redis.status !== 'ready') {
      console.warn('⚠️  Redis connection not ready');
    }

    // Start listening
    app.listen(PORT, () => {
      console.log('\n🚀 Molam Routing Service');
      console.log(`📍 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${NODE_ENV}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`📈 Metrics: http://localhost:${PORT}/metrics`);
      console.log(`📚 API: http://localhost:${PORT}/v1/routing`);
      console.log(`⚙️  Admin: http://localhost:${PORT}/v1/admin`);
      console.log('\n✅ Database connected');
      console.log(redis.status === 'ready' ? '✅ Redis connected' : '⚠️  Redis not connected');
      console.log('\n💡 Ready to handle routing decisions\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// =====================================================
// Graceful Shutdown
// =====================================================

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');

  try {
    // Shutdown OpenTelemetry tracing
    await shutdownTracing();
    logger.info('OpenTelemetry tracing shutdown complete');

    // Close database connections
    await pool.end();
    logger.info('Database connections closed');

    // Close Redis connection
    await redis.quit();
    logger.info('Redis connection closed');

    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error as Error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');

  try {
    await shutdownTracing();
    await pool.end();
    await redis.quit();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error as Error);
    process.exit(1);
  }
});

// Start the server
startServer();

export default app;
