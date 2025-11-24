// api/src/utils/crypto.ts
import { createHash, randomBytes } from 'crypto';

export function computeSHA256FromBuffer(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
}

export function computeSHA256FromString(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
}

export function generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
}

export function encryptSensitiveData(data: string, key: string): string {
    const cipher = createHash('sha256');
    cipher.update(data + key);
    return cipher.digest('hex');
}

export function validateChecksum(data: Buffer | string, expectedChecksum: string): boolean {
    let actualChecksum: string;

    if (Buffer.isBuffer(data)) {
        actualChecksum = computeSHA256FromBuffer(data);
    } else {
        // Utiliser une assertion de type pour forcer TypeScript
        actualChecksum = computeSHA256FromString(data as string);
    }

    return actualChecksum === expectedChecksum;
}

// Version encore plus simple et sécurisée
export function computeSHA256(data: Buffer | string): string {
    const hash = createHash('sha256');

    if (Buffer.isBuffer(data)) {
        hash.update(data);
    } else {
        hash.update(data, 'utf8');
    }

    return hash.digest('hex');
}

export function validateChecksumV2(data: Buffer | string, expectedChecksum: string): boolean {
    const actualChecksum = computeSHA256(data);
    return actualChecksum === expectedChecksum;
}

export function generateDocumentId(): string {
    return `doc_${Date.now()}_${generateSecureToken(8)}`;
}