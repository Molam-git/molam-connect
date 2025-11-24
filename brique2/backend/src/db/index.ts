// db/index.ts
import pgPromise from 'pg-promise';
import dotenv from 'dotenv';

dotenv.config();

const pgp = pgPromise({
    capSQL: true,
    query: (e) => {
        if (process.env.NODE_ENV === 'development') {
            console.log('SQL:', e.query);
        }
    },
    error: (err, e) => {
        if (e.cn) {
            console.error('CN:', e.cn);
            console.error('EVENT:', err.message || err);
        }
    }
});

const connection = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    database: process.env.DB_NAME || 'molam_pay',
    user: process.env.DB_USER || 'molam_user',
    password: process.env.DB_PASSWORD || 'password',
    max: 30,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

// Test de connexion
const db = pgp(connection);

// Test de la connexion au démarrage
db.connect()
    .then(obj => {
        console.log('✅ Connected to PostgreSQL database:', obj.client.database);
        obj.done();
    })
    .catch(error => {
        console.error('❌ Database connection error:', error);
    });

// Extensions utiles pour pg-promise
export const helpers = pgp.helpers;

// Types pour TypeScript
export interface IDatabase {
    none: (query: string, values?: any[]) => Promise<void>;
    one: <T>(query: string, values?: any[]) => Promise<T>;
    oneOrNone: <T>(query: string, values?: any[]) => Promise<T | null>;
    many: <T>(query: string, values?: any[]) => Promise<T[]>;
    any: <T>(query: string, values?: any[]) => Promise<T[]>;
    result: (query: string, values?: any[]) => Promise<any>;
    task: <T>(callback: (t: any) => Promise<T>) => Promise<T>;
    tx: <T>(callback: (t: any) => Promise<T>) => Promise<T>;
}

export default db;