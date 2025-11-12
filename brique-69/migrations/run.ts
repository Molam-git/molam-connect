import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🚀 Running analytics database migrations...');

    const migrations = [
      '001_create_analytics_tables.sql',
    ];

    for (const migration of migrations) {
      console.log(`\n📝 Running migration: ${migration}`);
      const sql = readFileSync(join(__dirname, migration), 'utf-8');

      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('COMMIT');
        console.log(`✅ Migration ${migration} completed successfully`);
      } catch (error) {
        await pool.query('ROLLBACK');
        console.error(`❌ Migration ${migration} failed:`, error);
        throw error;
      }
    }

    console.log('\n✨ All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
