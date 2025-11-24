import { Request } from 'express';

interface ValidationResult {
    valid: boolean;
    errors?: string[];
}

export const rewardValidation = {
    validateApplyReward(data: any): ValidationResult {
        const errors: string[] = [];

        if (!data.transaction_id) errors.push('transaction_id is required');
        if (!data.user_id) errors.push('user_id is required');
        if (!data.amount || data.amount <= 0) errors.push('Valid amount is required');
        if (!data.currency) errors.push('currency is required');
        if (!data.category) errors.push('category is required');

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined
        };
    },

    validateConvertReward(data: any): ValidationResult {
        const errors: string[] = [];

        if (!data.user_id) errors.push('user_id is required');
        if (!data.reward_type || !['cashback', 'points'].includes(data.reward_type)) {
            errors.push('Valid reward_type (cashback/points) is required');
        }
        if (!data.amount || data.amount <= 0) errors.push('Valid amount is required');
        if (!data.target || !['wallet', 'voucher'].includes(data.target)) {
            errors.push('Valid target (wallet/voucher) is required');
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined
        };
    }
};