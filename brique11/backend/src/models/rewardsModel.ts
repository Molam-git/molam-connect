import { db } from '../config/database';

export interface Reward {
    id: string;
    type: 'cashback' | 'voucher' | 'points';
    name: { [key: string]: string };
    description?: { [key: string]: string };
    reward_value: number;
    currency: string;
    percentage?: number;
    min_transaction?: number;
    max_reward?: number;
    valid_from: Date;
    valid_until?: Date;
    is_active: boolean;
    sponsor?: string;
    category?: string;
}

export interface UserReward {
    id: string;
    reward_id: string;
    user_id: string;
    transaction_id?: string;
    amount: number;
    currency: string;
    status: 'pending' | 'confirmed' | 'used' | 'expired' | 'cancelled';
    created_at: Date;
    confirmed_at?: Date;
    used_at?: Date;
    expired_at?: Date;
}

export interface Voucher {
    id: string;
    reward_id: string;
    code: string;
    value: number;
    currency: string;
    user_id?: string;
    is_redeemed: boolean;
    redeemed_at?: Date;
    valid_until?: Date;
}

export const rewardsModel = {
    async getActiveRewards(userId?: string, category?: string, currency: string = 'USD'): Promise<Reward[]> {
        const query = `
      SELECT * FROM molam_rewards 
      WHERE is_active = true 
        AND valid_from <= NOW() 
        AND (valid_until IS NULL OR valid_until >= NOW())
        AND currency = $1
        ${category ? 'AND category = $2' : ''}
      ORDER BY created_at DESC
    `;

        const params = category ? [currency, category] : [currency];
        const result = await db.query(query, params);
        return result.rows;
    },

    async createUserReward(userReward: Omit<UserReward, 'id' | 'created_at'>): Promise<UserReward> {
        const query = `
      INSERT INTO molam_user_rewards 
      (reward_id, user_id, transaction_id, amount, currency, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

        const result = await db.query(query, [
            userReward.reward_id,
            userReward.user_id,
            userReward.transaction_id,
            userReward.amount,
            userReward.currency,
            userReward.status
        ]);

        return result.rows[0];
    },

    async getUserRewardsBalance(userId: string): Promise<{
        cashback: string;
        vouchers: any[];
        points: number;
    }> {
        // Cashback confirmed et non utilisé
        const cashbackQuery = `
      SELECT COALESCE(SUM(amount), 0) as total, currency
      FROM molam_user_rewards 
      WHERE user_id = $1 
        AND status = 'confirmed'
        AND reward_id IN (SELECT id FROM molam_rewards WHERE type = 'cashback')
      GROUP BY currency
    `;

        // Vouchers non utilisés
        const vouchersQuery = `
      SELECT v.*, r.name as reward_name
      FROM molam_vouchers v
      JOIN molam_rewards r ON v.reward_id = r.id
      WHERE v.user_id = $1 
        AND v.is_redeemed = false
        AND (v.valid_until IS NULL OR v.valid_until >= NOW())
    `;

        // Points de fidélité
        const pointsQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_points
      FROM molam_user_rewards 
      WHERE user_id = $1 
        AND status = 'confirmed'
        AND reward_id IN (SELECT id FROM molam_rewards WHERE type = 'points')
    `;

        const [cashbackResult, vouchersResult, pointsResult] = await Promise.all([
            db.query(cashbackQuery, [userId]),
            db.query(vouchersQuery, [userId]),
            db.query(pointsQuery, [userId])
        ]);

        const cashback = cashbackResult.rows.length > 0
            ? `${cashbackResult.rows[0].total} ${cashbackResult.rows[0].currency}`
            : '0.00 USD';

        return {
            cashback,
            vouchers: vouchersResult.rows,
            points: parseInt(pointsResult.rows[0]?.total_points) || 0
        };
    },

    async updateUserRewardStatus(rewardId: string, status: UserReward['status']): Promise<void> {
        const query = `
      UPDATE molam_user_rewards 
      SET status = $1, 
          ${status === 'confirmed' ? 'confirmed_at = NOW()' : ''}
          ${status === 'used' ? 'used_at = NOW()' : ''}
          ${status === 'expired' ? 'expired_at = NOW()' : ''}
      WHERE id = $2
    `;

        await db.query(query, [status, rewardId]);
    },

    async getPendingRewards(): Promise<UserReward[]> {
        const query = `
      SELECT ur.* 
      FROM molam_user_rewards ur
      JOIN molam_wallet_transactions wt ON wt.id = ur.transaction_id
      WHERE ur.status = 'pending'
        AND NOW() - ur.created_at > interval '24 hours'
        AND wt.status = 'completed'
    `;

        const result = await db.query(query);
        return result.rows;
    },

    async useVoucher(code: string, userId: string): Promise<Voucher> {
        const query = `
      UPDATE molam_vouchers 
      SET is_redeemed = true, redeemed_at = NOW(), user_id = $1
      WHERE code = $2 AND is_redeemed = false
      RETURNING *
    `;

        const result = await db.query(query, [userId, code]);
        if (result.rows.length === 0) {
            throw new Error('Voucher not found or already used');
        }

        return result.rows[0];
    }
};