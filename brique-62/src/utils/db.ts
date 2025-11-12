import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function healthCheck(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1');
    return result.rowCount === 1;
  } catch (error) {
    console.error('[DB] Health check failed:', error);
    return false;
  }
}

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
});
