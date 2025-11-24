import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test de la connexion
db.on('connect', () => {
    console.log('Database connected successfully');
});

db.on('error', (err) => {
    console.error('Database connection error:', err);
});