import * as crypto from 'crypto';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-secret-key';

export function generateHmacSignature(payload: string, timestamp: string, nonce: string): string {
    const data = `${timestamp}.${nonce}.${payload}`;
    return crypto.createHmac('sha256', WEBHOOK_SECRET).update(data).digest('hex');
}

export function verifyHmacSignature(payload: string, signature: string, timestamp: string, nonce: string): boolean {
    const expectedSignature = generateHmacSignature(payload, timestamp, nonce);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}