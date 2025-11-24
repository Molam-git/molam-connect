// src/utils/idempotency.ts
import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';

declare global {
    namespace Express {
        interface Request {
            idempotencyKey?: string;
        }
    }
}

export const withIdempotency = () => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const idempotencyKey = req.headers['idempotency-key'] as string;

        if (!idempotencyKey) {
            return res.status(400).json({
                error: 'Idempotency-Key header required'
            });
        }

        // Check for existing request with same idempotency key
        const existing = await db.oneOrNone(
            `SELECT * FROM molam_transfers 
       WHERE sender_wallet_id = $1 AND idempotency_key = $2`,
            [req.body.sender_wallet_id, idempotencyKey]
        );

        if (existing) {
            return res.status(200).json({ transfer: existing });
        }

        req.idempotencyKey = idempotencyKey;
        next();
    };
};