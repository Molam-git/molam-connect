// ============================================================================
// Brique 44 - Anti-fraude Temps Réel
// Database Connection (PostgreSQL)
// ============================================================================

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/molam_fraud";

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  console.error("Unexpected database error:", err);
  process.exit(-1);
});

// Health check
export async function checkDbHealth(): Promise<boolean> {
  try {
    const result = await pool.query("SELECT 1");
    return result.rows.length === 1;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}

// Graceful shutdown
export async function closeDb(): Promise<void> {
  await pool.end();
}
