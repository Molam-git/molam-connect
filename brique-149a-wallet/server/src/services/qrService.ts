/**
 * QR Service
 * Generates and verifies QR tokens for wallet payments/transfers
 * Tokens are signed, time-limited, and single-use
 */
import crypto from 'crypto';
import { pool } from '../utils/db';

export interface QrToken {
  token: string;
  userId: string;
  purpose: 'receive' | 'pay' | 'transfer';
  amount?: number;
  currency: string;
  expiresAt: Date;
  usedAt?: Date;
  usedBy?: string;
}

/**
 * Generate a new QR token
 * Token is stored in database with expiry (15 minutes default)
 */
export async function generateQrToken(
  userId: string,
  purpose: 'receive' | 'pay' | 'transfer',
  currency: string,
  amount?: number,
  expiryMinutes: number = 15
): Promise<{ token: string; expiresAt: Date }> {
  // Generate cryptographically secure random token
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  try {
    await pool.query(
      `INSERT INTO wallet_qr_tokens(token, user_id, purpose, amount, currency, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        token,
        userId,
        purpose,
        amount || null,
        currency,
        expiresAt,
        {
          generated_at: new Date().toISOString(),
          ip: null // Can be set from req.ip if needed
        }
      ]
    );

    return { token, expiresAt };
  } catch (error: any) {
    console.error('Failed to generate QR token:', error);
    throw new Error('Failed to generate QR token');
  }
}

/**
 * Verify QR token
 * Checks if token exists, not expired, and not used
 */
export async function verifyQrToken(token: string): Promise<QrToken> {
  const { rows } = await pool.query(
    `SELECT token, user_id, purpose, amount, currency, expires_at, used_at, used_by
     FROM wallet_qr_tokens
     WHERE token = $1
     LIMIT 1`,
    [token]
  );

  if (rows.length === 0) {
    throw new Error('token_not_found');
  }

  const record = rows[0];

  // Check if already used
  if (record.used_at) {
    throw new Error('token_already_used');
  }

  // Check if expired
  if (new Date(record.expires_at) < new Date()) {
    throw new Error('token_expired');
  }

  return {
    token: record.token,
    userId: record.user_id,
    purpose: record.purpose,
    amount: record.amount,
    currency: record.currency,
    expiresAt: new Date(record.expires_at),
    usedAt: record.used_at ? new Date(record.used_at) : undefined,
    usedBy: record.used_by
  };
}

/**
 * Mark QR token as used (atomic operation)
 * Returns true if marking succeeded, false if already used or expired
 * This ensures idempotency and prevents double-spending
 */
export async function markQrTokenUsed(
  token: string,
  usedBy: string
): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `UPDATE wallet_qr_tokens
       SET used_at = now(), used_by = $2, metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{used_at}',
         to_jsonb(now())
       )
       WHERE token = $1
         AND used_at IS NULL
         AND expires_at > now()
       RETURNING token, used_at`,
      [token, usedBy]
    );

    return rows.length === 1;
  } catch (error) {
    console.error('Failed to mark QR token as used:', error);
    return false;
  }
}

/**
 * Clean up expired QR tokens
 * Should be run periodically (e.g., via cron job)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM wallet_qr_tokens
       WHERE expires_at < now() - INTERVAL '7 days'`
    );

    console.log(`Cleaned up ${rowCount} expired QR tokens`);
    return rowCount || 0;
  } catch (error) {
    console.error('Failed to cleanup expired tokens:', error);
    return 0;
  }
}

/**
 * Get QR tokens for a user
 */
export async function getUserQrTokens(
  userId: string,
  includeExpired: boolean = false
): Promise<QrToken[]> {
  const query = includeExpired
    ? `SELECT * FROM wallet_qr_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`
    : `SELECT * FROM wallet_qr_tokens WHERE user_id = $1 AND expires_at > now() ORDER BY created_at DESC LIMIT 50`;

  const { rows } = await pool.query(query, [userId]);

  return rows.map(row => ({
    token: row.token,
    userId: row.user_id,
    purpose: row.purpose,
    amount: row.amount,
    currency: row.currency,
    expiresAt: new Date(row.expires_at),
    usedAt: row.used_at ? new Date(row.used_at) : undefined,
    usedBy: row.used_by
  }));
}

export default {
  generateQrToken,
  verifyQrToken,
  markQrTokenUsed,
  cleanupExpiredTokens,
  getUserQrTokens
};
