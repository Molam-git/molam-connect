/**
 * Brique 113: SIRA Inference Service
 * Low-latency ML inference with canary routing
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import { pool } from './db';
import { logger } from './utils/logger';
import { initPrometheus } from './utils/metrics';
import { authMiddleware } from './utils/auth';
import { inferRouter } from './routes/infer';
import { createModelManager } from './inference/loader';

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ============================================================================
// Middleware
// ============================================================================

// Security headers
app.use(helmet());

// Body parsing
app.use(bodyParser.json({ limit: '200kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '200kb' }));

// Request logging middleware
app.use((req, _res, next) => {
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Authentication (skips health/metrics endpoints)
app.use(authMiddleware);

// ============================================================================
// Prometheus Metrics
// ============================================================================

initPrometheus(app);

// ============================================================================
// Health Endpoints
// ============================================================================

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'sira-inference', timestamp: new Date().toISOString() });
});

let modelManager: ReturnType<typeof createModelManager>;

app.get('/readyz', (_req, res) => {
  const ready = modelManager?.isReady() || false;

  if (!ready) {
    res.status(503).json({ ready: false, reason: 'models_not_loaded' });
    return;
  }

  res.json({ ready: true });
});

// ============================================================================
// API Routes
// ============================================================================

app.use('/v1', inferRouter);

// ============================================================================
// 404 Handler
// ============================================================================

app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    path: req.path,
  });
});

// ============================================================================
// Error Handler
// ============================================================================

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({
    error: 'internal_server_error',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
});

// ============================================================================
// Startup
// ============================================================================

async function start() {
  try {
    logger.info('Starting SIRA Inference Service', {
      version: process.env.SERVICE_VERSION || '1.0.0',
      node_env: process.env.NODE_ENV || 'development',
      port: PORT,
    });

    // Initialize model manager
    modelManager = createModelManager(pool);

    logger.info('Loading models...');
    await modelManager.start();

    // Start HTTP server
    const server = app.listen(PORT, HOST, () => {
      logger.info('SIRA Inference Service started', {
        url: `http://${HOST}:${PORT}`,
        healthz: `http://${HOST}:${PORT}/healthz`,
        readyz: `http://${HOST}:${PORT}/readyz`,
        metrics: `http://${HOST}:${PORT}/metrics`,
      });
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          modelManager.stop();
          await pool.end();
          logger.info('Database pool closed');

          process.exit(0);
        } catch (err: any) {
          logger.error('Shutdown error', { error: err.message });
          process.exit(1);
        }
      });

      // Force shutdown after 30s
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err: any) {
    logger.error('Startup failed', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// Start the service
start();
