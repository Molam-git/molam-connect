// src/utils/referenceGenerator.ts
import { v4 as uuidv4 } from 'uuid';

export class ReferenceGenerator {
    static generateTransferReference(): string {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const randomPart = uuidv4().slice(0, 8).toUpperCase();
        return `TRF-${dateStr}-${randomPart}`;
    }

    static generateQRReference(): string {
        const randomPart = uuidv4().slice(0, 12).toUpperCase();
        return `QR-${randomPart}`;
    }
}