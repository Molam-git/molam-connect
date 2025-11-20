/**
 * BRIQUE 140 — API Key Authentication Middleware
 * Format: X-API-Key: {key_id}:{hmac_signature}
 */

import { Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import { getActiveOrRetiringSecrets } from '../utils/vault';
import crypto from 'crypto';

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const hdr = (req.headers['x-api-key'] || '') as string;

  if (!hdr) {
    return res.status(401).json({ error: 'missing_api_key' });
  }

  const parts = hdr.split(':');
  const keyId = parts[0];
  const sig = parts[1] || '';

  if (!keyId) {
    return res.status(401).json({ error: 'invalid_api_key_format' });
  }

  // Check key exists and is active/retiring
  const { rows } = await pool.query(
    `SELECT * FROM dev_app_keys WHERE key_id = $1 AND status IN ($2, $3)`,
    [keyId, 'active', 'retiring']
  );

  if (!rows.length) {
    return res.status(401).json({ error: 'unknown_key' });
  }

  const meta = rows[0];

  // Get raw body for HMAC verification
  const raw = (req as any).rawBody || Buffer.from(JSON.stringify(req.body || {}));

  // Get all active/retiring secrets (supports rotation)
  const secrets = await getActiveOrRetiringSecrets(keyId);

  if (!secrets.length) {
    return res.status(401).json({ error: 'secret_not_found' });
  }

  // Try all secrets (for rotation grace period)
  let authenticated = false;
  for (const s of secrets) {
    const expected = crypto
      .createHmac('sha256', s.secret)
      .update(raw)
      .digest('hex');
    try {
      if (timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig || '', 'hex'))) {
        authenticated = true;
        break;
      }
    } catch (e) {
      // Continue to next secret
    }
  }

  if (!authenticated) {
    return res.status(401).json({ error: 'invalid_signature' });
  }

  // Attach dev context
  (req as any).dev = {
    key_id: keyId,
    app_id: meta.app_id,
    env: meta.metadata?.environment || meta.environment,
  };

  next();
}

/**
 * Helper to get active/retiring secrets for a key
 */
export async function getActiveOrRetiringSecrets(
  keyId: string
): Promise<Array<{ kid: number; secret: string }>> {
  const { rows } = await pool.query(
    `SELECT kid FROM dev_app_keys
     WHERE key_id = $1 AND status IN ('active', 'retiring')
     ORDER BY kid ASC`,
    [keyId]
  );

  const { vaultGetSecret } = await import('../utils/vault');
  const secrets: Array<{ kid: number; secret: string }> = [];

  for (const r of rows) {
    const path = `dev/keys/${keyId}/v${r.kid}`;
    const secret = await vaultGetSecret(path);
    if (secret) {
      secrets.push({ kid: Number(r.kid), secret });
    }
  }

  return secrets;
}
