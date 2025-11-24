import { pool } from "../db";
import crypto from "crypto";

export async function appendAudit(actor: string | null, event_type: string, payload: any): Promise<void> {
    try {
        // Get previous hash for chain
        const prevHashResult = await pool.query(
            "SELECT hash FROM ops_audit ORDER BY id DESC LIMIT 1"
        );
        const prev_hash = prevHashResult.rows[0]?.hash || "genesis";

        const timestamp = new Date().toISOString();
        const dataToHash = `${prev_hash}${JSON.stringify(payload)}${actor}${timestamp}`;
        const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');

        await pool.query(
            `INSERT INTO ops_audit(event_time, actor, event_type, payload, hash)
       VALUES($1,$2,$3,$4,$5)`,
            [timestamp, actor, event_type, { ...payload, signature: await signHash(hash) }, hash]
        );
    } catch (error) {
        console.error("Error appending audit:", error);
        throw error;
    }
}

async function signHash(hash: string): Promise<string> {
    // HSM/Vault implementation for production
    // For development, use a simple signature
    return `sig_${hash.substring(0, 16)}`;
}