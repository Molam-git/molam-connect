import { testConnection, pool } from '../src/config/database';
import fs from 'fs';
import path from 'path';

async function initializeBrique3() {
    const client = await pool.connect();

    try {
        console.log('🚀 Initialisation sélective de la Brique 3...');

        // Vérifier la connexion
        const isConnected = await testConnection();
        if (!isConnected) {
            throw new Error('Cannot connect to database');
        }

        await client.query('BEGIN');

        // 1. Vérifier si les tables de la Brique 3 existent déjà
        const checkTableExists = async (tableName: string): Promise<boolean> => {
            const result = await client.query(
                `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
                [tableName]
            );
            return result.rows[0].exists;
        };

        console.log('📋 Vérification des tables existantes...');

        const tablesToCheck = [
            'molam_payment_providers',
            'molam_provider_accounts',
            'molam_topups',
            'molam_topup_events',
            'molam_kyc_limits'
        ];

        const existingTables = [];
        for (const table of tablesToCheck) {
            if (await checkTableExists(table)) {
                existingTables.push(table);
            }
        }

        if (existingTables.length > 0) {
            console.log('⚠️  Tables déjà existantes:', existingTables.join(', '));
            console.log('📝 Mise à jour des structures existantes...');
        }

        // 2. Exécuter le script SQL principal (utilise CREATE IF NOT EXISTS)
        const sqlContent = fs.readFileSync(
            path.join(__dirname, '../sql/003_topups.sql'),
            'utf8'
        );
        await client.query(sqlContent);
        console.log('✅ Structure des tables Brique 3 initialisée');

        // 3. Exécuter la fonction de ledger
        const functionContent = fs.readFileSync(
            path.join(__dirname, '../sql/003_fn_post_topup.sql'),
            'utf8'
        );
        await client.query(functionContent);
        console.log('✅ Fonction ledger Brique 3 initialisée');

        // 4. Vérifier et insérer seulement les données manquantes
        await insertMissingData(client);

        await client.query('COMMIT');
        console.log('🎉 Initialisation Brique 3 terminée avec succès!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur lors de l\'initialisation Brique 3:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function insertMissingData(client: any) {
    console.log('🔍 Vérification des données manquantes...');

    // Vérifier et insérer seulement les données qui n'existent pas
    const queries = [
        // Limites KYC pour Sénégal
        {
            name: 'Limites KYC Sénégal',
            check: `SELECT COUNT(*) FROM molam_kyc_limits WHERE country_code = 'SN' AND currency = 'XOF'`,
            insert: `
        INSERT INTO molam_kyc_limits (country_code, currency, kyc_level, per_tx_max, daily_max, monthly_max) VALUES 
        ('SN', 'XOF', 'P0', 50000, 200000, 1000000),
        ('SN', 'XOF', 'P1', 200000, 1000000, 5000000),
        ('SN', 'XOF', 'P2', 1000000, 5000000, 20000000)
        ON CONFLICT (country_code, currency, kyc_level) DO NOTHING;
      `
        },
        // Limites KYC pour Côte d'Ivoire
        {
            name: 'Limites KYC Côte d\'Ivoire',
            check: `SELECT COUNT(*) FROM molam_kyc_limits WHERE country_code = 'CI' AND currency = 'XOF'`,
            insert: `
        INSERT INTO molam_kyc_limits (country_code, currency, kyc_level, per_tx_max, daily_max, monthly_max) VALUES 
        ('CI', 'XOF', 'P0', 50000, 200000, 1000000),
        ('CI', 'XOF', 'P1', 200000, 1000000, 5000000)
        ON CONFLICT (country_code, currency, kyc_level) DO NOTHING;
      `
        }
    ];

    for (const query of queries) {
        const result = await client.query(query.check);
        const count = parseInt(result.rows[0].count);

        if (count === 0) {
            await client.query(query.insert);
            console.log(`✅ ${query.name} insérées`);
        } else {
            console.log(`⏭️  ${query.name} déjà existantes (${count} enregistrements)`);
        }
    }
}

// Exécution conditionnelle
if (require.main === module) {
    initializeBrique3()
        .then(() => {
            console.log('🎊 Brique 3 initialisée avec succès!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Échec de l\'initialisation Brique 3:', error);
            process.exit(1);
        });
}

export { initializeBrique3 };