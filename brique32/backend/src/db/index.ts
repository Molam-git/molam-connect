import { Pool } from 'pg';

export const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'molam_ops',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('Database connection error:', err);
});

export async function initDatabase() {
    try {
        await pool.query('SELECT 1');
        console.log('Database connection established');
    } catch (error) {
        console.error('Failed to connect to database:', error);
        throw error;
    }
}