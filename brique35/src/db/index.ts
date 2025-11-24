import { Pool } from 'pg';

// Configuration simple de la base de données
export const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'molam_payouts',
    user: process.env.DB_USER || 'molam',
    password: process.env.DB_PASSWORD || 'molam_password',
    max: 20,
});

// Test de connexion au démarrage
export async function initDB() {
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
}

// Fermeture propre
export async function closeDB() {
    await pool.end();
}