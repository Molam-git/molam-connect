// ============================================================================
// Brique 65 — Tax & Compliance Engine Server
// ============================================================================

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import taxRouter from './tax/routes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '4065', 10);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Brique 65 — Tax & Compliance Engine',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      compute_tax: 'POST /api/tax/compute',
      tax_decision: 'GET /api/tax/decisions/:txId',
      reverse_tax: 'POST /api/tax/reverse',
      list_rules: 'GET /api/tax/rules',
      list_jurisdictions: 'GET /api/tax/jurisdictions',
      tax_summary: 'GET /api/tax/summary',
      withholdings: 'GET /api/tax/withholdings',
    },
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'brique-65-tax-engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount tax routes
app.use('/api/tax', taxRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.path,
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log('  Brique 65 — Tax & Compliance Engine');
  console.log('='.repeat(70));
  console.log(`  Server running on port ${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Health check: http://localhost:${PORT}/api/health`);
  console.log('='.repeat(70));
});

export default app;