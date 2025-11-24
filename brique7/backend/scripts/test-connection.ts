// scripts/test-connection.ts
import { Client } from 'pg';

async function testConnection() {
    console.log('🧪 Test de connexion PostgreSQL...\n');

    const client = new Client({
        host: 'localhost',
        port: 5433,
        database: 'molam_pay',
        user: 'molam_user',
        password: 'molam_password_secure',
    });

    try {
        await client.connect();
        console.log('✅ Connexion réussie!');

        // Test de requête simple
        const timeResult = await client.query('SELECT NOW() as current_time');
        console.log('⏰ Heure du serveur:', timeResult.rows[0].current_time);

        // Vérifier les tables
        const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
        console.log('📋 Nombre de tables:', tablesResult.rows.length);

        await client.end();
        console.log('\n🎉 Tous les tests passent! La base est prête.');

    } catch (error: any) {
        console.log('❌ Erreur de connexion:', error.message);
    }
}

testConnection();