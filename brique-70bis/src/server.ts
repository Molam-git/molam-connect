/**
 * Sous-Brique 70bis — AI Smart Marketing Server
 *
 * Express server for SIRA-powered AI marketing features
 */

import express from 'express';
import { aiRecommendationsRouter } from './routes/aiRecommendations';
import { abTestsRouter } from './routes/abTests';
import { benchmarksRouter } from './routes/benchmarks';
import { anomaliesRouter } from './routes/anomalies';

const app = express();
const PORT = process.env.PORT || 3070;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS (configure based on your needs)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Mock authentication middleware (replace with real auth from Brique 68)
app.use((req: any, res, next) => {
  // In production, this would verify JWT and extract user context
  req.user = {
    id: req.headers['x-user-id'] || 'mock-user-id',
    merchantId: req.headers['x-merchant-id'] || 'mock-merchant-id',
    role: req.headers['x-user-role'] || 'merchant',
  };
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ai-smart-marketing',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/ai/recommendations', aiRecommendationsRouter);
app.use('/api/ai/ab-tests', abTestsRouter);
app.use('/api/ai/benchmarks', benchmarksRouter);
app.use('/api/ai/anomalies', anomaliesRouter);

// Auto-tuning history endpoint
app.get('/api/ai/auto-tuning', async (req: any, res) => {
  try {
    const { getAutoTuningHistory } = await import('./services/siraIntegration');
    const merchantId = req.user?.merchantId;

    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const history = await getAutoTuningHistory(merchantId, limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Error fetching auto-tuning history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 AI Smart Marketing Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🤖 AI Recommendations: http://localhost:${PORT}/api/ai/recommendations`);
    console.log(`🧪 A/B Tests: http://localhost:${PORT}/api/ai/ab-tests`);
    console.log(`📈 Benchmarks: http://localhost:${PORT}/api/ai/benchmarks`);
    console.log(`⚠️  Anomalies: http://localhost:${PORT}/api/ai/anomalies`);
  });
}

export default app;
