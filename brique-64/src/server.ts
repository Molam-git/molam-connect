// ============================================================================
// Brique 64 — Split Payments Engine Server
// ============================================================================

import express from 'express';
import cors from 'cors';
import routes from './routes';

const app = express();
const PORT = parseInt(process.env.PORT || '4064', 10);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Mount API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Brique 64 — Split Payments Engine',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      split_rules: '/api/splits/rules',
      payment_splits: '/api/splits',
      settlements: '/api/settlements',
    },
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.path,
  });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log('  Brique 64 — Split Payments Engine');
  console.log('='.repeat(70));
  console.log(`  Server running on port ${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Health check: http://localhost:${PORT}/api/health`);
  console.log('='.repeat(70));
});

export default app;
