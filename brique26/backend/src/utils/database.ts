import { Pool, PoolConfig } from 'pg';

// Configuration de la base de données
const dbConfig: PoolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'molam',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    max: 20, // maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

// Création du pool de connexions
export const pool = new Pool(dbConfig);

// Helper pour exécuter des transactions
export async function withTransaction<T>(
    callback: (client: any) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// Helper pour les requêtes avec timeout
export async function queryWithTimeout(
    text: string,
    params: any[] = [],
    timeoutMs: number = 10000
) {
    const client = await pool.connect();
    try {
        await client.query(`SET statement_timeout = ${timeoutMs}`);
        const result = await client.query(text, params);
        return result;
    } finally {
        client.release();
    }
}

// Health check de la base de données
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; error?: string }> {
    try {
        const result = await pool.query('SELECT NOW() as current_time');
        return { healthy: true };
    } catch (error: any) {
        return { healthy: false, error: error.message };
    }
}

// Initialisation des données de base
export async function initializeFloatData(): Promise<void> {
    try {
        // Vérifier si des données existent déjà
        const { rows } = await pool.query('SELECT COUNT(*) as count FROM float_entities');

        if (parseInt(rows[0].count) === 0) {
            console.log('Initializing default float entities...');

            // Insérer des entités par défaut (exemple)
            await pool.query(`
        INSERT INTO float_entities (entity_type, ref_id, country, currency, display_name, status) VALUES
        ('bank', 'bank_sn_001', 'SN', 'XOF', 'Bank SN Principal', 'active'),
        ('bank', 'bank_sn_002', 'SN', 'XOF', 'Bank SN Secondaire', 'active'),
        ('agent', 'agent_dakar_001', 'SN', 'XOF', 'Agent Dakar Centre', 'active'),
        ('agent', 'agent_dakar_002', 'SN', 'XOF', 'Agent Dakar Plateau', 'active'),
        ('mmo', 'mmo_sn_001', 'SN', 'XOF', 'Pool MMO SN', 'active')
      `);

            // Appliquer des règles par défaut
            const rulesManager = new (await import('../sira/rules')).RulesManager(pool);
            const { rows: entities } = await pool.query('SELECT id, entity_type FROM float_entities');

            for (const entity of entities) {
                await rulesManager.applyDefaultRules(entity.id, entity.entity_type, 'XOF');
            }

            console.log('Default float data initialized successfully');
        }
    } catch (error) {
        console.error('Error initializing float data:', error);
        throw error;
    }
}