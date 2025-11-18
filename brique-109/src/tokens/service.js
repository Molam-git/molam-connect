// src/tokens/service.js
// Tokenization Service - PCI-compliant token generation for cards
// Served from tokens.molam.com (isolated domain for PCI SAQ-A scope)

const crypto = require('crypto');

let pool; // Initialized by setPool()

/**
 * Mask PAN for display (only show last 4 digits)
 * @param {string} pan - Card number
 * @returns {string} Masked PAN
 */
function maskPan(pan) {
  if (!pan || pan.length < 4) return '****';
  return '**** **** **** ' + pan.slice(-4);
}

/**
 * Validate card number using Luhn algorithm
 * @param {string} pan - Card number
 * @returns {boolean} Valid or not
 */
function validateLuhn(pan) {
  const digits = pan.replace(/\D/g, '');
  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Detect card brand from PAN
 * @param {string} pan - Card number
 * @returns {string} Card brand
 */
function detectCardBrand(pan) {
  const firstDigit = pan[0];
  const firstTwo = pan.substring(0, 2);
  const firstFour = pan.substring(0, 4);

  if (firstDigit === '4') return 'visa';
  if (['51', '52', '53', '54', '55'].includes(firstTwo) || (parseInt(firstFour) >= 2221 && parseInt(firstFour) <= 2720)) return 'mastercard';
  if (['34', '37'].includes(firstTwo)) return 'amex';
  if (firstFour === '6011' || firstTwo === '65') return 'discover';
  if (['3528', '3589'].some(prefix => firstFour.startsWith(prefix))) return 'jcb';

  return 'unknown';
}

/**
 * Encrypt PAN using AES-256-GCM (mock KMS - replace with real HSM/KMS in production)
 * @param {string} pan - Card number
 * @returns {Object} { encryptedBlob, iv, authTag }
 */
function encryptWithKMS(pan) {
  // Mock encryption - in production, use AWS KMS, Azure Key Vault, or HSM
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || '0'.repeat(64), 'hex'); // 32 bytes
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(pan, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encryptedBlob: Buffer.from(encrypted, 'hex'),
    iv: iv,
    authTag: authTag
  };
}

/**
 * Decrypt PAN (for provider charge processing only)
 * @param {Buffer} encryptedBlob - Encrypted data
 * @param {Buffer} iv - Initialization vector
 * @param {Buffer} authTag - Authentication tag
 * @returns {string} Decrypted PAN
 */
function decryptWithKMS(encryptedBlob, iv, authTag) {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || '0'.repeat(64), 'hex');

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedBlob, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate card fingerprint (for deduplication)
 * @param {string} pan - Card number
 * @param {number} exp_month - Expiry month
 * @param {number} exp_year - Expiry year
 * @returns {string} Fingerprint hash
 */
