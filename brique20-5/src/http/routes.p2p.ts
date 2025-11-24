import { Router } from "express";
import { z } from "zod";
import { p2pTransfer } from "../services/p2p.service.js";
import { acquireIdempotency, completeIdempotency } from "../repositories/idempotency.repo.js";
import { authenticateToken, requireKYC, rateLimit } from "./middlewares.js";
import { findUserById } from "../repositories/users.repo.js";
import { fromMinorUnits } from "../domain/currency.js";
import { getCurrencyMeta } from "../repositories/fees.repo.js";
import { log } from "../infra/logger.js";

export const router = Router();

const transferBodySchema = z.object({
    receiver_handle: z.object({
        type: z.enum(["phone", "email", "molam_id"]),
        value: z.string().min(1)
    }),
    amount: z.object({
        currency: z.string().length(3),
        value: z.string().regex(/^\d+(\.\d{1,6})?$/)
    }),
    note: z.string().max(120).optional(),
    client_context: z.object({
        device_id: z.string().optional(),
        ip: z.string().optional(),
        app_version: z.string().optional()
    }).optional()
});

router.post(
    "/api/pay/p2p/transfer",
    authenticateToken,
    requireKYC('P1'),
    rateLimit(),
    async (req, res) => {
        const startTime = Date.now();

        try {
            // Validate idempotency key
            const idempotencyKey = req.header("Idempotency-Key");
            if (!idempotencyKey) {
                return res.status(400).json({ error: "missing_idempotency_key" });
            }

            // Validate request body
            const parsed = transferBodySchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    error: "invalid_request_body",
                    details: parsed.error.errors
                });
            }

            const { receiver_handle, amount, note, client_context } = parsed.data;

            // Resolve receiver user ID
            const receiverUserId = await resolveHandleToUserId(receiver_handle);
            if (!receiverUserId) {
                return res.status(422).json({ error: "receiver_not_found" });
            }

            // Prevent self-transfer
            if (receiverUserId === req.user!.sub) {
                return res.status(422).json({ error: "self_transfer_not_allowed" });
            }

            // Check if receiver exists and is active
            const receiverUser = await findUserById(receiverUserId);
            if (!receiverUser || !receiverUser.is_active) {
                return res.status(422).json({ error: "receiver_not_available" });
            }

            // Acquire idempotency lock
            const idempotency = await acquireIdempotency(
                req.user!.sub,
                "p2p_transfer",
                idempotencyKey,
                req.body
            );

            if (!idempotency.ok && idempotency.conflict) {
                return res.status(409).json({ error: "idempotency_conflict" });
            }

            // Execute P2P transfer
            const result = await p2pTransfer({
                senderUserId: req.user!.sub,
                receiverUserId,
                amountValue: amount.value,
                currency: amount.currency,
                note,
                deviceId: client_context?.device_id,
                ip: client_context?.ip,
                country: req.user!.country,
                kycLevel: req.user!.kyc_level,
                reversibleWindowSec: process.env.P2P_REVERSIBLE_WINDOW_SEC ?
                    parseInt(process.env.P2P_REVERSIBLE_WINDOW_SEC) : undefined
            });

            // Complete idempotency record
            if (idempotency.record?.id && 'transaction_id' in result) {
                await completeIdempotency(idempotency.record.id, result.transaction_id);
            }

            // Handle pending review case
            if (result.status === "PENDING_REVIEW") {
                log.info("P2P transfer pending review", {
                    transaction_id: 'transaction_id' in result ? result.transaction_id : undefined,
                    sender_user_id: req.user!.sub,
                    receiver_user_id: receiverUserId,
                    reason: result.reason
                });

                return res.status(202).json({
                    status: result.status,
                    reason: result.reason
                });
            }

            // Prepare response for successful transfer
            const currencyMeta = await getCurrencyMeta(amount.currency);
            if (!currencyMeta) {
                throw new Error("currency_metadata_not_found");
            }

            const response = {
                transaction_id: result.transaction_id,
                status: "SUCCEEDED" as const,
                amount: {
                    currency: amount.currency,
                    value: fromMinorUnits(result.credited_amount, currencyMeta.minor_units)
                },
                fee: {
                    currency: amount.currency,
                    value: fromMinorUnits(result.fee, currencyMeta.minor_units)
                },
                debited_total: {
                    currency: amount.currency,
                    value: fromMinorUnits(result.debited_total, currencyMeta.minor_units)
                },
                credited_amount: {
                    currency: amount.currency,
                    value: fromMinorUnits(result.credited_amount, currencyMeta.minor_units)
                },
                sender_wallet_id: req.user!.sub, // This would be the actual wallet ID in production
                receiver_wallet_id: receiverUserId, // This would be the actual wallet ID in production
                created_at: new Date().toISOString(),
                reversible_until: result.reversible_until?.toISOString()
            };

            log.info("P2P transfer succeeded", {
                transaction_id: result.transaction_id,
                sender_user_id: req.user!.sub,
                receiver_user_id: receiverUserId,
                amount: amount.value,
                currency: amount.currency,
                fee: response.fee.value,
                duration_ms: Date.now() - startTime
            });

            return res.status(201).json(response);

        } catch (error: any) {
            log.error("P2P transfer failed", {
                error: error.message,
                sender_user_id: req.user?.sub,
                duration_ms: Date.now() - startTime
            });

            const errorResponse = handleServiceError(error);
            return res.status(errorResponse.status).json({ error: errorResponse.message });
        }
    }
);

// Helper function to resolve user handle to user ID
async function resolveHandleToUserId(handle: { type: "phone" | "email" | "molam_id"; value: string }): Promise<string | null> {
    // Stub implementation - in production this would query your identity service
    if (handle.type === "molam_id") {
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(handle.value)) {
            const user = await findUserById(handle.value);
            return user?.id || null;
        }
    }

    // For phone/email, you would query a dedicated identities table
    // This is a simplified version that expects molam_id for now
    return null;
}

// Error handling mapping
function handleServiceError(error: any): { status: number; message: string } {
    const errorMap: Record<string, { status: number; message: string }> = {
        unsupported_currency: { status: 400, message: "unsupported_currency" },
        invalid_amount: { status: 400, message: "invalid_amount" },
        wallet_not_found: { status: 422, message: "wallet_not_found" },
        wallet_inactive: { status: 422, message: "wallet_inactive" },
        insufficient_funds: { status: 422, message: "insufficient_funds" },
        daily_limit_exceeded: { status: 422, message: "daily_limit_exceeded" },
        monthly_limit_exceeded: { status: 422, message: "monthly_limit_exceeded" },
        limits_violation: { status: 422, message: "transfer_limits_exceeded" },
        currency_metadata_not_found: { status: 500, message: "internal_error" }
    };

    return errorMap[error.message] || { status: 500, message: "internal_error" };
}