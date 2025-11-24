import { db } from "../config";

// src/utils/idempotency.ts
export class IdempotencyUtils {
    private static processedKeys = new Set<string>();

    static async checkIdempotency(key: string): Promise<boolean> {
        if (this.processedKeys.has(key)) {
            return true;
        }

        // En production, on vérifierait en base de données
        const existing = await db.query(
            'SELECT id FROM payouts WHERE external_id = $1',
            [key]
        );

        return existing.rows.length > 0;
    }

    static markAsProcessed(key: string): void {
        this.processedKeys.add(key);
    }

    static generateIdempotencyKey(): string {
        return `idemp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}