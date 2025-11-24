import { pool } from '../src/config/database';

async function checkDatabase() {
    try {
        console.log('🔍 Vérification base de données...');

        // Test connexion
        const client = await pool.connect();
        console.log('✅ Base de données connectée');

        // Vérifier tables Brique 3
        const tables = ['molam_topups', 'molam_payment_providers', 'molam_kyc_limits'];

        for (const table of tables) {
            const result = await client.query(
                `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
                [table]
            );
            console.log(result.rows[0].exists ? `✅ Table ${table} existe` : `❌ Table ${table} manquante`);
        }

        client.release();
        console.log('🎯 Vérification terminée');

    } catch (error) {
        console.error('💥 Erreur:', error);
    }
}

checkDatabase();