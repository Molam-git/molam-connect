/**
 * BRIQUE 140 — Developer Portal
 * PostgreSQL connection pool
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err);
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn('[DB] Slow query:', { text, duration, params });
    }
    return result;
  } catch (error) {
    console.error('[DB] Query error:', { text, params, error });
    throw error;
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as ok');
    return result.rows[0].ok === 1;
  } catch (error) {
    console.error('[DB] Health check failed:', error);
    return false;
  }
}
