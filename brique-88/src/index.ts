// Brique 88 - Auto-Adjustments Ledger Integration & Compensation Flows
// Main Express Server

import express from 'express';
import cors from 'cors';
import { json } from 'body-parser';
import adjustmentsRouter from './routes/adjustments';
import { pool } from './utils/db';

const app = express();
const PORT = parseInt(process.env.PORT || '3088');

// Middleware
app.use(cors());
app.use(json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', adjustmentsRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Brique 88 - Ledger Adjustments & Compensation Flows',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      adjustments: '/api/adjustments',
      compensations: '/api/compensations',
    },
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Brique 88 - Ledger Adjustments & Compensation Flows          ║
║                                                                ║
║  Server running on port ${PORT}                                  ║
║                                                                ║
║  Endpoints:                                                    ║
║  - GET  /health                                                ║
║  - POST /api/adjustments                                       ║
║  - GET  /api/adjustments                                       ║
║  - GET  /api/adjustments/:id                                   ║
║  - POST /api/adjustments/:id/approve                           ║
║  - POST /api/adjustments/:id/reverse                           ║
║  - POST /api/reversals/:id/approve                             ║
║  - GET  /api/compensations                                     ║
║                                                                ║
║  Workers (run separately):                                     ║
║  - npm run worker:adjustments                                  ║
║  - npm run worker:compensations                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
});

export default app;
