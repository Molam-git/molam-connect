/**
 * Brique 118ter: Playground Metrics Server
 * Serveur Express avec export Prometheus
 */

import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import { metricsHandler, recordTestRun, recordRequestDuration, recordPayloadSize } from './metrics';

const app = express();

// Middleware
app.use(bodyParser.json({ limit: '1mb' }));

// CORS
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Request timing middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    recordRequestDuration(req.method, res.statusCode, duration);
  });

  next();
});

/**
 * GET /metrics - Prometheus metrics endpoint
 */
app.get('/metrics', metricsHandler);

/**
 * GET /health - Health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

/**
 * POST /api/playground/run - Simuler l'exécution d'une requête
 */
app.post('/api/playground/run', (req: Request, res: Response) => {
  const { method, path, body } = req.body;

  // Record payload size
  if (body) {
    const payloadSize = JSON.stringify(body).length;
    recordPayloadSize(method, payloadSize);
  }

  // Simulate execution
  const success = Math.random() > 0.1; // 90% success rate

  if (success) {
    recordTestRun('success', method, path);
    res.json({
      status: 'success',
      sessionId: `session_${Date.now()}`,
      response: {
        status: 200,
        body: { id: `test_${Date.now()}`, success: true }
      }
    });
  } else {
    recordTestRun('failure', method, path);
    res.status(500).json({
      status: 'failure',
      error: 'Simulated failure'
    });
  }
});

/**
 * POST /api/playground/save - Simuler la sauvegarde d'une session
 */
app.post('/api/playground/save', (req: Request, res: Response) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  res.json({
    status: 'saved',
    sessionId
  });
});

/**
 * POST /api/playground/share - Simuler le partage d'une session
 */
app.post('/api/playground/share', (req: Request, res: Response) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  const shareKey = `share_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  res.json({
    status: 'shared',
    url: `http://playground.molam.com/${shareKey}`,
    shareKey
  });
});

/**
 * GET /api/playground/public/:shareKey - Accès public à une session
 */
app.get('/api/playground/public/:shareKey', (req: Request, res: Response) => {
  const { shareKey } = req.params;

  res.json({
    sessionId: `session_${shareKey}`,
    request_json: {
      method: 'POST',
      path: '/v1/payments',
      body: { amount: 5000, currency: 'XOF' }
    },
    created_at: new Date().toISOString(),
    share_key: shareKey
  });
});

/**
 * GET /api/playground/ops/logs - Ops logs (protected)
 */
app.get('/api/playground/ops/logs', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.includes('ops')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json({
    logs: [
      { timestamp: new Date().toISOString(), level: 'info', message: 'Test log 1' },
      { timestamp: new Date().toISOString(), level: 'info', message: 'Test log 2' }
    ]
  });
});

/**
 * GET /api/playground/ops/metrics - Ops metrics (protected)
 */
app.get('/api/playground/ops/metrics', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.includes('ops')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json({
    test_runs_total: 12345,
    fuzzing_alerts_total: 42,
    rate_limit_hits_total: 87
  });
});

/**
 * DELETE /api/playground/sessions/purge - Admin purge (protected)
 */
app.delete('/api/playground/sessions/purge', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.includes('admin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json({
    purged: 150,
    status: 'success'
  });
});

/**
 * GET /api/playground/sessions - List user sessions
 */
app.get('/api/playground/sessions', (req: Request, res: Response) => {
  res.json({
    sessions: [
      { id: 'session_1', created_at: new Date().toISOString() },
      { id: 'session_2', created_at: new Date().toISOString() }
    ]
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════╗
║  Playground Metrics Server        ║
║  http://localhost:${PORT}           ║
╚═══════════════════════════════════╝

Endpoints:
  GET    /metrics              - Prometheus metrics
  GET    /health               - Health check
  POST   /api/playground/run   - Execute request
  POST   /api/playground/save  - Save session
  POST   /api/playground/share - Share session
  GET    /api/playground/ops/* - Ops endpoints
    `);
  });
}

export default app;
