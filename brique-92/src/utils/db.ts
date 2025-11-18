// Database utilities
import { Pool, PoolClient } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_POOL_MAX || '20'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

/**
 * Execute a callback within a transaction
 */
export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
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
 * Execute a query with retry logic
 */
export async function queryWithRetry<T = any>(
  queryText: string,
  values?: any[],
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await pool.query(queryText, values);
      return result.rows as T;
    } catch (error: any) {
      lastError = error;

      // Don't retry on application errors
      if (error.code === '23505' || error.code === '23503') {
        // Unique violation or foreign key violation
        throw error;
      }

      // Wait before retry
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError;
}

export default pool;
