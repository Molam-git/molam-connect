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

    const clientSecret = `pi_${require('uuid').v4()}_secret_${require('uuid').v4()}`;

    const result = await pool.query(
      `INSERT INTO payment_intents (amount, currency, customer_id, description, metadata, client_secret, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [amount, currency || 'USD', customer_id || null, description || null, JSON.stringify(metadata || {}), clientSecret]
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

    // Log decision
    const result = await pool.query(
      `INSERT INTO auth_decisions (
        payment_id, user_id, country, device_fingerprint, device_ip,
        risk_score, recommended_method, final_method, amount, currency, bin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id`,
      [
        payment_id, user_id || null, country, device?.fingerprint || null, device?.ip || null,
        riskScore, recommended, recommended, amount, currency, bin || null
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

    const result = await pool.query(
      `INSERT INTO customers (email, name, phone, country, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         country = EXCLUDED.country,
         updated_at = now()
       RETURNING *`,
      [email, name || null, phone || null, country || null, JSON.stringify(metadata || {})]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Customer creation failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
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
  console.log('  POST /api/v1/payment_intents');
  console.log('  GET  /api/v1/payment_intents/:id');
  console.log('  POST /api/v1/payment_intents/:id/confirm');
  console.log('  POST /api/v1/auth/decide');
  console.log('  POST /api/v1/otp/create');
  console.log('  POST /api/v1/otp/verify');
  console.log('  POST /api/v1/customers');
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
