/**
 * MOLAM CONNECT - Main Server
 *
 * Unified server that orchestrates all briques:
 * - Brique 104: PHP SDK (exposed via REST API)
 * - Brique 105: Python SDK (exposed via REST API)
 * - Brique 106: Client SDKs (Web + React Native)
 * - Brique 106bis: Auth Service (3DS + OTP)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const Redis = require('ioredis');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ============================================================================
// Database & Redis Connections
// ============================================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
});

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Test connections
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection failed:', err.message);
});

// ============================================================================
// Middleware
// ============================================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for demo
  crossOriginEmbedderPolicy: false,
}));

// CORS
const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP logging
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Request ID
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || require('uuid').v4();
  res.setHeader('x-request-id', req.id);
  next();
});

// ============================================================================
// Static Files (Client SDKs, Dashboard)
// ============================================================================

// Serve client SDKs
app.use('/sdk', express.static(path.join(__dirname, 'brique-106/web-sdk/dist')));

// Serve test dashboard
app.use('/dashboard', express.static(path.join(__dirname, 'public')));

// Serve static files from public directory (for checkout.html, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Serve React wallet app (Brique 149a)
app.use('/wallet-react', express.static(path.join(__dirname, 'brique-149a-wallet/web/build')));

// Serve React merchant dashboard (Brique 149b)
app.use('/merchant-dashboard', express.static(path.join(__dirname, 'brique-149b-connect/web/build')));

// ============================================================================
// Brique 68: RBAC (Role-Based Access Control)
// ============================================================================

const RBACService = require('./src/services/rbacService');
const { requirePermission, requireAnyPermission, requireAllPermissions } = require('./src/middleware/rbac');

// Initialize RBAC service
const rbacService = new RBACService(pool);

// Mock authentication middleware for RBAC (replace with real JWT auth in production)
app.use('/api/rbac', (req, res, next) => {
  // Extract user info from headers (for demo/testing)
  const userId = req.headers['x-user-id'];
  const userEmail = req.headers['x-user-email'];

  if (userId) {
    // Convert test-123 to proper UUID for database compatibility
    const userIdUUID = userId === 'test-123' ? '00000000-0000-0000-0000-000000000123' : userId;

    req.user = {
      id: userIdUUID,
      email: userEmail || 'demo@molam.com',
      roles: [],
      org_roles: {},
      country: 'US',
      currency: 'USD',
      kyc_level: 'P2',
      sira_score: 0.8,
    };
  }

  next();
});

// Import RBAC routes from Brique 68
// NOTE: Commented out for Docker build - brique-68 is excluded from image
// const rbacRouter = require('./brique-68/dist/routes/rbac').default;

// Mount RBAC routes
// app.use('/api/rbac', rbacRouter);

console.log('⚠️  RBAC (Brique 68) disabled for Docker build');

// ============================================================================
// Brique Translation: Multi-language Support
// ============================================================================

const axios = require('axios');
const TRANSLATION_SERVICE_URL = process.env.TRANSLATION_SERVICE_URL || 'http://localhost:4015';

// Proxy translation requests to Translation service
app.post('/api/translate', async (req, res) => {
  try {
    const response = await axios.post(`${TRANSLATION_SERVICE_URL}/api/translate`, req.body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    });
    res.json(response.data);
  } catch (error) {
    console.error('Translation service error:', error.message);
    // Fallback: return source text if translation service unavailable
    res.json({ text: req.body.text });
  }
});

// Proxy translation feedback
app.post('/api/translate/feedback', async (req, res) => {
  try {
    const response = await axios.post(`${TRANSLATION_SERVICE_URL}/api/feedback`, req.body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 3000,
    });
    res.json(response.data);
  } catch (error) {
    console.error('Translation feedback error:', error.message);
    res.status(500).json({ error: 'feedback_failed' });
  }
});

console.log('✅ Translation Service (Brique Translation) initialized');

// ============================================================================
// API Routes
// ============================================================================

// Root redirect to dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT 1 as health');
    const dbHealthy = dbResult.rows[0].health === 1;

    const redisHealthy = redis.status === 'ready';

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbHealthy ? 'connected' : 'disconnected',
        redis: redisHealthy ? 'connected' : 'disconnected',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

// ============================================================================
// Payment Intents API (Core)
// ============================================================================

// Create payment intent
app.post('/api/v1/payment_intents', async (req, res) => {
  try {
    const { amount, currency, customer_id, description, metadata } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const paymentIntentId = `pi_${require('uuid').v4()}`;
    const clientSecret = `${paymentIntentId}_secret_${require('uuid').v4()}`;

    const result = await pool.query(
      `INSERT INTO payment_intents (id, amount, currency, customer_id, description, metadata, client_secret, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [paymentIntentId, amount, currency || 'USD', customer_id || null, description || null, JSON.stringify(metadata || {}), clientSecret]
    );

    const paymentIntent = result.rows[0];

    console.log(`✅ Payment intent created: ${paymentIntent.id} - ${amount} ${currency}`);

    res.status(201).json({
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      client_secret: paymentIntent.client_secret,
      created: paymentIntent.created_at,
    });
  } catch (error) {
    console.error('❌ Payment intent creation failed:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Retrieve payment intent
app.get('/api/v1/payment_intents/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM payment_intents WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment intent not found' });
    }

    const paymentIntent = result.rows[0];

    res.status(200).json({
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      client_secret: paymentIntent.client_secret,
      created: paymentIntent.created_at,
      metadata: paymentIntent.metadata,
    });
  } catch (error) {
    console.error('❌ Payment intent retrieval failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Confirm payment intent
app.post('/api/v1/payment_intents/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method, client_secret } = req.body;

    // Verify client_secret
    const result = await pool.query(
      'SELECT * FROM payment_intents WHERE id = $1 AND client_secret = $2',
      [id, client_secret]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment intent not found or invalid client_secret' });
    }

    // Update status to processing
    await pool.query(
      `UPDATE payment_intents
       SET status = 'processing', payment_method = $1, updated_at = now()
       WHERE id = $2`,
      [payment_method || 'card', id]
    );

    // Simulate payment processing (in real scenario, call payment processor)
    setTimeout(async () => {
      await pool.query(
        `UPDATE payment_intents
         SET status = 'succeeded', succeeded_at = now(), updated_at = now()
         WHERE id = $1`,
        [id]
      );
      console.log(`✅ Payment succeeded: ${id}`);
    }, 2000);

    const paymentIntent = result.rows[0];

    res.status(200).json({
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: 'processing',
      message: 'Payment is being processed',
    });
  } catch (error) {
    console.error('❌ Payment confirmation failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Auth Decision API (Brique 106bis)
// ============================================================================

// Make auth decision
app.post('/api/v1/auth/decide', async (req, res) => {
  try {
    const { payment_id, user_id, amount, currency, device, bin, country, merchant_id } = req.body;

    // Simple risk scoring (mock SIRA)
    let riskScore = 50; // Default medium risk

    if (amount > 100000) riskScore += 20;
    if (!user_id) riskScore += 15;
    if (country && ['NG', 'GH', 'KE'].includes(country)) riskScore += 10;

    riskScore = Math.min(100, Math.max(0, riskScore));

    // Determine recommended method
    let recommended = 'otp_sms';
    if (riskScore >= 80) recommended = '3ds2';
    else if (riskScore >= 50) recommended = 'otp_sms';
    else recommended = 'none';

    // Log decision (using native UUID for database compatibility)
    const decisionId = require('uuid').v4();

    const result = await pool.query(
      `INSERT INTO auth_decisions (
        id, payment_id, user_id, country, device_fingerprint, device_ip,
        risk_score, decision, recommended_method, final_method, amount, currency, bin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id`,
      [
        decisionId, payment_id, user_id || null, country, device?.fingerprint || null, device?.ip || null,
        riskScore, recommended, recommended, recommended, amount, currency, bin || null
      ]
    );

    console.log(`✅ Auth decision made: ${result.rows[0].id} - ${recommended} (risk: ${riskScore})`);

    res.status(200).json({
      decision_id: result.rows[0].id,
      risk_score: riskScore,
      recommended,
      explain: {
        factors: amount > 100000 ? ['high_amount'] : ['normal_amount'],
        sira: { score: riskScore, level: riskScore >= 70 ? 'high' : 'medium' },
      },
      ttl_seconds: 120,
      fallback_methods: recommended === '3ds2' ? ['otp_sms', 'otp_voice'] : ['otp_voice'],
    });
  } catch (error) {
    console.error('❌ Auth decision failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// OTP API (Brique 106bis)
// ============================================================================

// Create OTP
app.post('/api/v1/otp/create', async (req, res) => {
  try {
    const { payment_id, phone, method } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash code (in production, use argon2)
    const argon2 = require('argon2');
    const codeHash = await argon2.hash(code);

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const result = await pool.query(
      `INSERT INTO otp_requests (payment_id, phone, method, code_hash, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, 'sent')
       RETURNING id`,
      [payment_id || null, phone, method || 'sms', codeHash, expiresAt]
    );

    // In development, log the OTP code (DO NOT DO THIS IN PRODUCTION!)
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔐 OTP CODE (dev only): ${code} for phone ${phone}`);
    }

    // TODO: Send actual SMS/Voice via Twilio/Orange SMS

    console.log(`✅ OTP created: ${result.rows[0].id} - ${method} to ${phone}`);

    res.status(201).json({
      otp_id: result.rows[0].id,
      phone: phone.substring(0, 4) + '****' + phone.substring(phone.length - 2),
      method: method || 'sms',
      expires_at: expiresAt,
      max_attempts: 3,
    });
  } catch (error) {
    console.error('❌ OTP creation failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify OTP
app.post('/api/v1/otp/verify', async (req, res) => {
  try {
    const { otp_id, code } = req.body;

    const result = await pool.query(
      'SELECT * FROM otp_requests WHERE id = $1',
      [otp_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'OTP not found' });
    }

    const otp = result.rows[0];

    // Check expiry
    if (new Date() > new Date(otp.expires_at)) {
      await pool.query('UPDATE otp_requests SET status = $1 WHERE id = $2', ['expired', otp_id]);
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    // Check attempts
    if (otp.attempts >= 3) {
      return res.status(400).json({ success: false, message: 'Max attempts exceeded' });
    }

    // Verify code
    const argon2 = require('argon2');
    const isValid = await argon2.verify(otp.code_hash, code);

    // Increment attempts
    await pool.query(
      'UPDATE otp_requests SET attempts = attempts + 1 WHERE id = $1',
      [otp_id]
    );

    if (isValid) {
      await pool.query(
        'UPDATE otp_requests SET status = $1, verified_at = now() WHERE id = $2',
        ['verified', otp_id]
      );

      console.log(`✅ OTP verified: ${otp_id}`);

      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
      });
    } else {
      console.log(`❌ OTP verification failed: ${otp_id} - invalid code`);

      return res.status(400).json({
        success: false,
        message: 'Invalid OTP code',
      });
    }
  } catch (error) {
    console.error('❌ OTP verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Customer API
// ============================================================================

app.post('/api/v1/customers', async (req, res) => {
  try {
    const { email, name, phone, country, metadata } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const customerId = `cus_${require('uuid').v4()}`;

    const result = await pool.query(
      `INSERT INTO customers (id, email, name, phone, country, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         country = EXCLUDED.country,
         updated_at = now()
       RETURNING *`,
      [customerId, email, name || null, phone || null, country || null, JSON.stringify(metadata || {})]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Customer creation failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Brique 107: Offline Fallback (QR + USSD)
// ============================================================================
// NOTE: All brique modules (107-112) commented out for Docker build
// These modules are excluded from the Docker image via .dockerignore
/*
const QRService = require('./brique-107/src/qr-service');
const USSDService = require('./brique-107/src/ussd-service');

// ============================================================================
// Brique 108: PaymentIntent & 3DS2 Orchestration
// ============================================================================

const createPaymentIntentRouter = require('./brique-108/src/routes/paymentIntents');
const webhookPublisher = require('./brique-108/src/webhooks/publisher');
const chargeProcessor = require('./brique-108/src/charge/processor');
const chargeFinalizer = require('./brique-108/src/charge/finalizer');

// Initialize pool references for Brique 108 modules
webhookPublisher.setPool(pool);
chargeProcessor.setPool(pool);
chargeFinalizer.setPool(pool);

// ============================================================================
// Brique 109: Checkout Widgets & SDK Enhancements
// ============================================================================

const tokenService = require('./brique-109/src/tokens/service');
const createCheckoutRouter = require('./brique-109/src/routes/checkout');

// Initialize pool for tokenization service
tokenService.setPool(pool);

// ============================================================================
// Brique 110: Plugin Telemetry & Upgrade Notifications (Ops Toggles)
// ============================================================================

const monitoringService = require('./brique-110/src/services/monitoring');
const notificationService = require('./brique-110/src/services/notifications');
const createPluginRouter = require('./brique-110/src/routes/plugins');

// Initialize pool for plugin monitoring services
monitoringService.setPool(pool);
notificationService.setPool(pool);

// ============================================================================
// Brique 110bis: Auto-Healing Plugins & Interop Layer
// ============================================================================

const autoHealingService = require('./brique-110bis/src/services/autoHealing');
const interopService = require('./brique-110bis/src/services/interop');
const createAutoHealingRouter = require('./brique-110bis/src/routes/autohealing');

// Initialize pool for auto-healing services
autoHealingService.setPool(pool);
interopService.setPool(pool);

// ============================================================================
// Brique 111-2: AI Config Advisor (SIRA)
// ============================================================================

const recommendationExecutor = require('./brique-111-2/src/services/recommendationExecutor');
const createRecommendationsRouter = require('./brique-111-2/src/routes/ai-recommendations');

// Initialize pool for recommendation executor
recommendationExecutor.setPool(pool);

// ============================================================================
// Brique 112: SIRA Training & Data Pipeline
// ============================================================================

const dataIngestionWorker = require('./brique-112/src/workers/dataIngestion');
const canaryService = require('./brique-112/src/services/canaryService');
const createModelRegistryRouter = require('./brique-112/src/routes/model-registry');
const createCanaryRouter = require('./brique-112/src/routes/canary');

// Initialize pool for Brique 112 services
dataIngestionWorker.setPool(pool);
canaryService.setPool(pool);

const qrService = new QRService(pool, {
  hmacSecret: process.env.QR_HMAC_SECRET || 'default-secret-change-me',
  baseUrl: process.env.PAY_URL || 'http://localhost:3000',
  defaultTTL: parseInt(process.env.QR_DEFAULT_TTL || '300', 10)
});

const ussdService = new USSDService(pool, {
  maxPinAttempts: parseInt(process.env.USSD_MAX_PIN_ATTEMPTS || '3', 10),
  pinLockDuration: parseInt(process.env.USSD_PIN_LOCK_DURATION || '30', 10),
  sessionTimeout: parseInt(process.env.USSD_SESSION_TIMEOUT || '300', 10)
});

// QR Code - Create
app.post('/api/v1/qr/create', async (req, res) => {
  try {
    const qr = await qrService.createQRCode(req.body);
    console.log(`✅ QR created: ${qr.id} - ${qr.type} - ${qr.amount} ${qr.currency}`);
    res.status(201).json(qr);
  } catch (error) {
    console.error('❌ QR creation failed:', error);
    res.status(400).json({ error: error.message });
  }
});

// QR Code - Verify
app.get('/api/v1/qr/verify/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { hmac } = req.query;

    if (!hmac) {
      return res.status(400).json({ error: 'HMAC required' });
    }

    const qr = await qrService.verifyQRCode(id, hmac);
    console.log(`✅ QR verified: ${id}`);
    res.json(qr);
  } catch (error) {
    console.error('❌ QR verification failed:', error);
    res.status(400).json({ error: error.message });
  }
});

// QR Code - Mark as scanned
app.post('/api/v1/qr/:id/scan', async (req, res) => {
  try {
    const { id } = req.params;
    const { scanned_by } = req.body;

    const qr = await qrService.markScanned(id, scanned_by);
    console.log(`✅ QR scanned: ${id}`);
    res.json(qr);
  } catch (error) {
    console.error('❌ QR scan failed:', error);
    res.status(400).json({ error: error.message });
  }
});

// QR Code - Complete payment
app.post('/api/v1/qr/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const qr = await qrService.completeQRPayment(id, req.body);
    console.log(`✅ QR payment completed: ${id}`);
    res.json(qr);
  } catch (error) {
    console.error('❌ QR completion failed:', error);
    res.status(400).json({ error: error.message });
  }
});

// QR Code - Cancel
app.post('/api/v1/qr/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const qr = await qrService.cancelQRCode(id);
    console.log(`✅ QR cancelled: ${id}`);
    res.json(qr);
  } catch (error) {
    console.error('❌ QR cancellation failed:', error);
    res.status(400).json({ error: error.message });
  }
});

// QR Code - List sessions
app.get('/api/v1/qr/sessions', async (req, res) => {
  try {
    const sessions = await qrService.listQRSessions(req.query);
    res.json(sessions);
  } catch (error) {
    console.error('❌ QR session list failed:', error);
    res.status(400).json({ error: error.message });
  }
});

// QR Code - Get stats
app.get('/api/v1/qr/stats', async (req, res) => {
  try {
    const stats = await qrService.getQRStats(req.query);
    res.json(stats);
  } catch (error) {
    console.error('❌ QR stats failed:', error);
    res.status(400).json({ error: error.message });
  }
});

// USSD - Handle callback (from gateway)
app.post('/api/v1/ussd/callback', async (req, res) => {
  try {
    const response = await ussdService.handleUSSD(req.body);
    console.log(`✅ USSD: ${req.body.sessionId} - ${req.body.msisdn}`);
    res.json(response);
  } catch (error) {
    console.error('❌ USSD handler failed:', error);
    res.status(500).json({
      text: 'Erreur systeme. Veuillez reessayer.',
      end: true
    });
  }
});

// USSD - Get session
app.get('/api/v1/ussd/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await pool.query(
      'SELECT * FROM ussd_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ USSD session get failed:', error);
    res.status(400).json({ error: error.message });
  }
});

// USSD - List transactions
app.get('/api/v1/ussd/transactions', async (req, res) => {
  try {
    const { phone, limit = 20, offset = 0 } = req.query;

    let query = 'SELECT * FROM ussd_transactions WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (phone) {
      params.push(phone);
      query += ` AND phone = $${paramIndex++}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ USSD transaction list failed:', error);
    res.status(400).json({ error: error.message });
  }
});

// USSD - Get menu texts
app.get('/api/v1/ussd/menus', async (req, res) => {
  try {
    const { country_code, language } = req.query;

    let query = 'SELECT * FROM ussd_menu_texts WHERE is_active = true';
    const params = [];
    let paramIndex = 1;

    if (country_code) {
      params.push(country_code);
      query += ` AND country_code = $${paramIndex++}`;
    }

    if (language) {
      params.push(language);
      query += ` AND language = $${paramIndex++}`;
    }

    query += ' ORDER BY country_code, language, menu_key';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ USSD menu list failed:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// Brique 108: PaymentIntent API (Industrial-grade with 3DS2 + Webhooks)
// ============================================================================

// Mount PaymentIntent routes
const paymentIntentRouter = createPaymentIntentRouter(pool);
app.use('/api/v1/payment-intents', paymentIntentRouter);

// ============================================================================
// Brique 109: Checkout Widget API
// ============================================================================

// Mount Checkout routes
const checkoutRouter = createCheckoutRouter(pool, tokenService);
app.use('/api/v1/checkout', checkoutRouter);

// ============================================================================
// Brique 110: Plugin Telemetry API
// ============================================================================

// Mount Plugin routes
const pluginRouter = createPluginRouter(pool, monitoringService, notificationService);
app.use('/api/v1/plugins', pluginRouter);

// Serve Ops Dashboard
app.use('/ops/plugins', express.static(path.join(__dirname, 'brique-110/src/components')));

// ============================================================================
// Brique 110bis: Auto-Healing & Interop API
// ============================================================================

// Mount Auto-Healing routes
const autoHealingRouter = createAutoHealingRouter(pool, autoHealingService, interopService);
app.use('/api/v1/plugins', autoHealingRouter);

// Serve Auto-Healing Console
app.use('/ops/autohealing', express.static(path.join(__dirname, 'brique-110bis/src/components')));

// ============================================================================
// Brique 111-2: AI Config Advisor API
// ============================================================================

// Mount AI Recommendations routes
const recommendationsRouter = createRecommendationsRouter(pool, recommendationExecutor);
app.use('/api/ai-recommendations', recommendationsRouter);

// Serve AI Advisor Panel
app.use('/ops/ai-advisor', express.static(path.join(__dirname, 'brique-111-2/src/components')));

// ============================================================================
// Brique 112: SIRA Training & Data Pipeline API
// ============================================================================

// Mount Model Registry routes
const modelRegistryRouter = createModelRegistryRouter(pool);
app.use('/api/sira/models', modelRegistryRouter);

// Mount Canary routes
const canaryRouter = createCanaryRouter(pool, canaryService);
app.use('/api/sira/canary', canaryRouter);

// Data Ingestion endpoints
app.post('/api/sira/ingest', async (req, res) => {
  try {
    const { event_id, source_module, features, country, currency } = req.body;

    if (!event_id || !source_module || !features) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    const result = await dataIngestionWorker.ingestEvent(
      event_id,
      source_module,
      features,
      country,
      currency
    );

    res.status(201).json(result);
  } catch (error) {
    console.error('❌ Data ingestion failed:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.post('/api/sira/label', async (req, res) => {
  try {
    const { event_id, label, labelled_by, confidence, review_notes } = req.body;

    if (!event_id || !label || !labelled_by) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    const result = await dataIngestionWorker.addLabel(
      event_id,
      label,
      labelled_by,
      confidence,
      review_notes
    );

    res.status(201).json(result);
  } catch (error) {
    console.error('❌ Label creation failed:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.get('/api/sira/dataset/summary', async (req, res) => {
  try {
    const summary = await dataIngestionWorker.getDatasetSummary();
    res.json(summary);
  } catch (error) {
    console.error('❌ Dataset summary failed:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.get('/api/sira/dataset/labels', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date required' });
    }

    const distribution = await dataIngestionWorker.getLabelDistribution(start_date, end_date);
    res.json(distribution);
  } catch (error) {
    console.error('❌ Label distribution failed:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Tokenization endpoint (served from tokens.molam.com in production)
app.post('/api/v1/tokens', async (req, res) => {
  try {
    const {
      pan,
      exp_month,
      exp_year,
      cvc,
      name,
      billing_country = 'SN',
      usage = 'single',
      merchant_id = null,
      customer_id = null,
      vault_consent = false
    } = req.body;

    // Validate required fields
    if (!pan || !exp_month || !exp_year || !cvc || !name) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    // Create token
    const token = await tokenService.createToken({
      pan,
      exp_month: parseInt(exp_month, 10),
      exp_year: parseInt(exp_year, 10),
      cvc,
      name,
      billing_country,
      usage,
      merchant_id,
      customer_id,
      vault_consent
    });

    console.log(`✅ Token created: ${token.token} - ${token.card_brand} ${token.masked_pan}`);

    res.status(201).json(token);
  } catch (error) {
    console.error('❌ Tokenization failed:', error);

    if (error.message === 'invalid_card_number') {
      return res.status(400).json({ error: 'invalid_card_number', message: 'Card number is invalid' });
    }

    if (error.message === 'card_expired') {
      return res.status(400).json({ error: 'card_expired', message: 'Card has expired' });
    }

    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Serve hosted fields iframe
app.use('/brique-109/iframe', express.static(path.join(__dirname, 'brique-109/iframe')));

// Serve checkout widget demo
app.use('/brique-109/web', express.static(path.join(__dirname, 'brique-109/web')));

// 3DS2 Callback - Handle challenge response from ACS
app.post('/api/v1/3ds/callback', async (req, res) => {
  try {
    const { threeDSServerTransID, cres } = req.body;

    if (!cres) {
      return res.status(400).json({ error: 'Missing CRes (Challenge Response)' });
    }

    // Find 3DS session
    const { rows: [session] } = await pool.query(
      `SELECT * FROM three_ds_sessions WHERE client_data->>'threeDSServerTransID' = $1`,
      [threeDSServerTransID]
    );

    if (!session) {
      return res.status(404).json({ error: '3DS session not found' });
    }

    // Verify 3DS result
    const { verify3DSResult } = require('./brique-108/src/3ds/utils');
    const result = verify3DSResult(cres);

    // Update 3DS session
    await pool.query(
      `UPDATE three_ds_sessions
       SET status = $2,
           trans_status = $3,
           result = $4,
           eci = $5,
           cavv = $6,
           xid = $7,
           authentication_value = $8,
           completed_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [
        session.id,
        result.status,
        result.trans_status,
        JSON.stringify(result),
        result.eci,
        result.cavv,
        result.xid,
        result.authentication_value
      ]
    );

    // Get payment intent
    const { rows: [pi] } = await pool.query(
      'SELECT * FROM payment_intents WHERE id = $1',
      [session.payment_intent_id]
    );

    if (!pi) {
      return res.status(404).json({ error: 'PaymentIntent not found' });
    }

    // If authenticated, proceed to charge
    if (result.authenticated || result.attempted) {
      const { providerChargeCapture } = require('./brique-108/src/charge/processor');
      const { finalizeSuccess, finalizeFailure } = require('./brique-108/src/charge/finalizer');

      const charge = await providerChargeCapture(pi.selected_payment_method, pi);

      if (charge.status === 'captured') {
        await finalizeSuccess(pi.id, charge);
        console.log(`✅ 3DS authenticated + charged: ${pi.id}`);
        return res.json({ status: 'succeeded', payment_intent_id: pi.id });
      } else {
        await finalizeFailure(pi.id, charge);
        return res.status(400).json({ status: 'failed', error: charge.error });
      }
    } else {
      // Authentication failed
      const { finalizeFailure } = require('./brique-108/src/charge/finalizer');
      await finalizeFailure(pi.id, {
        error: '3DS authentication failed',
        charge: { failure_code: '3ds_failed', failure_message: '3DS authentication failed' }
      });

      return res.status(400).json({
        status: 'failed',
        error: '3DS authentication failed'
      });
    }
  } catch (error) {
    console.error('❌ 3DS callback failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
*/
console.log('⚠️  Briques 107-112 (QR, USSD, PaymentIntents, Checkout, Plugins, AI) disabled for Docker build');

