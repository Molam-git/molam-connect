import crypto from 'crypto';
import fs from 'fs';
import { config } from '../config.js';

export function sha256File(path: string): Promise<string> {
    const h = crypto.createHash('sha256');
    const stream = fs.createReadStream(path);
    return new Promise<string>((resolve, reject) => {
        stream.on('data', d => h.update(d));
        stream.on('error', reject);
        stream.on('end', () => resolve(h.digest('hex')));
    });
}

export async function signDigest(hexDigest: string): Promise<{ algo: string, signature: string }> {
    if (config.signature.algo === 'ED25519') {
        const key = crypto.createPrivateKey(config.signature.ed25519PrivateKeyPem);
        const sig = crypto.sign(null, Buffer.from(hexDigest, 'hex'), key);
        return { algo: 'ED25519', signature: sig.toString('base64') };
    }
    const mac = crypto.createHmac('sha256', config.signature.hmacSecret)
        .update(hexDigest).digest('hex');
    return { algo: 'HMAC-SHA256', signature: mac };
}