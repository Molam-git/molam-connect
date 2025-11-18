// =====================================================================
// Database Connection Pool
// =====================================================================
// PostgreSQL connection pool using pg library
// Date: 2025-11-12
// =====================================================================

import { Pool, PoolConfig } from 'pg';

// Pool configuration
const poolConfig: PoolConfig = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'molam_connect',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  max: parseInt(process.env.PG_POOL_MAX || '20'),
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT || '5000'),
};

// Create pool
export const pool = new Pool(poolConfig);

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing database pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Closing database pool...');
  await pool.end();
  process.exit(0);
});

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1');
    return result.rows.length === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Export types
export type { Pool, PoolClient, QueryResult } from 'pg';