// ============================================================================
// Brique 149a: QR Code Wallet APIs
// ============================================================================

// Get default wallet for user
app.get('/api/v1/wallet/default/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await pool.query(`
      SELECT
        w.*,
        wb.balance,
        wb.available_balance,
        wb.pending_credit,
        wb.pending_debit,
        c.name as currency_name,
        c.minor_unit,
        co.name as country_name
      FROM molam_wallets w
      LEFT JOIN wallet_balances wb ON w.id = wb.wallet_id
      LEFT JOIN ref_currencies c ON w.currency = c.currency_code
      LEFT JOIN ref_countries co ON w.country_code = co.country_code
      WHERE w.user_id = $1 AND w.is_default = true
      LIMIT 1
    `, [user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No default wallet found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Get default wallet failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all wallets for user
app.get('/api/v1/wallet/user/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await pool.query(`
      SELECT
        w.*,
        wb.balance,
        wb.available_balance,
        wb.pending_credit,
        wb.pending_debit,
        c.name as currency_name,
        c.minor_unit,
        co.name as country_name
      FROM molam_wallets w
      LEFT JOIN wallet_balances wb ON w.id = wb.wallet_id
      LEFT JOIN ref_currencies c ON w.currency = c.currency_code
      LEFT JOIN ref_countries co ON w.country_code = co.country_code
      WHERE w.user_id = $1
      ORDER BY w.is_default DESC, w.currency
    `, [user_id]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get user wallets failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get wallet balance
app.get('/api/v1/wallet/:wallet_id/balance', async (req, res) => {
  try {
    const { wallet_id } = req.params;

    const result = await pool.query(`
      SELECT
        w.id,
        w.currency,
        wb.balance,
        wb.available_balance,
        wb.pending_credit,
        wb.pending_debit,
        wb.last_transaction_at
      FROM molam_wallets w
      JOIN wallet_balances wb ON w.id = wb.wallet_id
      WHERE w.id = $1
    `, [wallet_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Get wallet balance failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get wallet transaction history
app.get('/api/v1/wallet/:wallet_id/history', async (req, res) => {
  try {
    const { wallet_id } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const result = await pool.query(`
      SELECT *
      FROM wallet_history
      WHERE wallet_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [wallet_id, limit, offset]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get wallet history failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create QR code for payment
app.post('/api/v1/wallet/qr/create', async (req, res) => {
  try {
    const { wallet_id, user_id, purpose, amount, description } = req.body;

    // Validate purpose
    if (!['receive', 'pay', 'transfer'].includes(purpose)) {
      return res.status(400).json({ error: 'Invalid purpose. Must be: receive, pay, or transfer' });
    }

    // Get wallet currency
    const walletResult = await pool.query(
      'SELECT currency FROM molam_wallets WHERE id = $1 AND user_id = $2',
      [wallet_id, user_id]
    );

    if (walletResult.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const currency = walletResult.rows[0].currency;

    // Create QR token (expires in 15 minutes)
    const result = await pool.query(`
      INSERT INTO wallet_qr_tokens (wallet_id, user_id, purpose, amount, currency, expires_at, description)
      VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '15 minutes', $6)
      RETURNING *
    `, [wallet_id, user_id, purpose, amount || null, currency, description || null]);

    const qrToken = result.rows[0];

    res.json({
      token: qrToken.token,
      purpose: qrToken.purpose,
      amount: qrToken.amount,
      currency: qrToken.currency,
      expires_at: qrToken.expires_at,
      description: qrToken.description
    });
  } catch (error) {
    console.error('❌ Create QR token failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify QR code
app.get('/api/v1/wallet/qr/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(`
      SELECT
        qr.*,
        w.currency,
        w.display_name as wallet_name,
        u.user_type
      FROM wallet_qr_tokens qr
      JOIN molam_wallets w ON qr.wallet_id = w.id
      LEFT JOIN molam_users u ON qr.user_id = u.id
      WHERE qr.token = $1
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    const qr = result.rows[0];

    // Check if expired
    if (new Date(qr.expires_at) < new Date()) {
      return res.status(400).json({ error: 'QR code expired' });
    }

    // Check if already used
    if (qr.used_at) {
      return res.status(400).json({ error: 'QR code already used' });
    }

    res.json({
      valid: true,
      token: qr.token,
      purpose: qr.purpose,
      amount: qr.amount,
      currency: qr.currency,
      description: qr.description,
      wallet_id: qr.wallet_id,
      user_id: qr.user_id,
      expires_at: qr.expires_at
    });
  } catch (error) {
    console.error('❌ Verify QR token failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// List active QR codes for user
app.get('/api/v1/wallet/qr/user/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await pool.query(`
      SELECT *
      FROM wallet_qr_tokens
      WHERE user_id = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
    `, [user_id]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ List QR tokens failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Brique 149a: React Wallet Home APIs
// ============================================================================

// Get wallet home data (for React app)
app.get('/api/wallet/home', async (req, res) => {
  try {
    // For demo, use test user ID (in production, get from JWT token)
    const user_id = '00000000-0000-0000-0000-000000000123';

    // Get default wallet with balance
    const walletResult = await pool.query(`
      SELECT
        w.*,
        wb.balance,
        wb.available_balance,
        wb.pending_credit,
        wb.pending_debit,
        c.name as currency_name,
        c.minor_unit,
        co.name as country_name
      FROM molam_wallets w
      LEFT JOIN wallet_balances wb ON w.id = wb.wallet_id
      LEFT JOIN ref_currencies c ON w.currency = c.currency_code
      LEFT JOIN ref_countries co ON w.country_code = co.country_code
      WHERE w.user_id = $1 AND w.is_default = true
      LIMIT 1
    `, [user_id]);

    if (walletResult.rows.length === 0) {
      return res.status(404).json({ error: 'No default wallet found' });
    }

    const wallet = walletResult.rows[0];

    // Get recent transaction history
    const historyResult = await pool.query(`
      SELECT
        id,
        label,
        amount,
        currency,
        type,
        category,
        created_at as timestamp
      FROM wallet_history
      WHERE wallet_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [wallet.id]);

    // Build response
    const response = {
      user: {
        id: user_id,
        locale: 'fr',
        currency: wallet.currency,
        country: wallet.country_code
      },
      balance: {
        balance: parseFloat(wallet.balance || 0),
        currency: wallet.currency,
        status: wallet.status
      },
      actions: [
        { k: 'receive', l: 'Recevoir', e: '📥', icon: 'receive' },
        { k: 'transfer', l: 'Transférer', e: '💸', icon: 'send' },
        { k: 'merchant_payment', l: 'Payer', e: '🛒', icon: 'payment' },
        { k: 'topup', l: 'Recharger', e: '➕', icon: 'topup' },
        { k: 'withdraw', l: 'Retirer', e: '💰', icon: 'withdraw' },
        { k: 'scan', l: 'Scanner', e: '📷', icon: 'scan' },
        {
          k: 'bills',
          l: 'Factures',
          e: '📡',
          icon: 'bills',
          sub: [
            { k: 'electricity', l: 'Électricité', e: '⚡', icon: 'electricity' },
            { k: 'water', l: 'Eau', e: '💧', icon: 'water' },
            { k: 'internet', l: 'Internet', e: '🌐', icon: 'internet' },
            { k: 'mobile', l: 'Mobile', e: '📱', icon: 'mobile' }
          ]
        }
      ],
      history: historyResult.rows.map(tx => ({
        id: tx.id,
        label: tx.label,
        amount: parseFloat(tx.amount) * (tx.type === 'debit' ? -1 : 1),
        currency: tx.currency,
        type: tx.type,
        category: tx.category,
        timestamp: tx.timestamp
      }))
    };

    res.json(response);
  } catch (error) {
    console.error('❌ Get wallet home failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate QR code (for React app)
app.post('/api/wallet/qr/generate', async (req, res) => {
  try {
    const { purpose = 'receive', expiryMinutes = 15 } = req.body;

    // For demo, use test user ID
    const user_id = '00000000-0000-0000-0000-000000000123';

    // Get default wallet
    const walletResult = await pool.query(`
      SELECT id, currency
      FROM molam_wallets
      WHERE user_id = $1 AND is_default = true
      LIMIT 1
    `, [user_id]);

    if (walletResult.rows.length === 0) {
      return res.status(404).json({ error: 'No default wallet found' });
    }

    const wallet = walletResult.rows[0];

    // Create QR token
    const tokenResult = await pool.query(`
      INSERT INTO wallet_qr_tokens (wallet_id, user_id, purpose, currency, expires_at, description)
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${expiryMinutes} minutes', 'QR code for payment')
      RETURNING *
    `, [wallet.id, user_id, purpose, wallet.currency]);

    const qrToken = tokenResult.rows[0];

    // Build QR URL (format: molam://wallet/pay?token=...)
    const qr_url = `molam://wallet/pay?token=${encodeURIComponent(qrToken.token)}`;
    const deep_link = qr_url;

    res.json({
      token: qrToken.token,
      expires_at: qrToken.expires_at,
      qr_url: qr_url,
      deep_link: deep_link
    });
  } catch (error) {
    console.error('❌ Generate QR failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// React Wallet App - Handle client-side routing
// ============================================================================

// Catch-all route for React wallet app (must be before 404 handler)
app.get('/wallet-react/*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'brique-149a-wallet/web/build/index.html'));
});

// Catch-all route for React merchant dashboard (must be before 404 handler)
app.get('/merchant-dashboard/*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'brique-149b-connect/web/build/index.html'));
});

// ============================================================================
// 404 Handler
// ============================================================================

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// ============================================================================
// Error Handler
// ============================================================================

app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================================================
// Start Server
// ============================================================================

const server = app.listen(PORT, HOST, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 MOLAM CONNECT SERVER STARTED');
  console.log('='.repeat(60));
  console.log(`\n📍 Server URL: http://${HOST}:${PORT}`);
  console.log(`📍 API Base: http://${HOST}:${PORT}/api/v1`);
  console.log(`📍 Dashboard: http://${HOST}:${PORT}/dashboard`);
  console.log(`📍 Health Check: http://${HOST}:${PORT}/health`);
  console.log('\n' + '='.repeat(60));
  console.log('Available APIs:');
  console.log('\n  Brique 104-106: Basic Payment APIs');
  console.log('  POST /api/v1/payment_intents');
  console.log('  GET  /api/v1/payment_intents/:id');
  console.log('  POST /api/v1/payment_intents/:id/confirm');
  console.log('  POST /api/v1/auth/decide');
  console.log('  POST /api/v1/otp/create');
  console.log('  POST /api/v1/otp/verify');
  console.log('  POST /api/v1/customers');
  console.log('\n  Brique 107: Offline Fallback (QR + USSD)');
  console.log('  POST /api/v1/qr/create');
  console.log('  GET  /api/v1/qr/verify/:id');
  console.log('  POST /api/v1/ussd/callback');
  console.log('\n  Brique 108: PaymentIntent (3DS2 + Webhooks)');
  console.log('  POST /api/v1/payment-intents');
  console.log('  GET  /api/v1/payment-intents/:id');
  console.log('  POST /api/v1/payment-intents/:id/confirm');
  console.log('  POST /api/v1/payment-intents/:id/capture');
  console.log('  POST /api/v1/payment-intents/:id/cancel');
  console.log('  POST /api/v1/payment-intents/:id/refund');
  console.log('  POST /api/v1/3ds/callback');
  console.log('\n  Brique 109: Checkout Widgets & Tokenization');
  console.log('  POST /api/v1/checkout/create_session');
  console.log('  GET  /api/v1/checkout/session/:id');
  console.log('  POST /api/v1/checkout/confirm');
  console.log('  GET  /api/v1/checkout/session/:id/qr');
  console.log('  POST /api/v1/checkout/session/:id/cancel');
  console.log('  POST /api/v1/tokens (PCI-compliant tokenization)');
  console.log('\n  Widget Demo: http://localhost:3000/brique-109/web/CheckoutWidget.html');
  console.log('\n  Brique 110: Plugin Telemetry & Upgrade Notifications');
  console.log('  POST /api/v1/plugins/heartbeat');
  console.log('  POST /api/v1/plugins/event');
  console.log('  GET  /api/v1/plugins/list');
  console.log('  GET  /api/v1/plugins/:id');
  console.log('  POST /api/v1/plugins/:id/toggle');
  console.log('  POST /api/v1/plugins/:id/notify-upgrade');
  console.log('  GET  /api/v1/plugins/stats/overview');
  console.log('\n  Ops Dashboard: http://localhost:3000/ops/plugins');
  console.log('\n  Brique 110bis: Auto-Healing & Interop Layer');
  console.log('  POST /api/v1/plugins/autoheal');
  console.log('  POST /api/v1/plugins/autoheal/:id/apply');
  console.log('  POST /api/v1/plugins/autoheal/:id/rollback');
  console.log('  GET  /api/v1/plugins/autoheal/logs');
  console.log('  GET  /api/v1/plugins/autoheal/stats');
  console.log('  GET  /api/v1/plugins/autoheal/commands/:plugin_id');
  console.log('  POST /api/v1/plugins/interop/event');
  console.log('  GET  /api/v1/plugins/interop/events');
  console.log('  GET  /api/v1/plugins/interop/stats');
  console.log('  POST /api/v1/plugins/interop/mappings');
  console.log('\n  Auto-Healing Console: http://localhost:3000/ops/autohealing');
  console.log('\n  Brique 111-2: AI Config Advisor (SIRA)');
  console.log('  POST /api/ai-recommendations');
  console.log('  GET  /api/ai-recommendations');
  console.log('  GET  /api/ai-recommendations/:id');
  console.log('  POST /api/ai-recommendations/:id/approve');
  console.log('  POST /api/ai-recommendations/:id/apply');
  console.log('  POST /api/ai-recommendations/:id/rollback');
  console.log('  POST /api/ai-recommendations/:id/reject');
  console.log('  GET  /api/ai-recommendations/:id/evidence');
  console.log('  GET  /api/ai-recommendations/:id/audit');
  console.log('  GET  /api/ai-recommendations/stats/metrics');
  console.log('\n  AI Advisor Panel: http://localhost:3000/ops/ai-advisor');
  console.log('\n  Brique 112: SIRA Training & Data Pipeline');
  console.log('  POST /api/sira/ingest');
  console.log('  POST /api/sira/label');
  console.log('  GET  /api/sira/dataset/summary');
  console.log('  GET  /api/sira/dataset/labels');
  console.log('  GET  /api/sira/models');
  console.log('  POST /api/sira/models');
  console.log('  GET  /api/sira/models/:id');
  console.log('  POST /api/sira/models/:id/promote');
  console.log('  POST /api/sira/models/:id/metrics');
  console.log('  GET  /api/sira/models/:id/metrics');
  console.log('  GET  /api/sira/canary/:product');
  console.log('  POST /api/sira/canary/:product');
  console.log('  POST /api/sira/canary/:product/stop');
  console.log('  GET  /api/sira/canary/:product/health');
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n⏳ SIGTERM received, shutting down gracefully...');

  server.close(async () => {
    console.log('✅ HTTP server closed');

    try {
      await pool.end();
      console.log('✅ Database connections closed');

      redis.disconnect();
      console.log('✅ Redis disconnected');

      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', () => {
  console.log('\n⏳ SIGINT received, shutting down...');
  process.exit(0);
});

module.exports = app;
