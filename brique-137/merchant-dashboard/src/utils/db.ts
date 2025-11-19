// ============================================================================
// Database Connection Pool
// ============================================================================

import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/molam_merchant";

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("Unexpected pool error", err);
  process.exit(-1);
});
