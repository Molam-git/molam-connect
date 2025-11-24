import { RequestHandler } from "express";
import { db } from "./db";

declare global {
    namespace Express {
        interface Request {
            idempotencyKey?: string;
        }
    }
}

export const withIdempotency = (): RequestHandler => {
    return async (req: any, res, next) => {
        const key = (req.headers["idempotency-key"] || "").toString();
        if (!key) {
            return res.status(400).json({ error: "Idempotency-Key header required" });
        }

        // Check if request with same idempotency key exists for this wallet
        if (req.body.wallet_id) {
            const existing = await db.oneOrNone(
                `SELECT * FROM molam_topups WHERE wallet_id = $1 AND idempotency_key = $2`,
                [req.body.wallet_id, key]
            );

            if (existing) {
                return res.status(200).json({ topup: existing });
            }
        }

        req.idempotencyKey = key;
        next();
    };
};