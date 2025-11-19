/**
 * Brique 113: Database Connection Pool
 */

import { Pool } from 'pg';
import { logger } from './utils/logger';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/molam',
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

// Test connection on startup
pool.query('SELECT NOW()')
  .then(() => logger.info('Database connected'))
  .catch((err) => {
    logger.error('Database connection failed', { error: err.message });
    process.exit(1);
  });

export { pool };
