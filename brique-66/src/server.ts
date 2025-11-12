import express from 'express';
import cors from 'cors';
import { disputeRouter } from './disputes/routes';
import { pool } from './utils/db';

const app = express();
const PORT = process.env.PORT || 4066;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'healthy',
      service: 'disputes-engine',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({
      status: 'unhealthy',
      error: e.message,
    });
  }
});

// Routes
app.use('/api/disputes', disputeRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'internal_server_error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Brique 66 — Disputes & Chargebacks Engine`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

export default app;