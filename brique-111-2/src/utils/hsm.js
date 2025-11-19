/**
 * Brique 111-2: HSM/Vault Signing Utility
 * Provides signature generation for approval tokens
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Sign approval payload with HSM or JWT
 * In production, this would use Vault Transit or HSM
 */
async function signWithHSM(payload) {
  // In production, use Vault Transit API or HSM
  // For now, use JWT with secret from environment
  const secret = process.env.APPROVAL_SIGNING_SECRET || 'molam-approval-secret-change-me';

  const token = jwt.sign(
    {
      ...payload,
      iss: 'molam-ai-advisor',
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour expiry
    },
    secret,
    {
      algorithm: 'HS256'
    }
  );

  return token;
}

/**
 * Verify approval signature
 */
async function verifySignature(token) {
  try {
    const secret = process.env.APPROVAL_SIGNING_SECRET || 'molam-approval-secret-change-me';

    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'molam-ai-advisor'
    });

    return { valid: true, payload: decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Create HMAC signature for data integrity
 */
function createHMAC(data, secret = null) {
  const hmacSecret = secret || process.env.APPROVAL_SIGNING_SECRET || 'molam-approval-secret-change-me';

  const hmac = crypto
    .createHmac('sha256', hmacSecret)
    .update(JSON.stringify(data))
    .digest('hex');

  return hmac;
}

/**
 * Verify HMAC signature
 */
function verifyHMAC(data, signature, secret = null) {
  const expected = createHMAC(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

module.exports = {
  signWithHSM,
  verifySignature,
  createHMAC,
  verifyHMAC
};
