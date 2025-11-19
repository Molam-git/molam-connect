/**
 * Brique 111 - Merchant Config UI
 * Database connection pool (PostgreSQL)
 */

import { Pool, PoolClient } from "pg";

// Initialize connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Health check
pool.on("error", (err) => {
  console.error("Unexpected database error:", err);
  process.exit(-1);
});

/**
 * Transaction helper
 * Usage: await tx(async (client) => { ... })
 */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Simple query helper (non-transactional)
 */
export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing database connections...");
  await pool.end();
});


