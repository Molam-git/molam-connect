/**
 * Molam Form Core - Main Server Entry Point
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { formRouter } from './routes/form';
import { checkDatabaseConnection } from './utils/db';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001'];
app.use(cors({
  origin: corsOrigins,
  credentials: process.env.CORS_CREDENTIALS === 'true'
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/form', limiter);

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  const dbConnected = await checkDatabaseConnection();
  const status = {
    status: dbConnected ? 'healthy' : 'unhealthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected'
  };
  res.status(dbConnected ? 200 : 503).json(status);
});

// API routes
app.use('/form', formRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Molam Form Core API',
    version: '1.0.0',
    documentation: 'https://docs.molam.com/form-core',
    endpoints: {
      health: '/health',
      api: '/form'
    }
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Endpoint not found',
    path: req.path
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'internal_server_error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`\n🚀 Molam Form Core API`);
  console.log(`📍 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API base: http://localhost:${PORT}/form`);

  // Check database connection
  const dbConnected = await checkDatabaseConnection();
  if (dbConnected) {
    console.log(`✅ Database connected`);
  } else {
    console.error(`❌ Database connection failed`);
  }

  console.log(`\n💡 Ready to accept requests\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

export default app;
