import { Pool } from 'pg';

// Configuration de la base de test
export const testDb = new Pool({
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    database: process.env.TEST_DB_NAME || 'molam_pay_test',
    user: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
});

// Types pour les données de test
interface TestRewardRule {
    id: string;
    name: string;
    kind: 'cashback' | 'points' | 'voucher';
    country_code?: string;
    currency?: string;
    channel?: string;
    percent?: number;
    fixed_amount?: number;
    cap_per_tx?: number;
    daily_user_cap?: number;
    start_at: Date;
    end_at?: Date;
    is_active: boolean;
}

interface TestUser {
    id: string;
    country_code: string;
    currency: string;
}

// Données de test réutilisables
export const TEST_USERS: { [key: string]: TestUser } = {
    basic: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        country_code: 'US',
        currency: 'USD'
    },
    european: {
        id: '123e4567-e89b-12d3-a456-426614174001',
        country_code: 'FR',
        currency: 'EUR'
    }
};

export const TEST_RULES: { [key: string]: TestRewardRule } = {
    cashbackUS: {
        id: '223e4567-e89b-12d3-a456-426614174000',
        name: 'Cashback US 2%',
        kind: 'cashback',
        country_code: 'US',
        currency: 'USD',
        percent: 2.0,
        cap_per_tx: 10,
        start_at: new Date(),
        is_active: true
    },
    cashbackGlobal: {
        id: '223e4567-e89b-12d3-a456-426614174001',
        name: 'Cashback Global 1.5%',
        kind: 'cashback',
        percent: 1.5,
        start_at: new Date(),
        is_active: true
    }
};

// Fonctions utilitaires essentielles
export const TestHelpers = {
    async cleanupDatabase(): Promise<void> {
        await testDb.query(`
      TRUNCATE TABLE 
        molam_user_rewards, 
        molam_reward_ledger, 
        molam_reward_debts,
        molam_reward_rules,
        molam_system_wallets,
        molam_wallets 
      RESTART IDENTITY CASCADE;
    `);
    },

    async seedBaseData(): Promise<void> {
        // Pool système
        await testDb.query(`
      INSERT INTO molam_system_wallets (code, country_code, currency, balance)
      VALUES 
        ('rewards-pool-usd', 'US', 'USD', 100000),
        ('rewards-pool-eur', 'FR', 'EUR', 100000)
      ON CONFLICT (code) DO NOTHING;
    `);

        // Règles de base
        for (const ruleKey in TEST_RULES) {
            const rule = TEST_RULES[ruleKey];
            await testDb.query(`
        INSERT INTO molam_reward_rules 
          (id, name, kind, country_code, currency, percent, cap_per_tx, start_at, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING;
      `, [
                rule.id,
                rule.name,
                rule.kind,
                rule.country_code || null,
                rule.currency || null,
                rule.percent || null,
                rule.cap_per_tx || null,
                rule.start_at,
                rule.is_active
            ]);
        }

        // Portefeuilles utilisateurs
        await testDb.query(`
      INSERT INTO molam_wallets (user_id, currency, balance)
      VALUES 
        ($1, $2, 1000),
        ($3, $4, 1000)
      ON CONFLICT (user_id, currency) DO UPDATE SET balance = EXCLUDED.balance;
    `, [
            TEST_USERS.basic.id, TEST_USERS.basic.currency,
            TEST_USERS.european.id, TEST_USERS.european.currency
        ]);
    },

    async createTransaction(txData: {
        id: string;
        user_id: string;
        amount: number;
        currency: string;
        country_code: string;
        channel: string;
        merchant_id?: string;
        mcc?: string;
        is_fee_free?: boolean;
    }): Promise<void> {
        // Simule l'insertion d'une transaction
        console.log('Transaction créée:', txData);
    },

    async getUserRewards(userId: string): Promise<any[]> {
        const result = await testDb.query(
            'SELECT * FROM molam_user_rewards WHERE user_id = $1 ORDER BY pending_at DESC',
            [userId]
        );
        return result.rows;
    },

    async getWalletBalance(userId: string, currency: string): Promise<number> {
        const result = await testDb.query(
            'SELECT balance FROM molam_wallets WHERE user_id = $1 AND currency = $2',
            [userId, currency]
        );
        return Number(result.rows[0]?.balance || 0);
    },

    async getPoolBalance(countryCode: string, currency: string): Promise<number> {
        const result = await testDb.query(
            'SELECT balance FROM molam_system_wallets WHERE country_code = $1 AND currency = $2',
            [countryCode, currency]
        );
        return Number(result.rows[0]?.balance || 0);
    }
};

// Mocks simples sans Jest
export const MockServices = {
    siraNotify: () => Promise.resolve(undefined),
    notifyUser: () => Promise.resolve(undefined)
};

// Fonctions d'assertion pour les tests
export const TestAssertions = {
    async expectRewardStatus(rewardId: string, expectedStatus: string): Promise<void> {
        const result = await testDb.query(
            'SELECT status FROM molam_user_rewards WHERE id = $1',
            [rewardId]
        );

        if (result.rowCount === 0) {
            throw new Error(`Reward ${rewardId} not found`);
        }

        if (result.rows[0].status !== expectedStatus) {
            throw new Error(`Expected status ${expectedStatus}, got ${result.rows[0].status}`);
        }
    },

    async expectWalletBalance(userId: string, currency: string, expectedBalance: number): Promise<void> {
        const balance = await TestHelpers.getWalletBalance(userId, currency);
        if (Math.abs(balance - expectedBalance) > 0.001) {
            throw new Error(`Expected balance ${expectedBalance}, got ${balance}`);
        }
    }
};

// Setup de base pour les tests
export const setupTests = (hooks: {
    beforeAll?: (fn: () => Promise<void>) => void;
    beforeEach?: (fn: () => Promise<void>) => void;
    afterAll?: (fn: () => Promise<void>) => void;
}) => {
    if (hooks.beforeAll) {
        hooks.beforeAll(async () => {
            await TestHelpers.seedBaseData();
        });
    }

    if (hooks.beforeEach) {
        hooks.beforeEach(async () => {
            await TestHelpers.cleanupDatabase();
            await TestHelpers.seedBaseData();
        });
    }

    if (hooks.afterAll) {
        hooks.afterAll(async () => {
            await testDb.end();
        });
    }
};

export default TestHelpers;