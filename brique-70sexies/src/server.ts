/**
 * Brique 70sexies - AI Social Ads Generator
 * Express Server
 */

import express from 'express';
import cors from 'cors';
import socialAdsRoutes from './routes/socialAds';

const app = express();
const PORT = process.env.PORT || 3076;

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
    service: 'brique-70sexies-ai-social-ads-generator',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Routes
app.use('/api/social-ads', socialAdsRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
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
    console.log(`🚀 Brique 70sexies - AI Social Ads Generator (Sira Social Engine)`);
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    console.log(`📱 Platforms: Facebook, Instagram, TikTok, LinkedIn, Twitter`);
  });
}

export default app;
