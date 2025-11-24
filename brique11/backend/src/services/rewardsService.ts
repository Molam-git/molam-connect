import { rewardsModel } from '../models/rewardsModel';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';

interface ApplyRewardRequest {
    transaction_id: string;
    user_id: string;
    amount: number;
    currency: string;
    category: string;
}

interface ConvertRewardRequest {
    user_id: string;
    reward_type: 'cashback' | 'points';
    amount: number;
    target: 'wallet' | 'voucher';
}

export const rewardsService = {
    async getActiveRewards(userId?: string, category?: string, currency: string = 'USD') {
        return rewardsModel.getActiveRewards(userId, category, currency);
    },

    async applyRewardToTransaction(data: ApplyRewardRequest) {
        const { transaction_id, user_id, amount, currency, category } = data;

        // Trouver les récompenses éligibles
        const eligibleRewards = await rewardsModel.getActiveRewards(user_id, category, currency);

        let appliedReward = null;

        for (const reward of eligibleRewards) {
            // Vérifier le montant minimum de transaction
            if (reward.min_transaction && amount < reward.min_transaction) {
                continue;
            }

            let rewardAmount = 0;

            if (reward.type === 'cashback' && reward.percentage) {
                rewardAmount = (amount * reward.percentage) / 100;

                // Appliquer le plafond maximum
                if (reward.max_reward && rewardAmount > reward.max_reward) {
                    rewardAmount = reward.max_reward;
                }
            } else if (reward.type === 'points') {
                rewardAmount = reward.reward_value;
            }

            if (rewardAmount > 0) {
                // Créer la récompense utilisateur
                const userReward = await rewardsModel.createUserReward({
                    reward_id: reward.id,
                    user_id,
                    transaction_id,
                    amount: rewardAmount,
                    currency: reward.currency || currency,
                    status: 'pending'
                });

                appliedReward = {
                    reward_id: userReward.id,
                    amount: `${rewardAmount.toFixed(2)} ${reward.currency || currency}`,
                    type: reward.type
                };

                // Pour les points, confirmer immédiatement
                if (reward.type === 'points') {
                    await rewardsModel.updateUserRewardStatus(userReward.id, 'confirmed');
                }

                break; // Appliquer une seule récompense pour l'instant
            }
        }

        if (!appliedReward) {
            return { status: 'no_reward_applied' };
        }

        return {
            status: 'reward_assigned',
            ...appliedReward
        };
    },

    async getUserRewardsBalance(userId: string) {
        return rewardsModel.getUserRewardsBalance(userId);
    },

    async convertReward(data: ConvertRewardRequest) {
        const { user_id, reward_type, amount, target } = data;

        await db.query('BEGIN');

        try {
            if (reward_type === 'cashback' && target === 'wallet') {
                // Vérifier le solde disponible
                const balanceQuery = `
          SELECT COALESCE(SUM(amount), 0) as available
          FROM molam_user_rewards 
          WHERE user_id = $1 
            AND status = 'confirmed'
            AND reward_id IN (SELECT id FROM molam_rewards WHERE type = 'cashback')
        `;

                const balanceResult = await db.query(balanceQuery, [user_id]);
                const availableBalance = parseFloat(balanceResult.rows[0].available);

                if (availableBalance < amount) {
                    throw new Error('Insufficient cashback balance');
                }

                // Marquer le cashback comme utilisé
                const updateQuery = `
          UPDATE molam_user_rewards 
          SET status = 'used', used_at = NOW(), converted_at = NOW()
          WHERE user_id = $1 
            AND status = 'confirmed'
            AND reward_id IN (SELECT id FROM molam_rewards WHERE type = 'cashback')
          RETURNING id, amount, currency
        `;

                const updateResult = await db.query(updateQuery, [user_id]);

                // Créditer le wallet utilisateur
                const walletUpdateQuery = `
          UPDATE molam_wallets 
          SET balance = balance + $1
          WHERE user_id = $2 AND currency = $3
        `;

                // Débiter le pool de récompenses
                const poolUpdateQuery = `
          UPDATE molam_wallets 
          SET balance = balance - $1
          WHERE id = $2 AND currency = $3
        `;

                const currency = updateResult.rows[0]?.currency || 'USD';
                const poolId = currency === 'USD' ? 'reward-pool-usd' : 'reward-pool-xof';

                await db.query(walletUpdateQuery, [amount, user_id, currency]);
                await db.query(poolUpdateQuery, [amount, poolId, currency]);

                // Enregistrer dans le ledger
                const ledgerQuery = `
          INSERT INTO molam_wallet_transactions 
          (id, origin_user_id, destination_user_id, origin_module, destination_module,
           method, transaction_type, amount, currency, status, reference_code)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;

                await db.query(ledgerQuery, [
                    uuidv4(),
                    poolId, // origin (reward pool)
                    user_id, // destination
                    'rewards',
                    'wallet',
                    'system',
                    'reward_credit',
                    amount,
                    currency,
                    'completed',
                    `CASHBACK-CONV-${Date.now()}`
                ]);

                await db.query('COMMIT');

                return {
                    status: 'converted',
                    wallet_credit: `${amount} ${currency}`,
                    conversion_date: new Date().toISOString()
                };
            }

            // Conversion points → voucher
            if (reward_type === 'points' && target === 'voucher') {
                // Logique de conversion points vers voucher
                // (à implémenter selon les règles métier)
                await db.query('COMMIT');

                return {
                    status: 'converted',
                    voucher_created: true,
                    points_used: amount
                };
            }

            throw new Error('Unsupported conversion type');

        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
    },

    async useVoucher(userId: string, voucherCode: string) {
        const voucher = await rewardsModel.useVoucher(voucherCode, userId);

        // Appliquer la valeur du voucher au wallet utilisateur
        const walletUpdateQuery = `
      UPDATE molam_wallets 
      SET balance = balance + $1
      WHERE user_id = $2 AND currency = $3
    `;

        await db.query(walletUpdateQuery, [voucher.value, userId, voucher.currency]);

        return {
            status: 'voucher_used',
            voucher_value: `${voucher.value} ${voucher.currency}`,
            used_at: new Date().toISOString()
        };
    }
};