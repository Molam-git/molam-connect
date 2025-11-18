// Brique 89 - Payouts & Settlement Engine
// Main Express Server

import express from 'express';
import cors from 'cors';
import { json } from 'body-parser';
import payoutsRouter from './routes/payouts';
import { pool } from './utils/db';
import { initializeConnectors } from './connectors/connector-registry';
import { initializeLedgerTables } from './services/ledger-client';

const app = express();
const PORT = parseInt(process.env.PORT || '3089');

// Middleware
app.use(cors());
app.use(json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Attach db pool to request (for routes that need it)
app.use((req: any, res, next) => {
  req.db = pool;
  next();
});

// Routes
app.use('/api/payouts', payoutsRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Brique 89 - Payouts & Settlement Engine',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/payouts/health',
      create_payout: 'POST /api/payouts',
      list_payouts: 'GET /api/payouts',
      get_payout: 'GET /api/payouts/:id',
      approve: 'POST /api/payouts/:id/approve',
      cancel: 'POST /api/payouts/:id/cancel',
    },
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'internal_server_error',
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
async function start() {
  try {
    // Initialize ledger tables
    await initializeLedgerTables();

    // Initialize connectors
    await initializeConnectors();

    // Start server
    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Brique 89 - Payouts & Settlement Engine                      ║
║                                                                ║
║  Server running on port ${PORT}                                  ║
║                                                                ║
║  Endpoints:                                                    ║
║  - POST /api/payouts                (Create payout)            ║
║  - GET  /api/payouts                (List payouts)             ║
║  - GET  /api/payouts/:id            (Get payout)               ║
║  - POST /api/payouts/:id/approve    (Approve payout)           ║
║  - POST /api/payouts/:id/cancel     (Cancel payout)            ║
║  - GET  /api/payouts/health         (Health check)             ║
║                                                                ║
║  Workers (run separately):                                     ║
║  - npm run worker:batcher                                      ║
║  - npm run worker:sender                                       ║
║  - npm run worker:retry                                        ║
╚════════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
