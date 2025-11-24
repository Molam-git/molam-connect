import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { requireAuth, requireScope } from "../security/authz";
import { db } from "../util/db";
import { v4 as uuid } from "uuid";
import { withIdempotency } from "../util/idempotency";
import { verifyWebhook } from "../util/crypto";
import { siraEvaluateTopup } from "../sira/service";
import { enqueueReconcile } from "../workers/reconcile";
import { TopupCreateRequest, TopupResponse } from "../types/topup";

// Étendre l'interface Request pour inclure nos propriétés personnalisées
declare global {
    namespace Express {
        interface Request {
            idempotencyKey?: string;
            device?: any;
            user?: {
                sub: string;
                type: "external" | "internal";
                roles: string[];
                permissions: string[];
            };
        }
    }
}

const router = Router();

/**
 * Create topup intent
 */
router.post(
    "/api/pay/topups",
    requireAuth(),
    requireScope("pay.topup:create"),
    [
        body("wallet_id").isUUID(),
        body("channel").isIn(["mobile_money", "card", "agent", "crypto"]),
        body("country_code").isLength({ min: 2, max: 2 }),
        body("currency").isLength({ min: 3, max: 3 }),
        body("amount").isFloat({ gt: 0 }),
        body("provider_hint").optional().isString(),
        body("metadata").optional().isObject(),
    ],
    withIdempotency(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            wallet_id,
            channel,
            country_code,
            currency,
            amount,
            provider_hint,
            metadata = {}
        }: TopupCreateRequest = req.body;

        const user_id = req.user!.sub;

        try {
            // 1) Verify wallet ownership and KYC level
            const user = await db.one(
                `SELECT u.id, u.kyc_level, w.currency, w.id as w_id 
         FROM molam_users u
         JOIN molam_wallets w ON w.user_id = u.id 
         WHERE u.id=$1 AND w.id=$2`,
                [user_id, wallet_id]
            );

            // 2) Check KYC limits
            const limits = await db.oneOrNone(
                `SELECT * FROM molam_kyc_limits 
         WHERE country_code=$1 AND currency=$2 AND kyc_level=$3`,
                [country_code, currency, user.kyc_level || "P0"]
            );

            if (!limits) {
                return res.status(400).json({ error: "KYC limits not configured for this country/currency" });
            }

            if (Number(amount) > Number(limits.per_tx_max)) {
                return res.status(403).json({
                    error: "Amount exceeds per-transaction limit for your KYC level",
                    limit: limits.per_tx_max
                });
            }

            // 3) Check daily limits
            const dailyTotal = await db.oneOrNone(
                `SELECT COALESCE(SUM(amount), 0) as total
         FROM molam_topups 
         WHERE user_id=$1 AND status='succeeded' 
         AND created_at >= CURRENT_DATE`,
                [user_id]
            );

            if (Number(dailyTotal.total) + Number(amount) > Number(limits.daily_max)) {
                return res.status(403).json({
                    error: "Amount would exceed daily limit for your KYC level",
                    daily_remaining: Number(limits.daily_max) - Number(dailyTotal.total)
                });
            }

            // 4) Select active provider
            const provider = await db.one(
                `SELECT * FROM molam_payment_providers
         WHERE type=$1 AND country_code=$2 AND currency=$3 AND active=TRUE
         AND ($4::text IS NULL OR name=$4) 
         ORDER BY created_at DESC LIMIT 1`,
                [channel, country_code, currency, provider_hint || null]
            );

            // 5) Calculate fees
            const conf = provider.config as any;
            const fee_pct = conf.fee_pct ?? 0;
            const fee_fixed = conf.fee_fixed ?? 0;
            const fee_amount = Math.round((Number(amount) * fee_pct + fee_fixed) * 100) / 100;

            // 6) SIRA risk assessment
            const sira = await siraEvaluateTopup({
                user_id,
                wallet_id,
                amount: Number(amount),
                currency,
                channel,
                country_code,
                device: req.device
            });

            if (sira.decision === "block") {
                return res.status(403).json({
                    error: "Topup blocked by risk engine",
                    reason: sira.reason
                });
            }

            // 7) Create topup record
            const reference = `TP-${Date.now()}-${uuid().slice(0, 8)}`;
            const topup = await db.one(
                `INSERT INTO molam_topups
         (user_id, wallet_id, provider_id, channel, country_code, currency, 
          amount, fee_amount, status, reference, idempotency_key, initiated_via, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'created',$9,$10,$11,$12)
         RETURNING *`,
                [
                    user_id, wallet_id, provider.id, channel, country_code, currency,
                    amount, fee_amount, reference, req.idempotencyKey!,
                    req.headers["x-client-via"] as string || "app", metadata
                ]
            );

            // 8) Initialize payment with provider (async)
            setTimeout(async () => {
                try {
                    await initializeProviderPayment(topup, provider, metadata);
                } catch (error) {
                    console.error('Provider payment initialization failed:', error);
                    await db.none(
                        `UPDATE molam_topups SET status='failed', updated_at=NOW() WHERE id=$1`,
                        [topup.id]
                    );
                }
            }, 0);

            return res.status(201).json({
                topup,
                risk_review: sira.decision === "review" ? {
                    required: true,
                    reason: sira.reason,
                    estimated_time: "2-4 hours"
                } : { required: false }
            });

        } catch (error) {
            console.error('Topup creation error:', error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
);

/**
 * Webhook for provider callbacks
 */
router.post("/api/pay/topups/webhook/:providerName", verifyWebhook(), async (req: Request, res: Response) => {
    const providerName = req.params.providerName;
    const payload = req.body;

    try {
        // 1) Resolve provider
        const provider = await db.one(
            `SELECT * FROM molam_payment_providers WHERE name=$1 LIMIT 1`,
            [providerName]
        );

        // 2) Find topup by reference
        const topup = await db.oneOrNone(
            `SELECT * FROM molam_topups WHERE reference=$1 LIMIT 1`,
            [payload.reference]
        );

        if (!topup) {
            // Store orphan event for investigation
            await db.none(
                `INSERT INTO molam_topup_events (topup_id, event_type, raw_payload, signature_valid)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
                ['provider.unknown', payload, true]
            );
            return res.status(202).json({ status: "accepted" });
        }

        // 3) Store webhook event
        await db.none(
            `INSERT INTO molam_topup_events (topup_id, event_type, raw_payload, signature_valid)
       VALUES ($1, $2, $3, $4)`,
            [topup.id, `provider.${payload.status}`, payload, true]
        );

        // 4) Process status update
        if (payload.status === "succeeded") {
            const succeeded = await db.one(
                `UPDATE molam_topups 
         SET status='succeeded', metadata = metadata || $2::jsonb, updated_at=NOW()
         WHERE id=$1 AND status IN ('pending','created') 
         RETURNING *`,
                [topup.id, JSON.stringify({ provider_tx: payload.tx_id, settled_at: new Date() })]
            );

            // Post to ledger (double-entry)
            await db.tx(async (t: { none: (arg0: string, arg1: any[]) => any; }) => {
                await t.none(`SELECT post_topup_ledger($1)`, [succeeded.id]);

                // Update wallet balance
                await t.none(
                    `UPDATE molam_wallets SET balance = balance + $1, updated_at=NOW() WHERE id=$2`,
                    [succeeded.amount, succeeded.wallet_id]
                );

                // Audit log
                await t.none(
                    `INSERT INTO molam_audit_logs (user_id, action, target_id, module, details)
           VALUES ($1,'topup_succeeded',$2,'pay',$3)`,
                    [succeeded.user_id, succeeded.id, JSON.stringify({
                        reference: succeeded.reference,
                        amount: succeeded.amount,
                        currency: succeeded.currency
                    })]
                );
            });

            // Trigger reconciliation
            await enqueueReconcile(succeeded.provider_id);

        } else if (payload.status === "failed" || payload.status === "cancelled") {
            await db.none(
                `UPDATE molam_topups SET status=$2, updated_at=NOW()
         WHERE id=$1 AND status IN ('pending','created')`,
                [topup.id, payload.status]
            );
        }

        return res.status(200).json({ ok: true });

    } catch (error) {
        console.error('Webhook processing error:', error);
        return res.status(500).json({ error: "Webhook processing failed" });
    }
});

/**
 * Get topup by id
 */
router.get("/api/pay/topups/:id", requireAuth(), async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const topup = await db.oneOrNone(
            `SELECT * FROM molam_topups WHERE id=$1`,
            [id]
        );

        if (!topup) {
            return res.status(404).json({ error: "Topup not found" });
        }

        // External users can only see their own topups
        if (req.user!.type === "external" && topup.user_id !== req.user!.sub) {
            return res.status(403).json({ error: "Forbidden" });
        }

        res.json({ topup });

    } catch (error) {
        console.error('Get topup error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * List user's topups
 */
router.get("/api/pay/topups", requireAuth(), async (req: Request, res: Response) => {
    const { limit = 50, offset = 0 } = req.query;
    const user_id = req.user!.sub;

    try {
        let query = `SELECT * FROM molam_topups WHERE user_id=$1`;
        let countQuery = `SELECT COUNT(*) FROM molam_topups WHERE user_id=$1`;
        const params: any[] = [user_id];

        // Admins can filter by any user
        if (req.user!.type === "internal" && req.query.user_id) {
            query += ` AND user_id=$${params.length + 1}`;
            countQuery += ` AND user_id=$${params.length + 1}`;
            params.push(req.query.user_id);
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit as string), parseInt(offset as string));

        const topups = await db.manyOrNone(query, params);
        const total = await db.one(countQuery, [user_id]);

        res.json({
            topups,
            pagination: {
                limit: Number(limit),
                offset: Number(offset),
                total: Number(total.count)
            }
        });

    } catch (error) {
        console.error('List topups error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

async function initializeProviderPayment(topup: any, provider: any, metadata: any) {
    // Provider-specific payment initialization
    // This would integrate with the provider adapter pattern
    const providerPayload = {
        reference: topup.reference,
        amount: topup.amount,
        currency: topup.currency,
        msisdn: metadata.msisdn,
        card_token: metadata.card_token,
        agent_id: metadata.agent_id,
        callback_url: `${process.env.API_BASE_URL}/api/pay/topups/webhook/${provider.name}`
    };

    // Call provider SDK based on provider type
    // const result = await providerAdapter.createPayment(provider, providerPayload);

    // Update topup status based on provider response
    await db.none(
        `UPDATE molam_topups SET status='pending', updated_at=NOW() WHERE id=$1`,
        [topup.id]
    );
}

export default router;