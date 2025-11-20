/**
 * Brique 119: Bank Profiles & Treasury Accounts Server
 * Express server with banks API routes
 */

import express, { Request, Response, NextFunction } from 'express';
import banksRouter from './routes/banks';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Simple authentication middleware (replace with real auth in production)
app.use((req: Request, res: Response, next: NextFunction) => {
  // For demo purposes, set a default user_id
  // In production, this would come from JWT or session
  req.body.user_id = req.body.user_id || '00000000-0000-0000-0000-000000000001';
  next();
});

// Logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Routes
app.use('/api/banks', banksRouter);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'brique-119-banks',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Brique 119 - Bank Profiles & Treasury Accounts          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('📊 Available endpoints:');
  console.log(`  POST   http://localhost:${PORT}/api/banks/onboard`);
  console.log(`  GET    http://localhost:${PORT}/api/banks`);
  console.log(`  GET    http://localhost:${PORT}/api/banks/:id`);
  console.log(`  PATCH  http://localhost:${PORT}/api/banks/:id/status`);
  console.log(`  POST   http://localhost:${PORT}/api/banks/:id/accounts`);
  console.log(`  GET    http://localhost:${PORT}/api/banks/:id/accounts`);
  console.log(`  GET    http://localhost:${PORT}/api/banks/:id/sla`);
  console.log(`  POST   http://localhost:${PORT}/api/banks/:id/sla/track`);
  console.log('');
  console.log(`  GET    http://localhost:${PORT}/health`);
  console.log('');
});

export default app;
