/**
 * BRIQUE 139 — Internationalisation & Accessibilité
 * Express Server
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { initializePool, closePool } from './db';
import { initializeRedis, closeRedis } from './cache';
import router from './routes';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3139;

// =============================================================================
// Middleware
// =============================================================================

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// HTTP request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Request ID middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  (req as any).requestId = requestId;
  res.setHeader('X-Request-ID', requestId as string);
  next();
});

// =============================================================================
// Routes
// =============================================================================

// API routes
app.use('/api/v1', router);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Molam Connect - Brique 139',
    description: 'Internationalisation & Accessibilité API',
    version: '1.0.0',
    endpoints: {
      translations: '/api/v1/i18n/:lang/:module',
      currencies: '/api/v1/currency',
      regional: '/api/v1/regional/:countryCode',
      languages: '/api/v1/languages',
      health: '/api/v1/health',
    },
    documentation: 'https://docs.molampay.com/i18n',
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[Server] Error:', err);

  const statusCode = (err as any).statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    error: 'Server Error',
    message,
    requestId: (req as any).requestId,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// =============================================================================
// Server Lifecycle
// =============================================================================

let server: any;

/**
 * Start the server
 */
export async function start(): Promise<void> {
  try {
    // Initialize database
    console.log('[Server] Initializing database connection...');
    initializePool();

    // Initialize Redis (optional)
    if (process.env.REDIS_URL) {
      console.log('[Server] Initializing Redis connection...');
      initializeRedis();
    } else {
      console.warn('[Server] Redis not configured, caching disabled');
    }

    // Start server
    server = app.listen(PORT, () => {
      console.log(`[Server] Brique 139 running on port ${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/api/v1/health`);
    });

    // Start CRON workers if enabled
    if (process.env.ENABLE_WORKERS === 'true') {
      console.log('[Server] Starting CRON workers...');
      const { startWorkers } = await import('./workers');
      await startWorkers();
    }
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

/**
 * Stop the server gracefully
 */
export async function stop(): Promise<void> {
  console.log('[Server] Shutting down gracefully...');

  try {
    // Close server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('[Server] HTTP server closed');
    }

    // Stop workers
    if (process.env.ENABLE_WORKERS === 'true') {
      const { stopWorkers } = await import('./workers');
      await stopWorkers();
      console.log('[Server] Workers stopped');
    }

    // Close database
    await closePool();
    console.log('[Server] Database connection closed');

    // Close Redis
    await closeRedis();
    console.log('[Server] Redis connection closed');

    console.log('[Server] Shutdown complete');
  } catch (error) {
    console.error('[Server] Error during shutdown:', error);
    process.exit(1);
  }
}

// =============================================================================
// Process Handlers
// =============================================================================

// Handle SIGTERM
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received');
  await stop();
  process.exit(0);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received');
  await stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// =============================================================================
// Start server if running directly
// =============================================================================

if (require.main === module) {
  start();
}

export default app;
