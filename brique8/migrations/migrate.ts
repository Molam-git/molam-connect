import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function runMigrations() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: false,
    });

    try {
        console.log('🔧 Début des migrations...');

        // Lire le fichier SQL
        const migrationPath = path.join(__dirname, '001_create_ussd_tables.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Exécuter la migration
        await pool.query(sql);
        console.log('✅ Migrations exécutées avec succès');

        // Vérifier les tables créées
        const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'ussd_%'
    `);

        console.log('📊 Tables créées:', result.rows.map(row => row.table_name));

    } catch (error) {
        console.error('❌ Erreur lors des migrations:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();