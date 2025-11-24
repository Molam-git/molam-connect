// db/migrate.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import db from './index';

async function runMigrations() {
  console.log('🔄 Démarrage des migrations Molam Pay...');
  console.log('📦 Connexion à la base de données...');

  try {
    // Test de connexion
    const test = await db.one('SELECT NOW() as time');
    console.log('✅ Connecté à la base de données:', test.time);

    const migrationFiles = [

      '002_wallet_transactions.sql'
    ];

    for (const file of migrationFiles) {
      try {
        console.log(`\n📦 Exécution de la migration: ${file}`);
        const filePath = join(__dirname, 'migrations', file);
        const sql = readFileSync(filePath, 'utf8');

        await db.none(sql);
        console.log(`✅ Migration ${file} terminée avec succès`);

      } catch (error: any) {
        // Gestion spécifique pour les migrations déjà appliquées
        if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
          console.log(`⚠️  Migration ${file} déjà appliquée (ignorée)`);
        } else {
          console.error(`❌ Échec de la migration ${file}:`, error.message);
          throw error;
        }
      }
    }

    console.log('\n🎉 Toutes les migrations terminées avec succès!');

    // Vérification finale
    const tables = await db.any(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📊 Tables créées:');
    tables.forEach((table: any) => {
      console.log(`   - ${table.table_name}`);
    });

  } catch (error: any) {
    console.error('\n❌ Erreur lors des migrations:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Conseil:');
      console.log('   - Vérifiez que PostgreSQL est démarré: docker-compose ps');
      console.log('   - Vérifiez les paramètres de connexion dans .env');
    }

    process.exit(1);
  }
}

runMigrations().catch(console.error);