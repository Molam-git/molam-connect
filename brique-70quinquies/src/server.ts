/**
 * Brique 70quinquies - AI Campaign Generator
 * Express Server
 */

import express from 'express';
import cors from 'cors';
import campaignRoutes from './routes/campaign';

const app = express();
const PORT = process.env.PORT || 3075;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'brique-70quinquies-ai-campaign-generator',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/campaigns', campaignRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Brique 70quinquies - AI Campaign Generator`);
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  });
}

export default app;
