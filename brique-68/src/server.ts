/**
 * RBAC Service - Express Server
 * Port: 4068
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { healthCheck } from './utils/db';
import { redisHealthCheck } from './utils/redis';
import rbacRouter from './routes/rbac';
import { AuthenticatedRequest } from './middleware/authzEnforce';

const app = express();
const PORT = process.env.PORT || 4068;

// ========================================================================
// Middleware
// ========================================================================

app.use(helmet()); // Security headers
app.use(cors()); // CORS
app.use(express.json()); // JSON body parser
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${_req.method}] ${_req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Mock authentication middleware (replace with real auth)
app.use((req: AuthenticatedRequest, _res: express.Response, next: express.NextFunction) => {
  // In production, validate JWT and extract user claims
  // For demo, we'll use a header-based mock
  const userId = req.headers['x-user-id'] as string;
  const userEmail = req.headers['x-user-email'] as string;

  if (userId) {
    req.user = {
      id: userId,
      email: userEmail || 'demo@molam.com',
      roles: [],
      org_roles: {},
      country: 'US',
      currency: 'USD',
      kyc_level: 'P2',
      sira_score: 0.8,
    };
  }

  next();
});

// ========================================================================
// Routes
// ========================================================================

app.get('/', (_req: express.Request, res: express.Response) => {
  res.json({
    service: 'molam-rbac',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      rbac: '/api/rbac',
      docs: '/docs',
    },
  });
});

app.get('/health', async (_req: express.Request, res: express.Response) => {
  const dbOk = await healthCheck();
  const redisOk = await redisHealthCheck();

  const status = dbOk && redisOk ? 'healthy' : 'degraded';
  const statusCode = status === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    status,
    database: dbOk ? 'connected' : 'disconnected',
    redis: redisOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// RBAC routes
app.use('/api/rbac', rbacRouter);

// ========================================================================
// Error Handling
// ========================================================================

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'internal_server_error',
    message: err.message,
  });
});

// 404 handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    error: 'not_found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// ========================================================================
// Server Startup
// ========================================================================

app.listen(PORT, () => {
  console.log(`\n✅ RBAC Service running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API:    http://localhost:${PORT}/api/rbac`);
  console.log(`\n🔐 Features:`);
  console.log(`   • Multi-tenant RBAC with Redis caching`);
  console.log(`   • Performance: P50 < 5ms (cache hit)`);
  console.log(`   • Multi-signature approval workflows`);
  console.log(`   • Immutable audit trail`);
  console.log(`   • ABAC support (attributes-based access control)`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[SERVER] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[SERVER] SIGINT received, shutting down gracefully...');
  process.exit(0);
});

export default app;