/**
 * Brique 48 - Radar Molam
 * PostgreSQL Database Connection
 */

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/molam_radar";

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

export default pool;
