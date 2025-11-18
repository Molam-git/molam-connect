/**
 * Database connection pool and utilities
 * PostgreSQL connection with connection pooling for high performance
 */

import { Pool, PoolClient, QueryResult } from 'pg';

// Create connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Pool error handling
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

/**
 * Execute a function within a database transaction
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
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
 * Health check for database connection
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result: QueryResult = await pool.query('SELECT NOW() as now, version() as version');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  const result = await pool.query(`
    SELECT
      (SELECT count(*) FROM routing_decisions) as total_decisions,
      (SELECT count(*) FROM routing_rules WHERE is_active = true) as active_rules,
      (SELECT count(*) FROM routing_failures WHERE status = 'pending') as pending_failures,
      NOW() as timestamp
  `);
  return result.rows[0];
}

export default pool;
