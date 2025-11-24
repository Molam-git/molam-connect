import { db } from '../config/database';
import { Queue, Worker } from 'bullmq';
import { notifyRewardConfirmed } from '../services/notificationService';

// Simuler BullMQ si non installé
const createMockQueue = () => ({
    add: async () => console.log('Mock queue add called'),
    process: () => console.log('Mock queue process called')
});

export const confirmRewardsQueue = process.env.REDIS_HOST ?
    new Queue('confirm_rewards', {
        connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379')
        }
    }) : createMockQueue() as any;

export const confirmRewardsWorker = process.env.REDIS_HOST ?
    new Worker('confirm_rewards',
        async (job) => {
            console.log('🔍 Processing pending rewards confirmation...');

            try {
                const pendingRewards = await db.query(`
          SELECT ur.id, ur.user_id, ur.amount, ur.currency, ur.transaction_id
          FROM molam_user_rewards ur
          JOIN molam_wallet_transactions wt ON wt.id = ur.transaction_id
          WHERE ur.status = 'pending'
          AND NOW() - ur.created_at > interval '24 hours'
          AND wt.status = 'completed'
        `);

                console.log(`📊 Found ${pendingRewards.rows.length} pending rewards to confirm`);

                for (const reward of pendingRewards.rows) {
                    try {
                        await db.query('BEGIN');

                        // Marquer comme confirmé
                        await db.query(
                            `UPDATE molam_user_rewards SET status='confirmed', confirmed_at=NOW()
               WHERE id=$1`,
                            [reward.id]
                        );

                        // Vérifier le type de récompense
                        const rewardTypeResult = await db.query(
                            'SELECT type FROM molam_rewards WHERE id = (SELECT reward_id FROM molam_user_rewards WHERE id = $1)',
                            [reward.id]
                        );

                        const rewardType = rewardTypeResult.rows[0]?.type;

                        // Pour le cashback, créditer le wallet
                        if (rewardType === 'cashback') {
                            // Créditer le wallet utilisateur
                            await db.query(
                                `UPDATE molam_wallets SET balance = balance + $1 
                 WHERE user_id = $2 AND currency = $3`,
                                [reward.amount, reward.user_id, reward.currency]
                            );

                            // Débiter le pool de récompenses
                            const poolId = reward.currency === 'USD' ? 'reward-pool-usd' : 'reward-pool-xof';
                            await db.query(
                                `UPDATE molam_wallets SET balance = balance - $1 
                 WHERE id = $2 AND currency = $3`,
                                [reward.amount, poolId, reward.currency]
                            );

                            // Ledger record
                            await db.query(
                                `INSERT INTO molam_wallet_transactions
                 (id, origin_user_id, destination_user_id, origin_module, destination_module,
                  method, transaction_type, amount, currency, status, reference_code, created_at, completed_at)
                 VALUES (gen_random_uuid(), $1, $2, 'rewards', 'wallet', 'system',
                         'reward_credit', $3, $4, 'completed', $5, NOW(), NOW())`,
                                [poolId, reward.user_id, reward.amount, reward.currency, `REWARD-${Date.now()}`]
                            );
                        }

                        await db.query('COMMIT');

                        // Notification utilisateur
                        await notifyRewardConfirmed(reward.user_id, reward.amount, reward.currency);

                        console.log(`✅ Reward ${reward.id} confirmed for user ${reward.user_id}`);

                    } catch (error) {
                        await db.query('ROLLBACK');
                        console.error(`❌ Failed to confirm reward ${reward.id}:`, error);
                    }
                }

                return { processed: pendingRewards.rows.length };
            } catch (error) {
                console.error('❌ Error in confirm rewards worker:', error);
                throw error;
            }
        },
        {
            connection: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379')
            }
        }
    ) : {
        // Mock worker si Redis n'est pas configuré
        on: (event: string, handler: Function) => {
            if (event === 'completed') console.log('Mock worker completed event');
            if (event === 'failed') console.log('Mock worker failed event');
        }
    } as any;

// Fonction pour démarrer le worker manuellement (pour les tests)
export const processPendingRewards = async () => {
    console.log('🔄 Processing pending rewards manually...');

    const pendingRewards = await db.query(`
    SELECT ur.id, ur.user_id, ur.amount, ur.currency, ur.transaction_id
    FROM molam_user_rewards ur
    JOIN molam_wallet_transactions wt ON wt.id = ur.transaction_id
    WHERE ur.status = 'pending'
    AND NOW() - ur.created_at > interval '24 hours'
    AND wt.status = 'completed'
  `);

    for (const reward of pendingRewards.rows) {
        try {
            await db.query('BEGIN');

            await db.query(
                `UPDATE molam_user_rewards SET status='confirmed', confirmed_at=NOW()
         WHERE id=$1`,
                [reward.id]
            );

            await db.query('COMMIT');

            console.log(`✅ Manually confirmed reward ${reward.id}`);
        } catch (error) {
            await db.query('ROLLBACK');
            console.error(`❌ Failed to manually confirm reward ${reward.id}:`, error);
        }
    }

    return { processed: pendingRewards.rows.length };
};