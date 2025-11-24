// src/services/hmacService.ts
import crypto from 'crypto';

export class HmacService {
    private static secret = process.env.HMAC_SECRET!;

    static signPayload(payload: object): string {
        const data = Buffer.from(JSON.stringify(payload)).toString('base64');
        const signature = crypto.createHmac('sha256', this.secret)
            .update(data)
            .digest('hex');
        return `molampay:dyn:${data}:${signature}`;
    }

    static verifySignature(qrValue: string): boolean {
        const parts = qrValue.split(':');
        if (parts.length !== 4) return false;

        const [prefix, type, payload, signature] = parts;
        if (prefix !== 'molampay' || type !== 'dyn') return false;

        const expectedSig = crypto.createHmac('sha256', this.secret)
            .update(payload)
            .digest('hex');
        return signature === expectedSig;
    }

    static extractPayload(qrValue: string): any {
        const parts = qrValue.split(':');
        const payload = parts[2];
        return JSON.parse(Buffer.from(payload, 'base64').toString());
    }
}