/**
 * Sous-Brique 70ter — SIRA Auto-Learning Marketing Engine Server
 */

import express from 'express';
import { aiTrainingRouter } from './routes/aiTraining';

const app = express();
const PORT = process.env.PORT || 3071;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Mock auth middleware
app.use((req: any, res, next) => {
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
    service: 'ai-auto-learning',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/ai-training', aiTrainingRouter);

// Error handling
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
    console.log(`🧠 SIRA Auto-Learning Engine running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🤖 AI Training: http://localhost:${PORT}/api/ai-training`);
  });
}

export default app;
