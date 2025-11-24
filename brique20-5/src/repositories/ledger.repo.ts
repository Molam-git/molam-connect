import { prisma } from "../infra/db.js";

export async function createLedgerEntries(params: {
    transactionId: string;
    senderWalletId: string;
    receiverWalletId: string;
    amountCents: bigint;
    feeCents: bigint;
    currency: string;
}) {
    const { transactionId, senderWalletId, receiverWalletId, amountCents, feeCents, currency } = params;

    await prisma.$transaction([
        // Debit sender (amount + fee)
        prisma.ledger_entries.create({
            data: {
                transaction_id: transactionId,
                wallet_id: senderWalletId,
                account: "CASH",
                direction: "DEBIT",
                amount_cents: amountCents + feeCents,
                currency
            }
        }),

        // Credit receiver (amount)
        prisma.ledger_entries.create({
            data: {
                transaction_id: transactionId,
                wallet_id: receiverWalletId,
                account: "CASH",
                direction: "CREDIT",
                amount_cents: amountCents,
                currency
            }
        }),

        // Credit revenue ledger (fee)
        prisma.revenue_ledger.create({
            data: {
                transaction_id: transactionId,
                source: "P2P_VIRTUAL",
                amount_cents: feeCents,
                currency
            }
        })
    ]);
}