import { createHmac } from 'crypto';

const HMAC_SECRET = process.env.HMAC_SECRET!;

export function sign(payload: any): string {
    return createHmac('sha256', HMAC_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex');
}

export function verify(payload: any): boolean {
    const { signed, ...data } = payload;
    const expected = sign(data);
    return signed === expected;
}