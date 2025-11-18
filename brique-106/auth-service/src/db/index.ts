/**
 * Database Connection Pool
 *
 * PostgreSQL connection management with health checks
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '../utils/logger';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Event listeners
pool.on('connect', (client) => {
  logger.debug('New database client connected');
});

pool.on('error', (err, client) => {
  logger.error({ err }, 'Unexpected error on idle database client');
});

pool.on('remove', (client) => {
  logger.debug('Database client removed from pool');
});

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1 as health');
    return result.rows[0]?.health === 1;
  } catch (error) {
    logger.error({ error }, 'Database health check failed');
    return false;
  }
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}

// Export pool and query methods
export { pool };

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    logger.debug({
      query: text.substring(0, 100),
      duration,
      rows: result.rowCount,
    }, 'Database query executed');

    return result;
  } catch (error) {
    logger.error({
      error,
      query: text.substring(0, 100),
      params,
    }, 'Database query error');
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}
