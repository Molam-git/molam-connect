// src/routes/withdrawals.ts
import { Router, Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import { requireAuth, requireScope } from "../security/authz";
import { db } from "../util/db";
import { v4 as uuid } from "uuid";
import { withIdempotency } from "../util/idempotency";
import { signProviderCreate, verifyWebhook } from "../util/crypto";
import { siraEvaluateWithdrawal } from "../sira/service";
import { enqueueBatchBuild, enqueueReconcile } from "../workers/payouts";

// Extension directe de l'interface Request
declare module 'express' {
    interface Request {
        device?: any;
        idempotencyKey?: string;
        user?: {
            sub: string;
            type: 'external' | 'internal';
            scopes: string[];
        };
    }
}

const r = Router();

// Middleware simple de détection d'appareil directement dans le routeur
const deviceDetection = (req: Request, res: Response, next: NextFunction) => {
    req.device = {
        ip: req.ip || (req.connection as any).remoteAddress,
        userAgent: req.get('User-Agent') || 'unknown',
        type: req.get('User-Agent')?.toLowerCase().match(/mobile/) ? 'mobile' : 'desktop'
    };
    next();
};

// Appliquer le middleware device à toutes les routes de ce router
r.use(deviceDetection);

/**
 * Create withdrawal intent
 */
r.post(
    "/api/pay/withdrawals",
    requireAuth(),
    requireScope("pay.withdraw:create"),
    body("wallet_id").isUUID(),
    body("channel").isIn(["mobile_money", "bank", "agent"]),
    body("country_code").isLength({ min: 2, max: 2 }),
    body("currency").isLength({ min: 3, max: 3 }),
    body("amount").isFloat({ gt: 0 }),
    body("provider_hint").optional().isString(),
    body("metadata").optional().isObject(), // msisdn/iban/benef_name/agent_id...
    withIdempotency(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { wallet_id, channel, country_code, currency, amount, provider_hint, metadata = {} } = req.body;
        const user_id = req.user!.sub;

        try {
            // 1) KYC & wallet ownership
            const row = await db.one(
                `SELECT u.id AS user_id, u.kyc_level, w.id AS wallet_id, w.balance, w.currency
         FROM molam_users u JOIN molam_wallets w ON w.user_id=u.id
         WHERE u.id=$1 AND w.id=$2`,
                [user_id, wallet_id]
            );

            // 2) Enforce KYC limits
            const limits = await db.oneOrNone(
                `SELECT * FROM molam_kyc_limits WHERE country_code=$1 AND currency=$2 AND kyc_level=$3`,
                [country_code, currency, row.kyc_level || "P0"]
            );
            if (!limits) return res.status(400).json({ error: "KYC limits not configured" });
            if (Number(amount) > Number(limits.per_tx_max)) {
                return res.status(403).json({ error: "Amount exceeds per-transaction limit for your KYC level" });
            }

            // 3) Sufficient funds (principal + expected fee)
            // Fee compute (simple; real formula from provider.config)
            const provider = await db.one(
                `SELECT * FROM molam_payout_providers
         WHERE type=$1 AND country_code=$2 AND currency=$3 AND active=TRUE
         AND ($4::text IS NULL OR name=$4) ORDER BY created_at DESC LIMIT 1`,
                [channel, country_code, currency, provider_hint || null]
            );
            const conf = provider.config as any;
            const fee_pct = conf.fee_pct ?? 0;
            const fee_fixed = conf.fee_fixed ?? 0;
            const fee_amount = Math.round((Number(amount) * fee_pct + fee_fixed) * 100) / 100;
            const total_deduct = Number(amount) + fee_amount;

            if (Number(row.balance) < total_deduct) {
                return res.status(400).json({ error: "Insufficient balance" });
            }

            // 4) SIRA (risk)
            const sira = await siraEvaluateWithdrawal({
                user_id, wallet_id, amount: Number(amount), currency, channel, country_code, device: req.device
            });
            if (sira.decision === "block") {
                return res.status(403).json({ error: "Withdrawal blocked by risk engine", reason: sira.reason });
            }

            // 5) Insert record (created)
            const reference = `WD-${Date.now()}-${uuid().slice(0, 8)}`;
            const wd = await db.one(
                `INSERT INTO molam_withdrawals
         (user_id, wallet_id, provider_id, channel, country_code, currency, amount, fee_amount, status, reference, idempotency_key, initiated_via, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'created',$9,$10,$11,$12)
         ON CONFLICT (wallet_id, idempotency_key) DO UPDATE SET updated_at=NOW()
         RETURNING *`,
                [user_id, wallet_id, provider.id, channel, country_code, currency, amount, fee_amount, reference, req.idempotencyKey, req.headers["x-client-via"] || "app", metadata]
            );

            // 6) Bank withdrawals may be queued to batch (weekly/monthly) to reduce fees
            if (channel === "bank") {
                // mark as queued immediately; batch worker will submit later
                const scheduled = await db.one(
                    `UPDATE molam_withdrawals SET status='queued', updated_at=NOW() WHERE id=$1 RETURNING *`,
                    [wd.id]
                );
                await enqueueBatchBuild(provider.id, currency);
                return res.status(201).json({ withdrawal: scheduled, batching: true });
            }

            // 7) For mobile_money/agent: call provider now
            const providerPayload = {
                reference,
                amount,
                currency,
                msisdn: metadata.msisdn,  // mobile money
                agent_id: metadata.agent_id,
                beneficiary: metadata.beneficiary
            };
            const signed = await signProviderCreate(provider, providerPayload);
            // call provider adapter here...

            const pending = await db.one(
                `UPDATE molam_withdrawals SET status='pending', updated_at=NOW() WHERE id=$1 RETURNING *`,
                [wd.id]
            );

            return res.status(201).json({ withdrawal: pending });

        } catch (error: any) {
            console.error("Withdrawal creation error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
);

/**
 * Provider webhook for withdrawals
 */
r.post("/api/pay/withdrawals/webhook/:providerName", verifyWebhook(), async (req: Request, res: Response) => {
    const providerName = req.params.providerName;
    const payload = req.body;

    try {
        const provider = await db.one(`SELECT * FROM molam_payout_providers WHERE name=$1 LIMIT 1`, [providerName]);
        const wd = await db.oneOrNone(`SELECT * FROM molam_withdrawals WHERE reference=$1`, [payload.reference]);

        if (!wd) {
            await db.none(
                `INSERT INTO molam_withdrawal_events (withdrawal_id, event_type, raw_payload, signature_valid)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
                ['provider.unknown', payload, true]
            );
            return res.status(202).json({ status: "accepted" });
        }

        await db.none(
            `INSERT INTO molam_withdrawal_events (withdrawal_id, event_type, raw_payload, signature_valid)
       VALUES ($1,$2,$3,$4)`,
            [wd.id, `provider.${payload.status}`, payload, true]
        );

        if (payload.status === "succeeded") {
            const succeeded = await db.one(
                `UPDATE molam_withdrawals SET status='succeeded', metadata = metadata || $2::jsonb, updated_at=NOW()
         WHERE id=$1 AND status IN ('pending','processing','queued','created') RETURNING *`,
                [wd.id, JSON.stringify({ provider_tx: payload.tx_id })]
            );

            await db.tx(async (t: any) => {
                await t.none(`SELECT post_withdrawal_ledger($1)`, [succeeded.id]);

                // Optional denormalized balance
                await t.none(
                    `UPDATE molam_wallets SET balance = balance - $1 WHERE id=$2`,
                    [succeeded.amount + succeeded.fee_amount, succeeded.wallet_id]
                );

                await t.none(
                    `INSERT INTO molam_audit_logs (user_id, action, target_id, module, details)
           VALUES ($1,'withdrawal_succeeded',$2,'pay',$3)`,
                    [succeeded.user_id, succeeded.id, JSON.stringify({ reference: succeeded.reference })]
                );
            });
        } else if (payload.status === "failed" || payload.status === "cancelled") {
            await db.oneOrNone(
                `UPDATE molam_withdrawals SET status=$2, updated_at=NOW()
         WHERE id=$1 AND status IN ('pending','processing','queued','created') RETURNING id`,
                [wd.id, payload.status]
            );
        }

        return res.status(200).json({ ok: true });

    } catch (error: any) {
        console.error("Webhook processing error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * Read one withdrawal (user/self or admin)
 */
r.get("/api/pay/withdrawals/:id", requireAuth(), async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const row = await db.oneOrNone(`SELECT * FROM molam_withdrawals WHERE id=$1`, [id]);
        if (!row) return res.status(404).json({ error: "Not found" });
        if (req.user!.type === "external" && row.user_id !== req.user!.sub) {
            return res.status(403).json({ error: "Forbidden" });
        }
        res.json({ withdrawal: row });
    } catch (error: any) {
        console.error("Get withdrawal error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default r;