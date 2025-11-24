import { Request, Response } from 'express';
import { rewardsService } from '../services/rewardsService';
import { rewardValidation } from '../middleware/rewardValidation';

export const rewardsController = {
    // 1) Liste des récompenses actives
    async getActiveRewards(req: Request, res: Response) {
        try {
            const { user_id, category, currency } = req.query;
            const rewards = await rewardsService.getActiveRewards(
                user_id as string,
                category as string,
                currency as string
            );
            res.json(rewards);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch active rewards' });
        }
    },

    // 2) Attribution automatique lors d'une transaction
    async applyReward(req: Request, res: Response) {
        try {
            const validation = rewardValidation.validateApplyReward(req.body);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.errors });
            }

            const result = await rewardsService.applyRewardToTransaction(req.body);
            res.json(result);
        } catch (error) {
            console.error('Apply reward error:', error);
            res.status(500).json({ error: 'Failed to apply reward' });
        }
    },

    // 3) Consultation du solde de récompenses
    async getRewardsBalance(req: Request, res: Response) {
        try {
            const { user_id } = req.query;
            if (!user_id) {
                return res.status(400).json({ error: 'user_id is required' });
            }

            const balance = await rewardsService.getUserRewardsBalance(user_id as string);
            res.json(balance);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch rewards balance' });
        }
    },

    // 4) Conversion des récompenses
    async convertRewards(req: Request, res: Response) {
        try {
            const validation = rewardValidation.validateConvertReward(req.body);
            if (!validation.valid) {
                return res.status(400).json({ validation, Error });
            }

            const result = await rewardsService.convertReward(req.body);
            res.json(result);
        } catch (error) {
            console.error('Convert reward error:', error);
            res.status(500).json({ error: 'Failed to convert reward' });
        }
    },

    // 5) Utilisation d'un voucher
    async useVoucher(req: Request, res: Response) {
        try {
            const { user_id, voucher_code } = req.body;
            if (!user_id || !voucher_code) {
                return res.status(400).json({ error: 'user_id and voucher_code are required' });
            }

            const result = await rewardsService.useVoucher(user_id, voucher_code);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: 'Failed to use voucher' });
        }
    }
};