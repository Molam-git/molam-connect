import { Pool } from 'pg';

// Configuration de la base de données PostgreSQL
export const db = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'molam_pay',
    max: 20, // maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test de connexion au démarrage
db.on('connect', (client) => {
    console.log('✅ Database connected successfully');
});

db.on('error', (err, client) => {
    console.error('❌ Database connection error:', err);
});

// Fonction utilitaire pour tester la connexion
export const testConnection = async () => {
    try {
        const client = await db.connect();
        console.log('✅ Database connection test passed');
        client.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection test failed:', error);
        return false;
    }
};

export default db;