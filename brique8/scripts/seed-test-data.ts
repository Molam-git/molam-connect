import { pool } from '../src/config/database';
import dotenv from 'dotenv';

dotenv.config();

async function seedTestData() {
    console.log('🌱 Insertion des données de test...');

    try {
        // Insérer les routes opérateurs si elles n'existent pas
        const routesCount = await pool.query('SELECT COUNT(*) FROM ussd_operator_routes');
        if (parseInt(routesCount.rows[0].count) === 0) {
            await pool.query(`
        INSERT INTO ussd_operator_routes (country_code, operator, short_code, callback_secret, status) VALUES
        ('SN', 'orange', '*131#', 'test-secret-key', 'active'),
        ('SN', 'orange', '*131*1#', 'test-secret-key', 'active'),
        ('SN', 'orange', '*131*2#', 'test-secret-key', 'active'),
        ('SN', 'orange', '*131*3#', 'test-secret-key', 'active')
      `);
            console.log('✅ Routes opérateurs insérées');
        } else {
            console.log('✅ Routes opérateurs déjà présentes');
        }

        // Insérer un utilisateur de test si il n'existe pas
        const userCount = await pool.query('SELECT COUNT(*) FROM molam_users WHERE phone_e164 = $1', ['+221770000000']);
        if (parseInt(userCount.rows[0].count) === 0) {
            await pool.query(`
        INSERT INTO molam_users (id, phone_e164, pin_hash, currency, language) VALUES
        ('123e4567-e89b-12d3-a456-426614174000', '+221770000000', '$argon2id$v=19$m=65536,t=3,p=4$somesalt$somehash', 'XOF', 'fr')
      `);
            console.log('✅ Utilisateur de test inséré');
        } else {
            console.log('✅ Utilisateur de test déjà présent');
        }

        // Insérer un profil MSISDN de test si il n'existe pas
        const profileCount = await pool.query('SELECT COUNT(*) FROM ussd_msisdn_registry WHERE msisdn = $1', ['+221770000000']);
        if (parseInt(profileCount.rows[0].count) === 0) {
            await pool.query(`
        INSERT INTO ussd_msisdn_registry (msisdn, country_code, user_id, language, currency, is_verified) VALUES
        ('+221770000000', 'SN', '123e4567-e89b-12d3-a456-426614174000', 'fr', 'XOF', true)
      `);
            console.log('✅ Profil MSISDN de test inséré');
        } else {
            console.log('✅ Profil MSISDN de test déjà présent');
        }

        console.log('🎉 Données de test prêtes');
    } catch (error) {
        console.error('❌ Erreur lors de l\'insertion des données de test:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

seedTestData();