import { body, param } from 'express-validator';

export const cashinValidation = [
    param('agentId').isUUID().withMessage('Invalid agent ID'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    body('currency').isString().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
    body('otp').isString().isLength({ min: 4, max: 6 }).withMessage('OTP must be 4-6 characters')
];