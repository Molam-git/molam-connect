import { pool } from '../../config/database';

export async function fetchOrCreateMsisdnProfile(msisdn: string, countryCode: string): Promise<any> {
    // Normaliser le MSISDN
    const normalizedMsisdn = msisdn.startsWith('+') ? msisdn : `+${msisdn}`;

    try {
        const result = await pool.query(
            `SELECT * FROM ussd_msisdn_registry WHERE msisdn = $1 AND country_code = $2`,
            [normalizedMsisdn, countryCode]
        );

        if (result.rows.length > 0) {
            return result.rows[0];
        }

        // Créer un nouveau profil
        const currency = defaultCurrency(countryCode);
        const language = defaultLanguage(countryCode);

        // Vérifier si l'utilisateur existe dans molam_users
        const userResult = await pool.query(
            `SELECT id FROM molam_users WHERE phone_e164 = $1 LIMIT 1`,
            [normalizedMsisdn]
        );

        const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;
        const isVerified = !!userId;

        const insertResult = await pool.query(
            `INSERT INTO ussd_msisdn_registry (msisdn, country_code, user_id, language, currency, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
            [normalizedMsisdn, countryCode, userId, language, currency, isVerified]
        );

        return insertResult.rows[0];
    } catch (error) {
        console.error('Error in fetchOrCreateMsisdnProfile:', error);
        // Retourner un profil par défaut en cas d'erreur
        return {
            user_id: null,
            country_code: countryCode,
            currency: defaultCurrency(countryCode),
            language: defaultLanguage(countryCode),
            is_verified: false
        };
    }
}

function defaultCurrency(countryCode: string): string {
    const currencies: { [key: string]: string } = {
        'SN': 'XOF',
        'CI': 'XOF',
        'GH': 'GHS',
        'NG': 'NGN',
        'ML': 'XOF',
        'BF': 'XOF'
    };
    return currencies[countryCode] || 'XOF';
}

function defaultLanguage(countryCode: string): string {
    const languages: { [key: string]: string } = {
        'SN': 'fr',
        'CI': 'fr',
        'GH': 'en',
        'NG': 'en',
        'ML': 'fr',
        'BF': 'fr'
    };
    return languages[countryCode] || 'fr';
}