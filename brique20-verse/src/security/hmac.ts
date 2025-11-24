import crypto from 'crypto';

export function verifyHmacSignature(payload: string, signature: string, secret: string) {
    const mac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(signature));
}