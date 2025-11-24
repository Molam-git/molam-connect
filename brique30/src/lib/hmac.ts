import { createHmac, timingSafeEqual } from 'crypto';

export function verifySignature(payload: string, signature: string, secret: string): boolean {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    const computedSignature = hmac.digest('hex');
    return timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature));
}