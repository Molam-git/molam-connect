import { PoolConfig } from 'pg';

export const config: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  database: process.env.DB_NAME || 'molam_pay',
  user: process.env.DB_USER || 'molam_user',
  password: process.env.DB_PASSWORD || 'molam_password_secure',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};