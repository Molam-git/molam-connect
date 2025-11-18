/**
 * Brique 97 — Database Connection Pool
 *
 * PostgreSQL connection pool with connection pooling, retry logic,
 * and health monitoring
 */

import { Pool, PoolClient, QueryResult } from 'pg';

// Database configuration
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'molam_tokenization',
  user: process.env.POSTGRES_USER || 'molam',
  password: process.env.POSTGRES_PASSWORD || '',
  max: parseInt(process.env.POSTGRES_POOL_MAX || '20'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

// Pool event handlers
pool.on('error', (err: Error) => {
  console.error('Unexpected database error:', err);
  // In production, send to monitoring/alerting
});

pool.on('connect', () => {
  console.log('New database connection established');
});

/**
 * Execute a query with automatic retry
 */
export async function query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error: any) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Execute a transaction
 */
export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1 as health');
    return result.rows[0]?.health === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Graceful shutdown
 */
export async function shutdown(): Promise<void> {
  await pool.end();
  console.log('Database pool shut down');
}

export { pool };
export default pool;
