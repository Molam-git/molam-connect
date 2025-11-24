import { Pool } from 'pg';

export const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Test de la connexion
pool.on('connect', () => {
    console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('PostgreSQL pool error', err);
});