/**
 * BRIQUE 140 — Crypto utilities
 */

import crypto from 'crypto';

export function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function vaultGenerateRandom(bytes: number = 48): Promise<string> {
  return crypto.randomBytes(bytes).toString('base64');
}

export function computeHMAC(secret: string, data: Buffer | string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}
