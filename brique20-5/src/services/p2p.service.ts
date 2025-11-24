import { prisma } from "../infra/db.js";
import { findWalletByUserAndCurrency } from "../repositories/wallets.repo.js";
import { getCurrencyMeta } from "../repositories/fees.repo.js";
import { computeP2PFee } from "../domain/fees.js";
import { siraPreAuthorize } from "../domain/sira.js";
import { checkP2PLimits } from "../domain/limits.js";
import { createLedgerEntries } from "../repositories/ledger.repo.js";
import { kafka } from "../infra/kafka.js";
import { log } from "../infra/logger.js";
import { p2pSuccess, p2pPendingReview, p2pFailures, p2pLatency } from "../infra/metrics.js";
import { toMinorUnits, fromMinorUnits } from "../domain/currency.js";

export type P2PInput = {
    senderUserId: string;
    receiverUserId: string;
    amountValue: string;
    currency: string;
    note?: string;
    deviceId?: string;
    ip?: string;
    country?: string;
    kycLevel?: string;
    reversibleWindowSec?: number;
};

export async function p2pTransfer(input: P2PInput) {
    const startTime = Date.now();

    try {
        // Get currency metadata
        const currency = await getCurrencyMeta(input.currency);
        if (!currency) {
            p2pFailures.inc({ reason: 'unsupported_currency' });
            throw new Error("unsupported_currency");
        }

        // Convert amount to minor units
        const amountCents = toMinorUnits(input.amountValue, currency.minor_units);
        if (amountCents <= BigInt(0)) {
            p2pFailures.inc({ reason: 'invalid_amount' });
            throw new Error("invalid_amount");
        }

        // Check limits
        const limitsCheck = await checkP2PLimits({
            userId: input.senderUserId,
            currency: input.currency,
            amountCents,
            country: input.country,
            kycLevel: input.kycLevel
        });

        if (!limitsCheck.ok) {
            p2pFailures.inc({ reason: limitsCheck.reason || 'limits_violation' });
            throw new Error(limitsCheck.reason || "limits_violation");
        }

        // SIRA pre-authorization
        const siraDecision = await siraPreAuthorize({
            senderUserId: input.senderUserId,
            receiverUserId: input.receiverUserId,
            amountCents,
            currency: input.currency,
            deviceId: input.deviceId,
            ip: input.ip,
            country: input.country
        });

        if (!siraDecision.allow) {
            await kafka.publish("pay.p2p.flagged", {
                input,
                reason: siraDecision.reason,
                risk: siraDecision.risk,
                score: siraDecision.score
            });

            p2pPendingReview.inc();
            return { status: "PENDING_REVIEW" as const, reason: siraDecision.reason };
        }

        // Fetch wallets
        const senderWallet = await findWalletByUserAndCurrency(input.senderUserId, input.currency);
        const receiverWallet = await findWalletByUserAndCurrency(input.receiverUserId, input.currency);

        if (!senderWallet || !receiverWallet) {
            p2pFailures.inc({ reason: 'wallet_not_found' });
            throw new Error("wallet_not_found");
        }

        if (senderWallet.status !== 'ACTIVE' || receiverWallet.status !== 'ACTIVE') {
            p2pFailures.inc({ reason: 'wallet_inactive' });
            throw new Error("wallet_inactive");
        }

        // Calculate fee
        const feeCents = await computeP2PFee({
            feeType: "P2P_VIRTUAL",
            country: input.country,
            currency: input.currency,
            kycLevel: input.kycLevel,
            amountCents,
            minorUnits: currency.minor_units
        });

        const totalDebit = amountCents + feeCents;

        // Execute atomic transaction
        const result = await prisma.$transaction(async (tx) => {
            // Lock wallets in consistent order to prevent deadlocks
            const walletIds = [senderWallet.id, receiverWallet.id].sort();
            await tx.$executeRawUnsafe(`SELECT * FROM molam_wallets WHERE id = $1 FOR UPDATE`, walletIds[0]);
            await tx.$executeRawUnsafe(`SELECT * FROM molam_wallets WHERE id = $1 FOR UPDATE`, walletIds[1]);

            // Re-check sender balance after lock
            const lockedSender = await tx.molam_wallets.findUnique({
                where: { id: senderWallet.id }
            });

            if (!lockedSender || BigInt(lockedSender.balance_cents) < totalDebit) {
                throw new Error("insufficient_funds");
            }

            // Create transaction record
            const transactionId = crypto.randomUUID();
            const reversibleUntil = input.reversibleWindowSec
                ? new Date(Date.now() + input.reversibleWindowSec * 1000)
                : null;

            await tx.wallet_transactions.create({
                data: {
                    id: transactionId,
                    type: "P2P_VIRTUAL",
                    status: "SUCCEEDED",
                    sender_wallet_id: senderWallet.id,
                    receiver_wallet_id: receiverWallet.id,
                    amount_cents: amountCents,
                    fee_cents: feeCents,
                    currency: input.currency,
                    note: input.note,
                    reversible_until: reversibleUntil
                }
            });

            // Update balances
            await tx.molam_wallets.update({
                where: { id: senderWallet.id },
                data: { balance_cents: BigInt(lockedSender.balance_cents) - totalDebit }
            });

            await tx.molam_wallets.update({
                where: { id: receiverWallet.id },
                data: { balance_cents: BigInt(receiverWallet.balance_cents) + amountCents }
            });

            // Create ledger entries
            await createLedgerEntries({
                transactionId,
                senderWalletId: senderWallet.id,
                receiverWalletId: receiverWallet.id,
                amountCents,
                feeCents,
                currency: input.currency
            });

            return {
                transaction_id: transactionId,
                debited_total: totalDebit,
                credited_amount: amountCents,
                fee: feeCents,
                reversible_until: reversibleUntil
            };
        }, {
            maxWait: 5000,
            timeout: 10000
        });

        // Emit success event
        await kafka.publish("pay.p2p.succeeded", {
            transaction_id: result.transaction_id,
            sender_wallet_id: senderWallet.id,
            receiver_wallet_id: receiverWallet.id,
            amount_cents: amountCents.toString(),
            fee_cents: feeCents.toString(),
            currency: input.currency,
            timestamp: new Date().toISOString()
        });

        p2pSuccess.inc();
        p2pLatency.observe(Date.now() - startTime);

        return {
            status: "SUCCEEDED" as const,
            ...result
        };

    } catch (error: any) {
        p2pFailures.inc({ reason: error.message || 'unknown' });
        p2pLatency.observe(Date.now() - startTime);
        throw error;
    }
}