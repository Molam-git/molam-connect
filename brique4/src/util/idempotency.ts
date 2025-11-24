// src/util/idempotency.ts
import { Request, Response, NextFunction } from "express";
import { db } from "./db";

export function withIdempotency() {
    return async (req: Request, res: Response, next: NextFunction) => {
        const idempotencyKey = req.headers["idempotency-key"] as string;
        if (!idempotencyKey) {
            return res.status(400).json({ error: "Idempotency-Key header required" });
        }

        // On suppose que le wallet_id est dans le body
        const wallet_id = req.body.wallet_id;
        if (!wallet_id) {
            return res.status(400).json({ error: "wallet_id is required for idempotency" });
        }

        // Vérifier si une requête avec la même clé et wallet_id existe déjà
        const existing = await db.oneOrNone(
            `SELECT * FROM molam_withdrawals WHERE wallet_id=$1 AND idempotency_key=$2`,
            [wallet_id, idempotencyKey]
        );

        if (existing) {
            return res.status(200).json({ withdrawal: existing });
        }

        // Attacher la clé d'idempotence à la requête pour l'utiliser dans la route
        req.idempotencyKey = idempotencyKey;
        next();
    };
}

declare global {
    namespace Express {
        interface Request {
            idempotencyKey?: string;
        }
    }
}