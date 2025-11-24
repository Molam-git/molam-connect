import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function verifyDatabase() {
    console.log('🔍 Vérification de la base de données...\n');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: false,
    });

    try {
        const client = await pool.connect();
        console.log('✅ Connexion PostgreSQL réussie');

        // Vérifier les tables
        const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'ussd_%'
    `);

        console.log(`📊 Tables USSD: ${tables.rows.length}`);
        tables.rows.forEach(table => {
            console.log(`   - ${table.table_name}`);
        });

        // Vérifier les données essentielles
        const routes = await client.query('SELECT COUNT(*) as count FROM ussd_operator_routes');
        console.log(`📞 Routes opérateur: ${routes.rows[0].count}`);

        const profiles = await client.query('SELECT COUNT(*) as count FROM ussd_msisdn_registry');
        console.log(`📱 Profils MSISDN: ${profiles.rows[0].count}`);

        client.release();

        console.log('\n🎉 Base de données prête pour le développement!');
        console.log('💡 Pour les tests, utilisez les mocks (npm test)');

    } catch (error: any) {
        console.error('❌ Erreur de connexion:', error.message);
        console.log('\n🔧 Pour résoudre:');
        console.log('   1. Vérifiez que PostgreSQL est démarré');
        console.log('   2. Vérifiez DATABASE_URL dans .env');
        console.log('   3. Exécutez: npm run db:migrate');
    } finally {
        await pool.end();
    }
}

verifyDatabase();