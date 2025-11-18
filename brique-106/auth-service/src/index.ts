/**
 * Molam Auth Service
 *
 * Adaptive 3DS & OTP Authentication Service (SIRA)
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger';
import { checkDatabaseHealth, closePool } from './db';
import authDecisionRoutes from './routes/authDecision';
import otpRoutes from './routes/otp';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ============================================================================
// Middleware
// ============================================================================

// Security headers
app.use(helmet());

// CORS
const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// HTTP request logging
app.use(
  morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  })
);

// Global rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please try again later',
    });
  },
});

app.use(limiter);

// Request ID middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', req.headers['x-request-id'] as string);
  next();
});

// ============================================================================
// Routes
// ============================================================================

// Health check
app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();

  if (dbHealthy) {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
    });
  } else {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    });
  }
});

// API routes
app.use('/v1/auth', authDecisionRoutes);
app.use('/v1/otp', otpRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  }, 'Unhandled error');

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================================================
// Server Lifecycle
// ============================================================================

const server = app.listen(PORT, HOST, () => {
  logger.info({
    port: PORT,
    host: HOST,
    env: process.env.NODE_ENV,
  }, 'Auth service started');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await closePool();
      logger.info('Database connections closed');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down');
  process.exit(0);
});

export default app;
