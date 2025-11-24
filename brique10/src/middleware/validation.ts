// src/middleware/validation.ts
import { Request, Response, NextFunction } from 'express';
import { CreateTopupRequest } from '../types/topup';

export const validateTopup = (req: Request, res: Response, next: NextFunction) => {
    const { operator_id, product_id, phone_number, currency }: CreateTopupRequest = req.body;

    if (!operator_id || !product_id || !phone_number || !currency) {
        return res.status(400).json({
            error: 'Missing required fields: operator_id, product_id, phone_number, currency'
        });
    }

    // Validation basique du numéro de téléphone
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phone_number)) {
        return res.status(400).json({
            error: 'Invalid phone number format. Use E.164 format: +221771234567'
        });
    }

    next();
};