function generateFingerprint(pan, exp_month, exp_year) {
  const data = `${pan}:${exp_month}:${exp_year}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Create payment method token
 * @param {Object} params - Token parameters
 * @returns {Promise<Object>} Created token
 */
async function createToken({
  pan,
  exp_month,
  exp_year,
  cvc,
  name,
  billing_country,
  usage = 'single',
  merchant_id = null,
  customer_id = null,
  vault_consent = false
}) {
  // Validate card number
  const cleanPan = pan.replace(/\s/g, '');

  if (!validateLuhn(cleanPan)) {
    throw new Error('invalid_card_number');
  }

  // Validate expiry
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (exp_year < currentYear || (exp_year === currentYear && exp_month < currentMonth)) {
    throw new Error('card_expired');
  }

  // Detect card brand
  const card_brand = detectCardBrand(cleanPan);

  // Encrypt PAN
  const { encryptedBlob, iv, authTag } = encryptWithKMS(cleanPan);

  // Combine encrypted data
  const fullEncryptedBlob = Buffer.concat([iv, authTag, encryptedBlob]);

  // Generate masked PAN
  const masked_pan = maskPan(cleanPan);

  // Generate fingerprint
  const fingerprint = generateFingerprint(cleanPan, exp_month, exp_year);

  // Generate token ID
  const tokenPrefix = usage === 'multi' ? 'card_vault' : 'card_tok';
  const token = `${tokenPrefix}_${crypto.randomBytes(16).toString('hex')}`;

  // Set expiry (single-use: 1 hour, multi-use: card expiry)
  const expires_at = usage === 'single'
    ? new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    : new Date(exp_year, exp_month, 0); // Last day of expiry month

  // Insert into database
  const { rows } = await pool.query(
    `INSERT INTO payment_method_tokens
     (token, type, usage, encrypted_blob, masked_pan, card_brand, exp_month, exp_year,
      billing_country, cardholder_name, fingerprint, merchant_id, customer_id,
      vault_consent, vault_consent_at, expires_at, status)
     VALUES ($1, 'card', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active')
     RETURNING *`,
    [
      token,
      usage,
      fullEncryptedBlob,
      masked_pan,
      card_brand,
      exp_month,
      exp_year,
      billing_country,
      name,
      fingerprint,
      merchant_id,
      customer_id,
      vault_consent,
      vault_consent ? new Date() : null,
      expires_at
    ]
  );

  const tokenRecord = rows[0];

  // Log tokenization event
  await pool.query(
    `INSERT INTO tokenization_events (token_id, event_type, merchant_id, metadata)
     VALUES ($1, 'created', $2, $3)`,
    [tokenRecord.id, merchant_id, JSON.stringify({ card_brand, usage })]
  );

  console.log(`[TOKENIZATION] Token created: ${token} - ${card_brand} ${masked_pan}`);

  return {
    token: tokenRecord.token,
    masked_pan: tokenRecord.masked_pan,
    card_brand: tokenRecord.card_brand,
    exp_month: tokenRecord.exp_month,
    exp_year: tokenRecord.exp_year,
    fingerprint: tokenRecord.fingerprint,
    usage: tokenRecord.usage,
    expires_at: tokenRecord.expires_at
  };
}

/**
 * Retrieve token details
 * @param {string} token - Token ID
 * @returns {Promise<Object>} Token details
 */
async function getToken(token) {
  const { rows } = await pool.query(
    'SELECT * FROM payment_method_tokens WHERE token = $1',
    [token]
  );

  if (rows.length === 0) {
    throw new Error('token_not_found');
  }

  const tokenRecord = rows[0];

  if (tokenRecord.status === 'expired') {
    throw new Error('token_expired');
  }

  if (tokenRecord.status === 'revoked') {
    throw new Error('token_revoked');
  }

  if (tokenRecord.status === 'used' && tokenRecord.usage === 'single') {
    throw new Error('token_already_used');
  }

  return tokenRecord;
}

/**
 * Mark token as used
 * @param {string} token - Token ID
 * @returns {Promise<void>}
 */
async function markTokenUsed(token) {
  const tokenRecord = await getToken(token);

  await pool.query(
    `UPDATE payment_method_tokens
     SET used_count = used_count + 1,
         last_used_at = now(),
         status = CASE WHEN usage = 'single' THEN 'used' ELSE 'active' END
     WHERE token = $1`,
    [token]
  );

  // Log usage event
  await pool.query(
    `INSERT INTO tokenization_events (token_id, event_type, merchant_id)
     VALUES ($1, 'used', $2)`,
    [tokenRecord.id, tokenRecord.merchant_id]
  );

  console.log(`[TOKENIZATION] Token used: ${token}`);
}

/**
 * Revoke token (for vaulted cards)
 * @param {string} token - Token ID
 * @returns {Promise<void>}
 */
async function revokeToken(token) {
  const tokenRecord = await getToken(token);

  await pool.query(
    `UPDATE payment_method_tokens
     SET status = 'revoked'
     WHERE token = $1`,
    [token]
  );

  // Log revocation event
  await pool.query(
    `INSERT INTO tokenization_events (token_id, event_type, merchant_id)
     VALUES ($1, 'revoked', $2)`,
    [tokenRecord.id, tokenRecord.merchant_id]
  );

  console.log(`[TOKENIZATION] Token revoked: ${token}`);
}

/**
 * Set database pool
 */
function setPool(dbPool) {
  pool = dbPool;
}

module.exports = {
  setPool,
  createToken,
  getToken,
  markTokenUsed,
  revokeToken,
  maskPan,
  validateLuhn,
  detectCardBrand,
  encryptWithKMS,
  decryptWithKMS
};
