// test-docker.ts
import db from './db';
import dotenv from 'dotenv';

dotenv.config();

console.log('=== TEST CONNEXION DOCKER ===');

async function testDocker() {
    try {
        console.log('🔌 Test de connexion à la base de données Docker...');

        const result = await db.one('SELECT NOW() as time, version() as version');
        console.log('✅ Connexion réussie!');
        console.log('📅 Heure du serveur:', result.time);
        console.log('🐘 Version PostgreSQL:', result.version.split(',')[0]);

        // Test des tables
        const tables = await db.any(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

        console.log(`📊 Nombre de tables: ${tables.length}`);
        tables.forEach((table: any) => {
            console.log(`   - ${table.table_name}`);
        });

        console.log('\n🎉 ENVIRONNEMENT DOCKER FONCTIONNEL!');

    } catch (error: any) {
        console.error('❌ Erreur de connexion:', error.message);
        console.log('\n💡 Solutions:');
        console.log('   1. Vérifier que PostgreSQL Docker est démarré: docker-compose ps');
        console.log('   2. Vérifier les logs: docker-compose logs postgres');
        console.log('   3. Vérifier le port dans .env (doit être 5433)');
    }
}

testDocker();