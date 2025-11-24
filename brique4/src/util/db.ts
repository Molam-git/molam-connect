// src/util/db.ts
import pgPromise from 'pg-promise';
import * as dotenv from 'dotenv';

dotenv.config();

const pgp = pgPromise({
    capSQL: true,
    query: (e) => {
        if (process.env.NODE_ENV === 'development') {
            console.log('QUERY:', e.query);
        }
    },
    error: (err, e) => {
        console.error('DB Error:', err);
    }
});

// Configuration basée sur ton .env
const cn = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    database: process.env.DB_NAME || 'molam_pay',
    user: process.env.DB_USER || 'molam_user',
    password: process.env.DB_PASSWORD || 'molam_password_secure',
    max: 30,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
};

export const db = pgp(cn);

// Test de connexion
db.connect()
    .then(obj => {
        console.log('✅ Database connected successfully to', process.env.DB_NAME);
        obj.done();
    })
    .catch(error => {
        console.error('❌ Database connection error:', error.message);
    });