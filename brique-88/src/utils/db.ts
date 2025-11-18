// Database utilities (shared with Brique 86 & 87)
import { Pool } from 'pg';

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

export async function withTransaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
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
