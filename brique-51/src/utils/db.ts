/**
 * Brique 51 - Refunds & Reversals
 * Database Connection Pool
 */

import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://molam:molam@localhost:5432/molam_refunds",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err: Error) => {
  console.error("Unexpected database error:", err);
});

export async function testConnection(): Promise<boolean> {
  try {
    const { rows } = await pool.query("SELECT 1 as result");
    return rows[0].result === 1;
  } catch (err) {
    console.error("Database connection failed:", err);
    return false;
  }
}
