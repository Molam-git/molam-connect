/**
 * Brique 107 - QR Service
 *
 * Service for generating and verifying dynamic QR codes
 * Supports: payment requests, cash-in, agent receipts, withdrawals
 */

const crypto = require('crypto');
const QRCode = require('qrcode');

class QRService {
  constructor(pool, config = {}) {
    this.pool = pool;
    this.hmacSecret = config.hmacSecret || process.env.QR_HMAC_SECRET || 'default-secret-change-me';
    this.baseUrl = config.baseUrl || process.env.PAY_URL || 'http://localhost:3000';
    this.defaultTTL = config.defaultTTL || 300; // 5 minutes
  }

  /**
   * Create a dynamic QR code session
   */
  async createQRCode({ merchant_id, user_id, type = 'payment_request', amount, currency = 'XOF', metadata = {}, ttl }) {
    const expires = new Date(Date.now() + (ttl || this.defaultTTL) * 1000);

    // Build payload
    const payload = {
      merchant_id,
      user_id,
      type,
      amount,
      currency,
      metadata,
      exp: expires.toISOString(),
      iat: new Date().toISOString()
    };

    // Generate HMAC signature
    const payloadStr = JSON.stringify(payload);
    const hmac = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(payloadStr)
      .digest('hex');

    // Insert into database
    const result = await this.pool.query(
      `INSERT INTO qr_sessions
       (merchant_id, user_id, type, amount, currency, expires_at, payload, hmac, metadata, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING *`,
      [merchant_id, user_id, type, amount, currency, expires, payload, hmac, metadata]
    );

    const session = result.rows[0];

    // Generate QR code URL
    const qrUrl = `${this.baseUrl}/qr/pay/${session.id}?h=${hmac}`;

    // Generate QR code as data URL (PNG)
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 2
    });

    // Generate QR code as SVG
    const qrSvg = await QRCode.toString(qrUrl, {
      type: 'svg',
      errorCorrectionLevel: 'H'
    });

    // Record metric
    await this.recordMetric('qr_generated', session.currency?.substring(0, 2) || 'XX', 'qr', amount);

    return {
      id: session.id,
      url: qrUrl,
      qr_data_url: qrDataUrl,
      qr_svg: qrSvg,
      hmac,
      amount,
      currency,
      type,
      expires_at: expires,
      created_at: session.created_at
    };
  }

  /**
   * Verify QR code and return session info
   */
  async verifyQRCode(qrId, providedHmac) {
    // Fetch session
    const result = await this.pool.query(
      `SELECT * FROM qr_sessions WHERE id = $1`,
      [qrId]
    );

    if (result.rows.length === 0) {
      throw new Error('QR code not found');
    }

    const session = result.rows[0];

    // Check HMAC
    if (session.hmac !== providedHmac) {
      throw new Error('Invalid QR code signature');
    }

    // Check expiry
    if (new Date() > new Date(session.expires_at)) {
      await this.pool.query(
        `UPDATE qr_sessions SET status = 'expired' WHERE id = $1`,
        [qrId]
      );
      throw new Error('QR code expired');
    }

    // Check if already used
    if (session.status === 'completed') {
      throw new Error('QR code already used');
    }

    if (session.status === 'cancelled') {
      throw new Error('QR code cancelled');
    }

    // Record scan metric
    await this.recordMetric('qr_scanned', session.currency?.substring(0, 2) || 'XX', 'qr', session.amount);

    return {
      id: session.id,
      type: session.type,
      amount: session.amount,
      currency: session.currency,
      merchant_id: session.merchant_id,
      user_id: session.user_id,
      payload: session.payload,
      metadata: session.metadata,
      status: session.status,
      expires_at: session.expires_at,
      created_at: session.created_at
    };
  }

  /**
   * Mark QR code as scanned
   */
  async markScanned(qrId, scannedBy) {
    const result = await this.pool.query(
      `UPDATE qr_sessions
       SET status = 'scanned', scanned_at = now(), scanned_by = $2, updated_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [qrId, scannedBy]
    );

    if (result.rows.length === 0) {
      throw new Error('QR code not found or already processed');
    }

    return result.rows[0];
  }

  /**
   * Complete QR code payment
   */
  async completeQRPayment(qrId, paymentData = {}) {
    const result = await this.pool.query(
      `UPDATE qr_sessions
       SET status = 'completed', completed_at = now(), updated_at = now(),
           metadata = metadata || $2::jsonb
       WHERE id = $1 AND status IN ('pending', 'scanned')
       RETURNING *`,
      [qrId, JSON.stringify(paymentData)]
    );

    if (result.rows.length === 0) {
      throw new Error('QR code not found or already completed');
    }

    const session = result.rows[0];

    // Record completion metric
    await this.recordMetric('qr_completed', session.currency?.substring(0, 2) || 'XX', 'qr', session.amount);

    return session;
  }

  /**
   * Cancel QR code
   */
  async cancelQRCode(qrId) {
    const result = await this.pool.query(
      `UPDATE qr_sessions
       SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [qrId]
    );

    if (result.rows.length === 0) {
      throw new Error('QR code not found or already processed');
    }

    return result.rows[0];
  }

  /**
   * Get QR session by ID
   */
  async getQRSession(qrId) {
    const result = await this.pool.query(
      `SELECT * FROM qr_sessions WHERE id = $1`,
      [qrId]
    );

    if (result.rows.length === 0) {
      throw new Error('QR session not found');
    }

    return result.rows[0];
  }

  /**
   * List QR sessions with filters
   */
  async listQRSessions({ merchant_id, user_id, status, limit = 20, offset = 0 }) {
    let query = `SELECT * FROM qr_sessions WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (merchant_id) {
      params.push(merchant_id);
      query += ` AND merchant_id = $${paramIndex++}`;
    }

    if (user_id) {
      params.push(user_id);
      query += ` AND user_id = $${paramIndex++}`;
    }

    if (status) {
      params.push(status);
      query += ` AND status = $${paramIndex++}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);

    return result.rows;
  }

  /**
   * Cleanup expired QR codes
   */
  async cleanupExpired() {
    const result = await this.pool.query(
      `UPDATE qr_sessions
       SET status = 'expired', updated_at = now()
       WHERE status = 'pending' AND expires_at < now()
       RETURNING id`
    );

    return result.rows.length;
  }

  /**
   * Record metric
   */
  async recordMetric(metricType, countryCode, channel, value) {
    try {
      await this.pool.query(
        `INSERT INTO offline_metrics (metric_type, country_code, channel, value)
         VALUES ($1, $2, $3, $4)`,
        [metricType, countryCode, channel, value]
      );
    } catch (error) {
      console.error('Failed to record metric:', error);
    }
  }

  /**
   * Get QR statistics
   */
  async getQRStats({ startDate, endDate, countryCode }) {
    let query = `
      SELECT
        metric_type,
        country_code,
        COUNT(*) as count,
        SUM(value) as total_value,
        AVG(value) as avg_value
      FROM offline_metrics
      WHERE channel = 'qr'
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      params.push(startDate);
      query += ` AND recorded_at >= $${paramIndex++}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND recorded_at <= $${paramIndex++}`;
    }

    if (countryCode) {
      params.push(countryCode);
      query += ` AND country_code = $${paramIndex++}`;
    }

    query += ` GROUP BY metric_type, country_code ORDER BY count DESC`;

    const result = await this.pool.query(query, params);

    return result.rows;
  }
}

module.exports = QRService;
