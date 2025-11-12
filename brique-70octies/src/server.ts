import express from 'express';
import cors from 'cors';
import loyaltyRoutes from './routes/loyalty';

const app = express();
const PORT = process.env.PORT || 3077;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'brique-70octies-ai-loyalty-engine',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/loyalty', loyaltyRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Brique 70octies - AI Loyalty Engine (Sira)`);
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  });
}

export default app;
