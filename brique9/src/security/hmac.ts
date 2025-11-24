import crypto from 'crypto';

export function signWebhook(secret: string, body: string): string {
    return crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('hex');
}

export function verifyWebhook(sig: string, secret: string, body: string): boolean {
    const expected = signWebhook(secret, body);
    return crypto.timingSafeEqual(
        Buffer.from(sig, 'hex'),
        Buffer.from(expected, 'hex')
    );
}