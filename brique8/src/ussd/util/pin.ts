import { Pool } from "pg";
import { pool } from '../../config/database';
import * as argon2 from "argon2";

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

export async function verifyPin(userId: string, pin: string): Promise<boolean> {
    try {
        const result = await db.query(
            `SELECT pin_hash FROM molam_users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return false;
        }

        const pinHash = result.rows[0].pin_hash;
        return await argon2.verify(pinHash, pin);
    } catch (error) {
        console.error("PIN verification error:", error);
        return false;
    }
}

export async function requirePinIfSensitive(session: any): Promise<void> {
    if (!session.ctx) session.ctx = {};
    if (!session.ctx.pin_ok) return;
}