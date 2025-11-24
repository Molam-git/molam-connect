import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Parser l'URL de la base de données
const parseDatabaseUrl = (url: string): PoolConfig => {
    try {
        const parsedUrl = new URL(url);
        return {
            host: parsedUrl.hostname,
            port: parseInt(parsedUrl.port),
            user: parsedUrl.username,
            password: parsedUrl.password,
            database: parsedUrl.pathname.split('/')[1],
            ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
        };
    } catch (error) {
        console.error('Error parsing DATABASE_URL:', error);
        throw error;
    }
};

const dbConfig: PoolConfig = process.env.DATABASE_URL
    ? parseDatabaseUrl(process.env.DATABASE_URL)
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5433'),
        user: process.env.DB_USER || 'molam_user',
        password: process.env.DB_PASSWORD || 'molam_password_secure',
        database: process.env.DB_NAME || 'molam_pay',
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
    };

dbConfig.max = 20;
dbConfig.idleTimeoutMillis = 30000;
dbConfig.connectionTimeoutMillis = 5000;

export const pool = new Pool(dbConfig);

// Test de connexion amélioré
export const testConnection = async (): Promise<boolean> => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as current_time');
        console.log('✅ Database connected successfully at:', result.rows[0].current_time);
        client.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        return false;
    }
};

// Fonction pour exécuter les scripts SQL
export const runSQLFile = async (filePath: string): Promise<void> => {
    const client = await pool.connect();
    try {
        const fs = await import('fs');
        const path = await import('path');

        const sql = fs.readFileSync(path.resolve(filePath), 'utf8');
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`✅ SQL file executed successfully: ${filePath}`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ Error executing SQL file ${filePath}:`, error);
        throw error;
    } finally {
        client.release();
    }
};