// ============================================================================
// Database Connection Pool
// ============================================================================

import { Pool, PoolConfig } from "pg";
import { logger } from "./logger";

const config: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX || "20", 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000, // 10s query timeout
};

export const pool = new Pool(config);

// Log pool errors
pool.on("error", (err) => {
  logger.error("Unexpected database pool error", { error: err.message });
});

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await pool.query("SELECT 1");
    return result.rows.length === 1;
  } catch (error) {
    logger.error("Database health check failed", { error });
    return false;
  }
}

// Graceful shutdown
export async function closeDatabasePool(): Promise<void> {
  await pool.end();
  logger.info("Database pool closed");
}
