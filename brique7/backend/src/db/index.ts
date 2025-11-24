import { Pool } from 'pg';

// Configuration avec valeurs par défaut
const config = {
    user: process.env.DB_USER || 'molam_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'molam_pay',
    password: process.env.DB_PASSWORD || 'molam_password_secure',
    port: parseInt(process.env.DB_PORT || '5433'),
};

console.log('🔧 Configuration DB finale:');
console.log('   Host:', config.host);
console.log('   Port:', config.port);
console.log('   Database:', config.database);
console.log('   User:', config.user);
console.log('   Password:', config.password ? '***' + config.password.slice(-3) : 'UNDEFINED');

export const pool = new Pool(config);

// Test de connexion
export async function testConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as time');
        console.log('✅ Connexion DB réussie!');
        client.release();
        return true;
    } catch (error: any) {
        console.log('❌ Échec connexion DB:', error.message);
        return false;
    }
}